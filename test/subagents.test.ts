import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AgentRuntime,
  BUILTIN_AGENTS,
  runQuietly,
  type AgentDefinition,
  type RuntimeOptions,
} from "../src/agents/index.js";
import type { ILLMProvider } from "../src/providers/index.js";
import {
  ScriptedProvider,
  callTool,
  hangUntilAborted,
  reply,
} from "./helpers/scripted-provider.js";

function runtimeWith(
  provider: ILLMProvider,
  extra: readonly AgentDefinition[] = [],
  options: Partial<RuntimeOptions> = {},
): AgentRuntime {
  return new AgentRuntime({
    catalog: {
      agents: [...BUILTIN_AGENTS, ...extra],
      skills: [],
      diagnostics: [],
    },
    workspaceRoot: process.cwd(),
    env: {},
    identity: { provider: "openai", model: "gpt-test" },
    defaultProvider: provider,
    ...options,
  });
}

test("task with explore returns the child's answer as the tool observation", async () => {
  const provider = new ScriptedProvider([
    callTool("task", { agent: "explore", prompt: "Where is the parser?" }),
    reply("The parser is in src/parser.ts."),
    reply("Found it."),
  ]);
  const prepared = runtimeWith(provider).prepare("build", {
    runSubagent: runQuietly,
  });
  assert.equal(await prepared.agent.run("find the parser"), "Found it.");
  // Parent offers task; the explore child gets neither task nor edits/bash.
  assert.ok(provider.toolsOf(0).includes("task"));
  assert.match(provider.systemOf(1), /## Agent: explore/);
  assert.match(provider.systemOf(1), /running as a subagent/);
  for (const tool of ["task", "writeFile", "runCommand"])
    assert.ok(
      !provider.toolsOf(1).includes(tool),
      `${tool} offered to explore`,
    );
  assert.equal(
    provider.calls[1]?.messages.at(-1)?.content,
    "Where is the parser?",
  );
  assert.deepEqual(provider.toolRepliesOf(2), [
    "The parser is in src/parser.ts.",
  ]);
});

test("the task tool exists only when delegation is wired, never for children", async () => {
  const provider = new ScriptedProvider([
    callTool("task", { agent: "general", prompt: "nested" }),
    reply("done without nesting"),
  ]);
  const child = runtimeWith(provider).prepareSubagent("general");
  assert.equal(
    await child.agent.run("try to delegate"),
    "done without nesting",
  );
  assert.ok(!provider.toolsOf(0).includes("task"));
  assert.match(provider.toolRepliesOf(1)[0] ?? "", /Unknown tool 'task'/);
});

test("cancelling the parent interrupts the subagent", async () => {
  const provider = new ScriptedProvider([hangUntilAborted]);
  const controller = new AbortController();
  const pending = runtimeWith(provider).runSubagent("general", "long task", {
    signal: controller.signal,
  });
  setTimeout(() => controller.abort(), 10);
  const result = await pending;
  assert.equal(result.ok, false);
  assert.match(result.content, /cancelled/);
  assert.equal(provider.calls[0]?.options?.signal?.aborted, true);
});

test("a subagent that runs past its time limit is stopped", async () => {
  const provider = new ScriptedProvider([hangUntilAborted]);
  const result = await runtimeWith(provider, [], {
    subagentTimeoutMs: 20,
  }).runSubagent("explore", "slow task");
  assert.equal(result.ok, false);
  assert.match(result.content, /timed out/);
});

test("an agent's model picks its own provider, even unlike the session's", async () => {
  const session = new ScriptedProvider([]);
  const anthropic = new ScriptedProvider([reply("reviewed")]);
  const created: string[] = [];
  const reviewer: AgentDefinition = {
    name: "reviewer",
    description: "Reviews code",
    mode: "subagent",
    prompt: "Review.",
    model: "anthropic/claude-x",
    permission: {},
    hidden: false,
    disable: false,
    source: "test",
  };
  const runtime = runtimeWith(session, [reviewer], {
    createProvider: (name) => {
      created.push(name);
      return anthropic;
    },
  });
  const result = await runtime.runSubagent("reviewer", "review this");
  assert.deepEqual(result, { ok: true, content: "reviewed" });
  assert.deepEqual(created, ["anthropic"]);
  assert.equal(anthropic.calls[0]?.options?.model, "claude-x");
  assert.equal(session.calls.length, 0);
  // The provider is cached per name.
  runtime.prepareSubagent("reviewer");
  assert.deepEqual(created, ["anthropic"]);
});

test("reaching steps asks for a summary without tools instead of failing", async () => {
  const quick: AgentDefinition = {
    name: "quick",
    description: "One step",
    mode: "subagent",
    prompt: "Be quick.",
    steps: 1,
    permission: {},
    hidden: false,
    disable: false,
    source: "test",
  };
  const provider = new ScriptedProvider([
    callTool("listDirectory", {}),
    reply("Summary: listed the root; nothing else done."),
  ]);
  const result = await runtimeWith(provider, [quick]).runSubagent(
    "quick",
    "explore",
  );
  assert.equal(result.ok, true);
  assert.match(result.content, /^Summary:/);
  assert.equal(provider.calls[1]?.options?.tools, undefined);
});

test("@name mentions resolve only to visible subagents", () => {
  const runtime = runtimeWith(new ScriptedProvider([]));
  assert.deepEqual(runtime.parseMention("@explore find the parser"), {
    agent: "explore",
    task: "find the parser",
  });
  assert.equal(runtime.parseMention("@build do it"), undefined);
  assert.equal(runtime.parseMention("@explore"), undefined);
  assert.equal(runtime.parseMention("email me @explore x"), undefined);
});
