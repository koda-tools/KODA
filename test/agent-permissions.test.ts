import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AgentRuntime,
  AgentToolset,
  BUILTIN_AGENTS,
  gatedCommandPolicy,
  gatedWritePolicy,
  matchesPattern,
  resolvePermission,
  type AgentDefinition,
  type GateState,
  type Permissions,
} from "../src/agents/index.js";
import type { ToolExecutor } from "../src/core/index.js";
import {
  READ_FILE_DEFINITION,
  RUN_COMMAND_DEFINITION,
  WRITE_FILE_DEFINITION,
} from "../src/tools/registry.js";
import { withWorkspace } from "./helpers/workspace.js";
import {
  ScriptedProvider,
  callTool,
  reply,
} from "./helpers/scripted-provider.js";

test("missing keys use safe defaults: reads allowed, edits and bash ask", () => {
  assert.equal(resolvePermission([{}], "read", "src/a.ts"), "allow");
  assert.equal(resolvePermission([{}], "edit", "src/a.ts"), "ask");
  assert.equal(resolvePermission([{}], "bash", "npm test"), "ask");
  assert.equal(resolvePermission([], "task", "explore"), "allow");
});

test("glob rules: the last matching pattern wins", () => {
  const layers: Permissions[] = [
    { bash: { "*": "ask", "git status*": "allow", "git push*": "deny" } },
  ];
  assert.equal(
    resolvePermission(layers, "bash", "git status --short"),
    "allow",
  );
  assert.equal(resolvePermission(layers, "bash", "git push origin"), "deny");
  assert.equal(resolvePermission(layers, "bash", "rm -rf dist"), "ask");
  assert.equal(matchesPattern("git", "git *"), true);
  assert.equal(matchesPattern("src/deep/a.ts", "src/*.ts"), true);
  assert.equal(matchesPattern("a.tsx", "a.ts"), false);
});

test("the most restrictive layer wins, so a child never exceeds its parent", () => {
  const parent: Permissions = { edit: "deny" };
  const child: Permissions = { edit: "allow", bash: "allow" };
  assert.equal(resolvePermission([parent, child], "edit", "a.ts"), "deny");
  // Parent bash falls back to the default `ask`.
  assert.equal(resolvePermission([parent, child], "bash", "ls"), "ask");
});

/** A base executor whose write/command calls go through gated policies. */
function fakeBase(gate: GateState) {
  const asked: string[] = [];
  const ran: string[] = [];
  const writePolicy = gatedWritePolicy(
    {
      confirm: async (request) => {
        asked.push(`write ${request.filePath}`);
        return false;
      },
    },
    gate,
  );
  const commandPolicy = gatedCommandPolicy(
    {
      confirm: async (request) => {
        asked.push(`run ${request.command}`);
        return false;
      },
    },
    gate,
  );
  const base: ToolExecutor = {
    definitions: [
      READ_FILE_DEFINITION,
      WRITE_FILE_DEFINITION,
      RUN_COMMAND_DEFINITION,
    ],
    statusLabel: () => undefined,
    execute: async (name, serialized) => {
      const args = JSON.parse(serialized) as Record<string, string>;
      ran.push(name);
      const approved =
        name === "writeFile"
          ? await writePolicy?.confirm({
              filePath: args.filePath ?? "",
              before: undefined,
              after: "",
            })
          : name === "runCommand"
            ? await commandPolicy?.confirm({
                command: args.command ?? "",
                cwd: ".",
              })
            : true;
      return approved === true
        ? { ok: true, content: `${name} ok` }
        : { ok: false, content: `${name} rejected` };
    },
  };
  return { base, asked, ran };
}

function toolset(permission: Permissions, approve?: () => Promise<boolean>) {
  const gate: GateState = { preapproved: false };
  const fake = fakeBase(gate);
  const tools = new AgentToolset(fake.base, {
    layers: [permission],
    extraTools: [],
    gate,
    approve,
    agentName: "tester",
  });
  return { tools, ...fake };
}

