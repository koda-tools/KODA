import { realpath } from "node:fs/promises";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { ContentBlock } from "@agentclientprotocol/sdk";
import { isWithinWorkspace } from "../session/session.js";
import { safeDescription } from "./permissions.js";

const MAX_PROMPT_BYTES = 128 * 1024;

const encoder = new TextEncoder();
const byteLength = (text: string): number => encoder.encode(text).length;

/** Caminho relativo ao workspace, com "." para a própria raiz. */
const displayPath = (root: string, path: string): string =>
  relative(root, path) || ".";

/**
 * Resolve uma URI `file:` para um caminho real, ou `undefined` se a URI
 * não for um arquivo local resolvível. Nunca lança.
 */
async function tryResolveFileUri(uri: string): Promise<string | undefined> {
  try {
    const url = new URL(uri);
    if (url.protocol !== "file:") return undefined;
    return await realpath(fileURLToPath(url));
  } catch {
    // URIs de outro SO ou caminhos inexistentes: o chamador usa só o rótulo.
    return undefined;
  }
}

/** Como `tryResolveFileUri`, mas exige um arquivo dentro do workspace. */
async function resolveWorkspaceFile(uri: string, root: string): Promise<string> {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    throw new Error(`Invalid resource URI: ${safeDescription(uri)}`);
  }
  if (url.protocol !== "file:")
    throw new Error("Only file resources are supported.");

  const path = await realpath(fileURLToPath(url));
  if (!isWithinWorkspace(root, path))
    throw new Error("Resource is outside this session's workspace.");
  return path;
}

async function describeResourceLink(
  block: Extract<ContentBlock, { type: "resource_link" }>,
  root: string,
): Promise<string> {
  // Um link é uma referência, não permissão de leitura: só expomos o caminho
  // local se ele resolver dentro do workspace desta sessão.
  const path = await tryResolveFileUri(block.uri);
  return path && isWithinWorkspace(root, path)
    ? `Referenced file: ${displayPath(root, path)}`
    : `Referenced resource: ${safeDescription(block.name)}`;
}

async function embedResource(
  block: Extract<ContentBlock, { type: "resource" }>,
  root: string,
): Promise<string | undefined> {
  if (!("text" in block.resource)) return undefined;
  const path = await resolveWorkspaceFile(block.resource.uri, root);
  return `Context from ${displayPath(root, path)}:\n${block.resource.text}`;
}

async function blockToText(
  block: ContentBlock,
  root: string,
): Promise<string> {
  switch (block.type) {
    case "text":
      return block.text;
    case "resource_link":
      return describeResourceLink(block, root);
    case "resource": {
      const text = await embedResource(block, root);
      if (text !== undefined) return text;
      break;
    }
  }
  throw new Error(`Unsupported ACP prompt content: ${block.type}.`);
}

/** Only explicit, bounded prompt content enters the Core conversation. */
export async function promptText(
  blocks: readonly ContentBlock[],
  root: string,
): Promise<string> {
  const pieces: string[] = [];
  let bytes = 0;

  for (const block of blocks) {
    const text = await blockToText(block, root);
    bytes += byteLength(text);
    if (bytes > MAX_PROMPT_BYTES)
      throw new Error("ACP prompt exceeds the 128 KiB context limit.");
    pieces.push(text);
  }

  const prompt = pieces.join("\n").trim();
  if (prompt === "")
    throw new Error("ACP prompt must contain text or a file reference.");
  return prompt;
}