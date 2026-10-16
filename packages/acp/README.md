# KODA ACP Server

`koda acp` exposes the existing KODA Core as an ACP v1 agent over JSON-RPC /
newline-delimited JSON on stdio. It is a separate adapter package; it does not
use the CLI/TUI or the VS Code Chat Participant. Only protocol messages go to
stdout. Diagnostics go to stderr.

The package keeps the stdio transport in `src/server.ts`, ACP handlers and
capability negotiation in `src/protocol/`, workspace-scoped runtime state in
`src/session/`, and the Core, event, permission, and prompt-context bridges in
`src/adapters/`. `src/utils/logger.ts` writes sanitized diagnostics to stderr.
Tests live in `tests/`, with the protocol subprocess fixture under
`tests/fixtures/`.

## Build and run locally

From the repository root on Windows PowerShell:

```powershell
npm.cmd install
npm.cmd run build
node packages/koda/bin/koda.js acp
```

The last command waits for an ACP client on stdin. The client launches it as a
child process. Configure the model provider and credentials using the same
KODA Core configuration as the CLI before creating a session.

Run protocol and Core regression tests from the repository root:

```powershell
npm.cmd run test -w @koda-tools/acp
node --conditions=development --test --import tsx packages/core/test/agent-permissions.test.ts
npm.cmd run check
```

The official [ACP v1 Test Compatibility Kit](https://github.com/agentclientprotocol/acp-tck)
can exercise the full protocol surface against the included fake Core runtime,
without credentials or model charges:

```powershell
uvx --from git+https://github.com/agentclientprotocol/acp-tck acp-tck --timeout 20 --test-timeout 45 --cancel-prompt cancel -- node --conditions=development --import tsx packages/acp/tests/fixtures/stdio-agent.ts
```

On Windows this fixture run passed all 39 applicable v1 cases; 17 optional
cases were skipped. Its conformance verdict was positive. It validates the ACP
adapter, not a live LLM connection. To smoke-test the actual CLI binary, use:

```powershell
uvx --from git+https://github.com/agentclientprotocol/acp-tck acp-tck -k init -- node packages/koda/bin/koda.js acp
```

This filtered run checks initialization only; it does not yield a full
conformance verdict. End-to-end prompt execution with the real Core requires
configured provider credentials, and an actual editor integration should be
checked separately.

For a [Zed custom agent](https://zed.dev/docs/ai/external-agents), add an
`agent_servers` entry in Zed's settings. Replace the paths with the actual
absolute paths on your machine; forward slashes are valid in Windows JSON:

```json
{
  "agent_servers": {
    "KODA": {
      "type": "custom",
      "command": "C:/Program Files/nodejs/node.exe",
      "args": ["C:/path/to/KODA/packages/koda/bin/koda.js", "acp"]
    }
  }
}
```

Open a new external-agent thread in Zed and select KODA. The built-in VS Code
Chat does not become an ACP client automatically; the separate VS Code extension
can continue to call Core directly.

## Implemented protocol surface

- `initialize`, `session/new`, `session/prompt`, `session/cancel`,
  `session/set_mode`, and `session/close`.
- `session/update` text chunks and tool-call start/completion updates.
- ACP `session/request_permission` for Core write, command, and other `ask`
  policies. Missing or disconnected permission handlers deny the action.
- Build and Plan modes from Core. Plan denies writes, commands, MCP calls, and
  delegation even if its agent definition is customized.
- Each session has an isolated Core runtime, history, workspace, MCP manager,
  and cancellation scope. Session IDs and history exist only for this process.

The first version accepts one local workspace root per session. It rejects
client-supplied additional roots and MCP server lists; use KODA's own MCP
configuration. Text and resource links are accepted in prompts. Links outside
the workspace are shown only by label and are never read automatically.
Image/audio, `session/load`, session listing/resume, editor-provided
filesystem and terminal capabilities are not advertised or used.
