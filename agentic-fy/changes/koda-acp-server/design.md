# Design — koda-acp-server

## 1. Architectural boundary

```text
ACP-compatible editor/IDE
          |
          | JSON-RPC / NDJSON over stdio
          v
       koda acp (dispatcher)
          |
          v
   @koda-tools/acp
          |
          v
   @koda-tools/core
   bootstrapKoda / AgentRuntime / CodeAgent
      |          |          |
   Agents      Tools       MCP
```

The ACP server lives in `packages/acp` as a host adapter. The CLI entry dispatcher dynamically imports either this package or the existing terminal path. ACP must not import the CLI/TUI or add protocol dependencies to Core. Core remains responsible for provider selection, agent orchestration, tool execution, MCP, permissions, approvals, and cancellation-aware work. The existing VS Code Chat Participant remains an independent Core host; ACP does not make it an ACP client.

The official TypeScript SDK is the protocol boundary. Use its stable ACP v1 entry point and fluent `agent(...)` API with `initialize`, `newSession`, `prompt`, and `cancel` handlers. Do not use the SDK's experimental ACP v2 import. The SDK documentation identifies the stable package entry point as ACP v1 and recommends `agent(...)` plus `connect(...)` for an agent implementation. ([official SDK](https://github.com/agentclientprotocol/typescript-sdk), [TypeScript library guide](https://github.com/agentclientprotocol/agent-client-protocol/blob/main/docs/libraries/typescript.mdx))

## 2. Discovery gate before implementation

Inspect and record the current repository behavior before writing the adapter:

- `bootstrapKoda`, `KodaRuntime`, `AgentRuntime`, `CodeAgent`, and their disposal behavior.
- Existing session/history abstractions and whether a durable Core session identifier exists.
- `AgentObserver` events, provider streaming, tool start/result hooks, and signal propagation.
- `WritePolicy`, `CommandPolicy`, `ApprovalPrompt`, permission layers, and the built-in `build`/`plan` agents.
- Command parsing and the CLI entry point where `koda acp` will be routed.
- MCP manager lifecycle, child process termination, global initialization, and workspace-root handling.
- Node 22/TypeScript constraints and the exact SDK version/API selected.

If a missing capability requires Core changes, add a host-neutral abstraction reusable by both CLI and ACP. Do not reproduce the behavior in the ACP adapter.

## 3. Process and transport

`koda acp` starts one ACP server process. The ACP SDK's stdio/NDJSON stream owns stdin/stdout. Every JSON-RPC request, response, and notification is written through the SDK transport; no `console.log`, progress text, provider output, tool output, or diagnostics may reach stdout. Logs use stderr through a small injectable logger.

The entry point must handle malformed input, disconnect, SIGINT/SIGTERM, and uncaught failures without corrupting stdout. Shutdown is idempotent: cancel active turns, reject pending approvals, close MCP/runtime resources, flush stderr diagnostics, then end the transport.

## 4. ACP handlers and Core adapter

The adapter should expose a protocol-neutral internal contract:

```ts
interface AcpSession {
  readonly id: string;
  readonly workspaceRoot: string;
  readonly mode: "build" | "plan";
  readonly history: readonly ChatMessage[];
  readonly runtime: KodaRuntime;
}

interface KodaAcpAgent {
  initialize(...): Promise<...>;
  newSession(...): Promise<...>;
  prompt(...): Promise<...>;
  cancel(...): Promise<void>;
}
```

The exact types and method names must come from the selected SDK version. `newSession` validates and canonicalizes the requested local workspace path, creates a Core runtime, and stores a session entry. Build/Plan are exposed through ACP session modes and `session/set_mode`; prompts use the selected existing Core agent. `prompt` passes prior Core history, forwards text deltas and tool lifecycle updates as ACP `session/update` notifications, and appends only the completed turn returned by Core. The VS Code transcript is not a second source of truth. Client-provided MCP servers and additional workspace roots are explicitly rejected until Core can safely own them; the agent does not advertise these capabilities.

## 5. Sessions and workspace isolation

Use a registry keyed by ACP session ID and canonical workspace identity. A session cannot access another session's runtime, history, workspace root, MCP manager, or pending approvals. Validate relative paths through Core's existing workspace security rules, and define the behavior for multi-root/URI workspaces during discovery.

ACP session persistence/resumption is supported only if Core and the ACP version provide a reliable durable contract. Otherwise sessions are process-local and the limitation is documented. Concurrent sessions must be independent, and one cancelled session must not cancel another.

## 6. Build and Plan

Route Build to the existing `build` agent and its configured write/command/approval policies. Route Plan to the existing `plan` agent. Plan must be enforced by Core authorization: writes, commands, MCP calls, and delegation are denied before execution, even if an agent file customizes the built-in definition. The ACP layer may relay the client's permission response but cannot make a denied Core operation executable.

## 7. Approvals

When Core requests an approval, the ACP adapter calls the ACP client's permission-request method with a bounded description of the action and its scope. It maps the client's allow/reject decision back to the existing Core `ApprovalPrompt`, `WritePolicy`, or `CommandPolicy` callback.

Pending approvals are indexed by session and request. Cancellation, session close, transport disconnect, or process shutdown rejects unresolved approvals exactly once. If the client has no permission-request capability, the adapter denies rather than auto-approving. Secrets, API keys, and raw sensitive arguments are redacted before sending the request.

## 8. Streaming and cancellation

Preserve event order with backpressure: Core awaits asynchronous text observers and tool lifecycle hooks, allowing only one outbound update at a time. Split large text deltas into bounded chunks. Map Core text deltas to ACP agent-message updates and tool starts/results and file changes to ACP tool-call updates. Completion and cancellation use the `session/prompt` stop reason; errors become concise updates and stderr diagnostics. Never forward raw tool arguments or secret-bearing tool output.

Bridge each ACP prompt cancellation request to an `AbortController`. On cancellation, stop producing updates for that turn, abort Core/provider/tool execution, reject pending approvals, and preserve only valid completed history. Verify command child processes and MCP connections close when Core supports cancellation/disposal.

## 9. CLI integration

Add an `acp` branch to the existing CLI command dispatcher. It must initialize the ACP server without starting the TUI, and it must avoid importing terminal rendering modules into the ACP path. Existing `koda`, `koda init`, `koda connect`, slash commands, exit codes, and output behavior remain unchanged.

## 10. Testing strategy

- Unit-test protocol-neutral session registry, workspace isolation, mode routing, event ordering, bounded queues, redaction, approval settlement, cancellation, and shutdown.
- Test the stdio process with a fake ACP client: initialize, new session, prompt, streamed updates, tool approval, rejection, cancel, disconnect, and malformed input.
- Run an ACP compatibility/conformance test suite and validate against a real ACP client, such as Zed or another supported client, using a built `koda acp` process.
- Run all existing Core and CLI/TUI tests to prove no regression.

## 11. Risks and mitigations

- SDK API drift: pin the official SDK version, use stable v1 imports, and isolate SDK calls in one adapter module.
- Protocol corruption from logs: centralize logging to stderr and add a test that parses every stdout line as protocol traffic.
- Core lacks durable sessions or event types: document process-local behavior and add only reusable Core contracts.
- Approval deadlocks: settle each request once and reject all pending requests on cancellation/disconnect/shutdown.
- Workspace leakage: canonicalize roots, bind every session and tool registry to one root, and test concurrent cross-workspace prompts.
- CLI regression: keep the ACP entry point separate from TUI imports and run the complete CLI suite.
