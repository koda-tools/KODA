import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import type { ChatMessage, KodaRuntime } from "@koda-tools/core";
import type { KodaMode } from "./modes.js";

export interface AcpSession {
  readonly id: string;
  readonly workspaceRoot: string;
  readonly workspaceUri: string;
  readonly runtime: KodaRuntime;
  readonly history: ChatMessage[];
  mode: KodaMode;
  active: AbortController | undefined;
}

export function canonicalWorkspaceUri(path: string): string {
  return pathToFileURL(resolve(path)).href;
}

export async function resolveWorkspace(cwd: string): Promise<string> {
  if (!isAbsolute(cwd)) throw new Error("ACP session cwd must be absolute.");
  const root = await realpath(cwd);
  if (!(await stat(root)).isDirectory())
    throw new Error("ACP session cwd must be a directory.");
  return root;
}

export function isWithinWorkspace(root: string, candidate: string): boolean {
  const subpath = relative(root, candidate);
  return (
    subpath === "" ||
    (subpath !== ".." &&
      !subpath.startsWith(`..${sep}`) &&
      !isAbsolute(subpath))
  );
}
