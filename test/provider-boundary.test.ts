import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

async function TypeScriptFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(root, entry.name);
      return entry.isDirectory()
        ? TypeScriptFiles(target)
        : entry.name.endsWith(".ts")
          ? [target]
          : [];
    }),
  );
  return nested.flat();
}

test("confines vendor SDK imports to provider adapters", async () => {
  const sourceRoot = path.join(process.cwd(), "src");
  const files = (await TypeScriptFiles(sourceRoot)).filter(
    (file) =>
      !file.includes(`${path.sep}providers${path.sep}adapters${path.sep}`),
  );
  const vendorImport =
    /from\s+["'](?:openai|@anthropic-ai\/sdk|@google\/genai)["']/;
  for (const file of files)
    assert.doesNotMatch(await readFile(file, "utf8"), vendorImport, file);
});

test("keeps provider names out of agent core", async () => {
  for (const file of await TypeScriptFiles(
    path.join(process.cwd(), "src", "core"),
  ))
    assert.doesNotMatch(
      await readFile(file, "utf8"),
      /OpenAI|Anthropic|Gemini|Ollama/,
      file,
    );
});
