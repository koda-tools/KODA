# KODA Roadmap

## 1. Project overview

KODA is a TypeScript AI coding agent CLI and SDK. Its current foundation provides a provider-neutral agent loop, safe workspace file access, an interactive terminal UI, and explicit user approval for mutations. The next roadmap items focus on turning that foundation into a genuinely autonomous—but controlled—coding workflow.

Feature specifications are maintained individually in [`docs/features/`](./features/next-road-map.md).

## 2. Current status

### Implemented

| Capability | Implementation | Status |
| --- | --- | --- |
| Strict TypeScript foundation | Strict compiler configuration, typed error hierarchy, pinned dependencies | Done |
| Workspace security | Path traversal protection, symlink-aware containment, sensitive path blocking | Done |
| Provider abstraction | Normalized `ILLMProvider`, completion, streaming, tool schemas, capabilities, cancellation | Done |
| Cloud and local providers | OpenAI, Anthropic, Google Gemini, and Ollama adapters | Done |
| Provider factory | Explicit configuration and environment-based provider selection | Done |
| Agent loop | Think → Act → Observe loop, tool calls, iteration limit, usage aggregation, history input | Done |
| File reading | UTF-8 reads with workspace checks and file-size limits | Done |
| File writing | Workspace-safe writes, size limits, diff summary, explicit approval policy | Done |
| Interactive TUI | Streaming output, spinner/status, markdown/code highlighting, cancellation, model selection | Done |
| Diff preview | Human-readable previews before approved writes | Done |
| Custom commands | Markdown/JSONC discovery, arguments, model overrides, approved shell blocks | Done |
| SDK surface | Public exports through `src/index.ts` | Done |
| Automated tests | Coverage for security, providers, agent loop, tools, commands, TUI, and diffs | Done |

### Important current limitations

The agent currently has only `readFile` and `writeFile` as core tools. It cannot independently list a project, search its contents, execute validation commands from the agent loop, or apply conflict-aware patches. Context trimming, LSP diagnostics, subagents, MCP, and persisted sessions are not implemented.

## 3. Prioritized roadmap

Priorities are ordered by expected user value, autonomy gain, and dependency order—not by implementation novelty.

### P0 — Project awareness and safe execution

#### 1. Project exploration tools

**Goal:** Allow the agent to discover relevant files without being given paths manually.

Implement:
- bounded recursive `listDirectory`;
- `searchFiles` with text and regular-expression support;
- safe `getFileInfo`;
- line-range reads in `readFile`;
- `.gitignore`-aware filtering and binary-file handling;
- output, depth, and cancellation limits.

Specification: [`project-exploration.md`](./features/project-exploration.md)

#### 2. Controlled command execution

**Goal:** Let the agent inspect, build, test, and format projects under explicit control.

Implement a `runCommand` tool with workspace scoping, timeouts, cancellation, output limits, approval policies, and dangerous-command handling. The default policy must require confirmation.

Specification: [`command-execution.md`](./features/command-execution.md)

#### 3. Safe patch-based editing

**Goal:** Make changes precise, reviewable, and resistant to overwriting concurrent user edits.

Implement unified patches or targeted replacements, content/version checks, atomic application, rollback, diff previews, and limits on changed files and lines.

Specification: [`safe-patch-editing.md`](./features/safe-patch-editing.md)

#### 4. Automatic validation

**Goal:** Close the loop from editing to verified implementation.

Detect project validation commands, run tests/type checks/lint/build through the command policy, return structured failures to the agent, and support bounded repair attempts.

Specification: [`automatic-validation.md`](./features/automatic-validation.md)

### P1 — Reliable long-running workflows

#### 5. Context and memory engine

**Goal:** Keep long sessions within provider limits while preserving relevant decisions and code context.

Implement token budgeting, conversation trimming/summarization, file/search caching, cache invalidation, and prioritization of changed or search-matched files.

Specification: [`context-engine.md`](./features/context-engine.md)

#### 6. Operation modes

**Goal:** Make autonomy explicit and enforceable.

Add Plan, Build, and Review modes. Permissions must be enforced by the tool registry, not just represented in prompts or UI labels.

