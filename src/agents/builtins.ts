import type { AgentDefinition } from "./types.js";

const BUILT_IN = "built-in";

/**
 * OpenCode's built-ins, adapted to KODA's tools. Writes and commands keep
 * asking for approval by default; `plan` and `explore` cannot edit.
 */
export const BUILTIN_AGENTS: readonly AgentDefinition[] = [
  {
    name: "build",
    description:
      "Default agent for development work with every tool available.",
    mode: "primary",
    prompt:
      "You are the build agent. Make the requested changes, keep them minimal and correct, and verify them when you can.",
    steps: 25,
    permission: {},
    hidden: false,
    disable: false,
    source: BUILT_IN,
  },
  {
    name: "plan",
    description: "Analyzes code and proposes plans without changing files.",
    mode: "primary",
    prompt:
      "You are the plan agent. Analyze the code and propose a concrete plan. Do not change files; explain the changes instead.",
    steps: 25,
    permission: { edit: "deny", bash: "ask" },
    hidden: false,
    disable: false,
    source: BUILT_IN,
  },
  {
    name: "general",
    description:
      "General-purpose subagent for researching complex questions and multi-step tasks.",
    mode: "subagent",
    prompt:
      "You are a general-purpose subagent. Complete the delegated task on your own and reply with a concise, complete result for the agent that called you.",
    steps: 15,
    permission: {},
    hidden: false,
    disable: false,
    source: BUILT_IN,
  },
  {
    name: "explore",
    description:
      "Fast read-only subagent for finding files, searching code and answering questions about the codebase.",
    mode: "subagent",
    prompt:
      "You are a read-only exploration subagent. Search and read the codebase to answer the question. Reply with the findings and the file paths that support them.",
    steps: 15,
    permission: { edit: "deny", bash: "deny" },
    hidden: false,
    disable: false,
    source: BUILT_IN,
  },
];
