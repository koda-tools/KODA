import assert from "node:assert/strict";
import { test } from "node:test";
import { AgentRuntime, BUILTIN_AGENTS } from "../src/agents/index.js";
import { CodeAgent } from "../src/core/index.js";
import {
  runInteractive,
  type SessionIntent,
  type SessionPickerResult,
  type SessionSummaryView,
} from "../src/cli/tui/index.js";
import { ToolRegistry } from "../src/tools/registry.js";
import {
  ScriptedProvider,
  callTool,
  reply,
  type ScriptStep,
} from "./helpers/scripted-provider.js";
import { withWorkspace, type WorkspaceFiles } from "./helpers/workspace.js";

type Fire = (intent: SessionIntent) => void;
/** One prompt answer; it may raise a keybind intent first. */
type Step = (fire: Fire) => string | undefined;

interface Outcome {
  readonly provider: ScriptedProvider;
  /** Everything written to the visible screen. */
  readonly output: string;
  /** The visible transcript at the end (after any session switch). */
  readonly screen: readonly string[];
  /** Active agent after every summary push. */
  readonly activeAgents: readonly (string | undefined)[];
  readonly sessions: readonly SessionSummaryView[];
}

async function runSteps(
  script: ScriptStep[],
  steps: Step[],
  options: {
    readonly files?: WorkspaceFiles;
    readonly picker?: SessionPickerResult;
  } = {},
): Promise<Outcome> {
  const provider = new ScriptedProvider(script);
  return withWorkspace(options.files ?? {}, async (root) => {
    const identity = { provider: "openai", model: "gpt-test" };
    let intent: Fire | undefined;
    let output = "";
    let screen: string[] = [""];
    let sessions: readonly SessionSummaryView[] = [];
    const activeAgents: (string | undefined)[] = [];
    const fire: Fire = (value) => intent?.(value);
    await runInteractive({
      agent: new CodeAgent(
        provider,
        new ToolRegistry({ workspaceRoot: root }),
        {
          identity,
        },
      ),
      agents: new AgentRuntime({
        catalog: { agents: BUILTIN_AGENTS, skills: [], diagnostics: [] },
        workspaceRoot: root,
        env: {},
        identity,
        defaultProvider: provider,
      }),
      ...identity,
      workspaceRoot: root,
      io: {
        question: async () => steps.shift()?.(fire),
        write: (text) => {
          output += text;
          const [first = "", ...rest] = text.split("\n");
          screen[screen.length - 1] = `${screen.at(-1) ?? ""}${first}`;
          screen.push(...rest);
        },
        close: () => undefined,
        setSessions: (next) => {
          sessions = next;
          activeAgents.push(next.find((session) => session.active)?.agent);
        },
        getTranscript: () => screen,
        setTranscript: (lines) => {
          screen = [...lines];
        },
        onSessionIntent: (handler) => {
          intent = handler;
          return () => {
            intent = undefined;
          };
        },
        ...(options.picker === undefined
          ? {}
          : { showSessionPicker: async () => options.picker }),
      },
    });
    return { provider, output, screen, activeAgents, sessions };
  });
}

test("sessions start on build; Tab / Shift+Tab and /agent switch the primary agent", async () => {
  const run = await runSteps(
    [reply("planned")],
    [
      (fire) => {
        fire("agent-next");
        return "/agents";
      },
      () => "make a plan",
      (fire) => {
        fire("agent-prev");
        return "/agent explore";
      },
      () => "/agent plan",
      () => "/exit",
    ],
  );
  assert.equal(run.activeAgents[0], "build");
  assert.ok(run.activeAgents.includes("plan"));
  assert.match(run.output, /● plan/);
  assert.match(run.provider.systemOf(0), /## Agent: plan/);
  assert.ok(!run.provider.toolsOf(0).includes("writeFile"));
  assert.match(run.output, /Unknown primary agent 'explore'/);
  assert.match(run.output, /Agent set to plan\./);
  assert.equal(run.activeAgents.at(-1), "plan");
});

test("@name delegates to a child session and adds its usage to the parent", async () => {
  const run = await runSteps(
    [reply("The parser is in src/p.ts.", 40)],
    [() => "@explore find the parser", () => "/exit"],
  );
  assert.match(run.provider.systemOf(0), /## Agent: explore/);
  assert.match(run.output, /↳ explore/);
  assert.match(run.output, /The parser is in src\/p\.ts\./);
  // The child's own transcript (its task) stays off screen.
  assert.doesNotMatch(run.output, /find the parser/);
  const parent = run.sessions.find((session) => session.active);
  const child = run.sessions.find((session) => session.title === "↳ explore");
  assert.equal(child?.active, false);
  assert.equal(child?.agent, "explore");
  assert.equal(child?.tokens, 40);
  assert.equal(parent?.tokens, 40);
});

test("the child session keeps the subagent's output and opens from the picker", async () => {
  const run = await runSteps(
    [reply("Child answer.")],
    [
      () => "@general summarize the repo",
      (fire) => {
        fire("picker");
        return "/exit";
      },
    ],
    { picker: { kind: "switch", index: 1 } },
  );
  const visible = run.screen.join("\n");
  assert.match(visible, /summarize the repo/);
  assert.match(visible, /Child answer\./);
  assert.equal(
    run.sessions.find((session) => session.active)?.title,
    "↳ general",
  );
});

test("the task tool runs the subagent in a child session", async () => {
  const run = await runSteps(
    [
      callTool("task", { agent: "explore", prompt: "look around" }),
      reply("child findings", 30),
      reply("parent done", 5),
    ],
    [() => "investigate", () => "/exit"],
  );
  assert.match(run.output, /parent done/);
  assert.doesNotMatch(run.output, /child findings/);
  assert.deepEqual(run.provider.toolRepliesOf(2), ["child findings"]);
  const parent = run.sessions.find((session) => session.active);
  const child = run.sessions.find((session) => session.title === "↳ explore");
  assert.equal(child?.tokens, 30);
  // 1 (tool call) + 5 (answer) + 30 (child).
  assert.equal(parent?.tokens, 36);
});

test("a subagent command delegates to its agent", async () => {
  const run = await runSteps(
    [reply("Found in src/p.ts.")],
    [() => "/find the parser", () => "/exit"],
    {
      files: {
        ".koda/commands/find.md":
          "---\ndescription: Find code\nsubagent: true\nagent: explore\n---\nFind $ARGUMENTS",
      },
    },
  );
  assert.match(run.provider.systemOf(0), /## Agent: explore/);
  assert.equal(
    run.provider.calls[0]?.messages.at(-1)?.content,
    "Find the parser",
  );
  assert.match(run.output, /Found in src\/p\.ts\./);
  assert.ok(run.sessions.some((session) => session.title === "↳ explore"));
});