Specification: [`operation-modes.md`](./features/operation-modes.md)

#### 7. Project rules and local instructions

**Goal:** Make KODA follow repository conventions consistently.

Support `KODA.md` and compatible `AGENTS.md` files with parent-directory inheritance, deterministic precedence, and clear separation between instructions and untrusted tool output.

Specification: [`project-rules.md`](./features/project-rules.md)

#### 8. Multiple sessions and session switching

**Goal:** Let a single KODA run hold more than one conversation context and switch between them.

Manage several `Session` instances, each with isolated model, usage, history, and abort controller. Support creating a new context window, switching the active session, listing open sessions, and closing one while cancelling its in-flight request. The header must always reflect the active session only.

Specification: [`multiple-session-and-change-session.md`](./features/multiple-session-and-change-session.md)

### P2 — Structural code intelligence and operational visibility

#### 9. LSP integration

**Goal:** Provide definitions, references, symbols, and diagnostics instead of relying only on text search.

Start with TypeScript diagnostics, definitions, and references, then expand to additional languages through configurable language servers.

Specification: [`lsp-integration.md`](./features/lsp-integration.md)

#### 10. Observability and cost tracking

**Goal:** Make usage, latency, failures, retries, tool activity, and estimated model cost measurable.

Expose human-readable summaries and stable JSON output for CI while keeping telemetry local and secret-safe by default.

Specification: [`observability-and-cost.md`](./features/observability-and-cost.md)

#### 11. Session persistence

**Goal:** Resume interrupted work and inspect prior agent runs.

Add local session storage, listing, resume, export, usage metadata, interruption state, and retention controls without persisting secrets.

Specification: [`session-persistence.md`](./features/session-persistence.md)

### P3 — Extensibility and parallelization

#### 12. Subagents

**Goal:** Delegate exploration, implementation, and review to bounded specialized agents.

Read-only delegation should be the default. Child limits and permissions must never exceed those of the parent session.

Specification: [`subagents.md`](./features/subagents.md)

#### 13. MCP integration

**Goal:** Connect KODA to external tools and data sources through explicit, permissioned MCP servers.

Add server configuration, tool discovery, normalized schemas, per-tool approvals, lifecycle management, and strict secret/workspace boundaries.

Specification: [`mcp-integration.md`](./features/mcp-integration.md)

## 4. Suggested delivery milestones

### Milestone A — Autonomous repository navigation

Deliver project exploration and line-range reads. The agent should be able to locate relevant files and explain a codebase without manual file selection.

### Milestone B — Controlled implementation loop

Deliver command execution and patch-based editing. The agent should be able to inspect, propose, preview, and apply a multi-file change with approval.

### Milestone C — Verified changes

Deliver automatic validation. The agent should be able to run project checks, interpret failures, and perform a bounded correction cycle.

### Milestone D — Durable engineering workflow

Deliver context budgeting, operation modes, project rules, observability, and session persistence.

### Milestone E — Advanced integrations

Deliver LSP, subagents, and MCP after the core permission and tool boundaries are stable.

## 5. Definition of done

- [x] The agent can read local files and return a final response.
- [x] Tool execution is restricted to the workspace root.
- [x] Path traversal, symlink escapes, and sensitive paths are rejected.
- [x] Providers expose a normalized completion and streaming interface.
- [x] OpenAI, Anthropic, Gemini, and Ollama adapters are available.
- [x] Writes require an approval policy and show a diff when possible.
- [x] The codebase is strictly typed without compiler suppression.
- [x] Core security, provider, agent, tool, command, TUI, and diff behavior has automated coverage.
- [ ] The agent can discover relevant files through bounded listing and search.
- [ ] The agent can run approved project commands with timeout and cancellation.
- [ ] Changes are applied through conflict-aware patches.
- [ ] Changes can be automatically validated and repaired within bounded limits.
- [ ] Long conversations have token budgeting and context recovery.
- [ ] Operation modes enforce read-only and mutation permissions.
- [ ] LSP, persistence, subagents, and MCP are integrated with the same security model.
