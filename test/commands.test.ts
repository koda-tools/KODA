import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  expandArguments,
  tokenizeArguments,
} from "../src/cli/commands/arguments.js";
import {
  CommandRegistry,
  discoverCommands,
} from "../src/cli/commands/discovery.js";
import { parseJsonCommands } from "../src/cli/commands/jsonc.js";
import { parseMarkdownCommand } from "../src/cli/commands/markdown.js";
import { routeInput } from "../src/cli/commands/router.js";

const source = { path: "command.md", level: 1, kind: "markdown" as const };

test("parses Markdown frontmatter and validates metadata", () => {
  const command = parseMarkdownCommand(
    "review",
    "---\ndescription: Review code\nmodel: openai/gpt-4o-mini\nsubagent: false\n---\nReview $ARGUMENTS",
    source,
  );
  assert.equal(command.description, "Review code");
  assert.equal(command.template, "Review $ARGUMENTS");
  assert.throws(() =>
    parseMarkdownCommand("bad", "---\nsubagent: yes\n---\nx", source),
  );
});

test("parses JSONC commands with comments and trailing commas", () => {
  const commands = parseJsonCommands(
    '{ // comment\n "commands": { "test": { "template": "Run $1", }, }, }',
    { path: "koda.jsonc", level: 2, kind: "jsonc" },
  );
  assert.equal(commands[0]?.template, "Run $1");
  assert.throws(() =>
    parseJsonCommands('{"commands":{"bad":{"description":"x"}}}', {
      path: "bad.json",
      level: 1,
      kind: "json",
    }),
  );
});

test("tokenizes quotes and expands full, positional, and fallback arguments", () => {
  assert.deepEqual(tokenizeArguments(`one "two words" 'three words'`), [
    "one",
    "two words",
    "three words",
  ]);
  assert.equal(
    expandArguments("A=$1 B=$2", "one two three"),
    "A=one B=two three",
  );
  assert.equal(
    expandArguments("All: $ARGUMENTS", '"one two" three'),
    'All: "one two" three',
  );
  assert.equal(
    expandArguments("Review @src/a.ts", "carefully"),
    "Review @src/a.ts\n\ncarefully",
  );
  assert.throws(() => tokenizeArguments('"unterminated'));
});

test("discovers nested project commands with local precedence", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "koda-commands-"));
  const global = await mkdtemp(path.join(os.tmpdir(), "koda-global-"));
  try {
    await mkdir(path.join(root, ".koda", "commands", "team"), {
      recursive: true,
    });
    await mkdir(path.join(global, "commands", "team"), { recursive: true });
    await writeFile(
      path.join(root, ".koda", "commands", "team", "review.md"),
      "local",
    );
    await writeFile(
      path.join(global, "commands", "team", "review.md"),
      "global",
    );
    const commands = await discoverCommands({
      workspaceRoot: root,
      globalKodaRoot: global,
    });
    assert.equal(commands[0]?.name, "team/review");
    assert.equal(commands[0]?.template, "local");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(global, { recursive: true, force: true });
  }
});

test("routes built-ins, plain prompts, custom commands, and unsupported subagents", async () => {
  const normal = {
    name: "review",
    template: "Review $1",
    subagent: false,
    source,
  };
  const child = { name: "child", template: "x", subagent: true, source };
  const registry = new CommandRegistry([normal, child]);
  assert.deepEqual(await routeInput("hello", registry, process.cwd()), {
    type: "prompt",
    prompt: "hello",
  });
  assert.equal(
    (await routeInput("/help", registry, process.cwd())).type,
    "message",
  );
  assert.deepEqual(await routeInput("/review now", registry, process.cwd()), {
    type: "prompt",
    prompt: "Review now",
  });
  await assert.rejects(
    routeInput("/child", registry, process.cwd()),
    /unsupported/,
  );
});
