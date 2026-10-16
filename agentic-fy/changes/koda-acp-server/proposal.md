# Proposal — koda-acp-server

## Why

KODA currently exposes its agent through the CLI/TUI, while ACP-compatible editors and IDEs expect to launch an agent process and communicate with it over JSON-RPC on stdio. A VS Code-specific Chat Participant would solve only one host integration and would not provide the requested editor-independent protocol boundary.

## What

Add `koda acp`, an ACP v1 agent server that speaks JSON-RPC over stdio and delegates execution to the existing `@koda-tools/core`. The server will negotiate with an ACP client, create and isolate sessions, execute prompts through `bootstrapKoda` and `AgentRuntime`, stream incremental updates, forward permission requests to the client, propagate cancellation, and close Core/MCP resources cleanly.

The ACP layer will be independent of the CLI/TUI. Normal logs and diagnostics go to stderr; stdout is reserved exclusively for protocol messages. Build and Plan remain the existing Core agents/policies, with no parallel runtime or permission model.

## Scope

- In scope:
  - An ACP server package/adapter and the `koda acp` CLI command.
  - Official `@agentclientprotocol/sdk` stable ACP v1 integration over stdio/NDJSON.
  - Initialization, process-local session creation, prompt turns, ordered streaming, permission requests, cancellation, and shutdown. Resume/load is deferred until Core has durable sessions.
  - Reuse of Core agents, tools, MCP, providers, model configuration, permissions, and workspace isolation.
  - Build and Plan mode routing, tests, ACP client compatibility validation, and developer documentation.
- Out of scope:
  - A second agent runtime, provider abstraction, tool registry, MCP client, or permission system.
  - Changes to the existing VS Code Chat Participant; it remains an independent Core host and does not automatically become an ACP client.
  - ACP v2 experimental APIs, HTTP/WebSocket transports, or remote server deployment in the first increment.
  - Changes to existing CLI/TUI behavior except adding the `acp` subcommand.
