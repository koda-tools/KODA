# koda-acp-server

## Purpose
Expose KODA as an ACP v1 agent server through the koda acp command while reusing the existing Core.

## Requirements

### Requirement: Start an ACP server over stdio {#acp-stdio-server}
The system SHALL provide koda acp using the stable ACP v1 SDK and JSON-RPC/NDJSON over stdio, with stdout reserved exclusively for protocol traffic and diagnostics sent to stderr.

#### Scenario:
- WHEN an ACP-compatible client starts koda acp
- THEN the process negotiates ACP without emitting non-protocol text on stdout

### Requirement: Reuse the existing KODA Core {#acp-core-adapter}
The independent @koda-tools/acp package SHALL reuse bootstrapKoda, AgentRuntime, CodeAgent, existing providers, tools, MCP, models, and permission policies without importing the CLI/TUI or creating parallel implementations.

#### Scenario:
- WHEN an ACP prompt is received
- THEN KODA Core executes it and the existing CLI/TUI behavior remains unchanged

### Requirement: Isolate ACP sessions and workspaces {#acp-sessions}
The server SHALL create independent ACP sessions bound to canonical workspace identities, preventing history, tools, runtimes, approvals, or MCP resources from crossing sessions or workspaces.

#### Scenario:
- WHEN two clients create sessions for different workspaces
- THEN each prompt uses only its own workspace-bound Core runtime and history

### Requirement: Execute and stream ACP prompts {#acp-prompts-and-streaming}
The server SHALL support prompt turns, ordered incremental updates, tool progress, completion, errors, and cancellation through the ACP v1 protocol.

#### Scenario:
- WHEN Core emits text deltas
- THEN the ACP client receives incremental session updates in order

#### Scenario:
- WHEN the client cancels a prompt
- THEN Core receives cancellation and active work stops where supported

### Requirement: Preserve Build, Plan, and approvals {#acp-modes-and-permissions}
The server SHALL expose Build and Plan as ACP session modes backed by existing Core agents, enforce Plan's no-write/no-command/no-MCP/no-delegation policy at Core authorization, and forward approval requests to the ACP client without auto-approving.

#### Scenario:
- WHEN Plan requests a write or side-effecting command
- THEN Core denies the operation before execution

#### Scenario:
- WHEN a sensitive operation requires approval
- THEN the ACP client can approve or reject it and cancellation rejects pending approval

### Requirement: Clean up ACP resources {#acp-shutdown}
The server SHALL cancel active turns, reject pending approvals, close sessions and MCP connections, and terminate child processes where supported on shutdown or disconnect.

#### Scenario:
- WHEN the ACP transport disconnects
- THEN the server releases owned resources without corrupting protocol output

### Requirement: Preserve the existing CLI/TUI {#cli-regression}
The existing KODA CLI/TUI commands and behavior SHALL remain functional after adding koda acp.

#### Scenario:
- WHEN the existing Core and CLI/TUI test suites run
- THEN they pass without requiring an ACP client