test("edit deny hides writeFile and refuses a direct call", async () => {
  const { tools, ran } = toolset({ edit: "deny" });
  assert.deepEqual(
    tools.definitions.map((tool) => tool.name),
    ["readFile", "runCommand"],
  );
  const result = await tools.execute(
    "writeFile",
    JSON.stringify({ filePath: "a.ts", content: "x" }),
  );
  assert.equal(result.ok, false);
  assert.match(result.content, /Permission denied/);
  assert.deepEqual(ran, []);
});

test('bash "*" ask with "git status*" allow skips the prompt only for git status', async () => {
  const { tools, asked } = toolset({
    bash: { "*": "ask", "git status*": "allow" },
  });
  const status = await tools.execute(
    "runCommand",
    JSON.stringify({ command: "git status" }),
  );
  assert.equal(status.ok, true);
  const other = await tools.execute(
    "runCommand",
    JSON.stringify({ command: "npm publish" }),
  );
  assert.equal(other.ok, false);
  assert.deepEqual(asked, ["run npm publish"]);
});

test("pattern denies keep the tool visible but block the matching calls", async () => {
  const { tools, asked } = toolset({
    edit: { "*": "ask", "secrets/*": "deny" },
  });
  assert.ok(tools.definitions.some((tool) => tool.name === "writeFile"));
  const denied = await tools.execute(
    "writeFile",
    JSON.stringify({ filePath: "./secrets/key.txt", content: "x" }),
  );
  assert.match(denied.content, /Permission denied: edit 'secrets\/key.txt'/);
  await tools.execute(
    "writeFile",
    JSON.stringify({ filePath: "a.ts", content: "x" }),
  );
  assert.deepEqual(asked, ["write a.ts"]);
});

test("ask on other tools prompts the user; no prompt means no access", async () => {
  let prompts = 0;
  const approved = toolset({ read: { "*.env": "ask" } }, async () => {
    prompts += 1;
    return true;
  });
  assert.equal(
    (
      await approved.tools.execute(
        "readFile",
        JSON.stringify({ filePath: ".env" }),
      )
    ).ok,
    true,
  );
  assert.equal(
    (
      await approved.tools.execute(
        "readFile",
        JSON.stringify({ filePath: "a.ts" }),
      )
    ).ok,
    true,
  );
  assert.equal(prompts, 1);
  const headless = toolset({ read: { "*.env": "ask" } });
  const refused = await headless.tools.execute(
    "readFile",
    JSON.stringify({ filePath: ".env" }),
  );
  assert.match(refused.content, /Permission denied by user/);
});

test("a subagent with edit allow cannot write when the parent denies edit", async () => {
  const writer: AgentDefinition = {
    name: "writer",
    description: "Writes files",
    mode: "subagent",
    prompt: "Write.",
    permission: { edit: "allow" },
    hidden: false,
    disable: false,
    source: "test",
  };
  await withWorkspace({}, async (root) => {
    const provider = new ScriptedProvider([
      callTool("writeFile", { filePath: "a.txt", content: "x" }),
      reply("could not write"),
    ]);
    const runtime = new AgentRuntime({
      catalog: {
        agents: [...BUILTIN_AGENTS, writer],
        skills: [],
        diagnostics: [],
      },
      workspaceRoot: root,
      env: {},
      identity: { provider: "openai", model: "gpt-test" },
      defaultProvider: provider,
      writePolicy: { confirm: async () => true },
    });
    const prepared = runtime.prepareSubagent("writer", {
      parentLayers: [{ edit: "deny" }],
    });
    assert.equal(await prepared.agent.run("write a.txt"), "could not write");
    assert.ok(!provider.toolsOf(0).includes("writeFile"));
    assert.match(provider.toolRepliesOf(1)[0] ?? "", /Permission denied/);
  });
});
