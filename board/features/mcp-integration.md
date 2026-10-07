# MCP Integration

## Objective
Connect KODA to external tools and data sources through Model Context Protocol servers.

## Scope
- explicit server configuration;
- tool discovery and normalized schemas;
- per-server and per-tool permissions;
- approval integration with the TUI;
- connection lifecycle, timeout, cancellation, and error normalization.

## Safety
No server is trusted by default. Server processes and tool calls require explicit configuration and must not receive secrets or unrestricted workspace access. Tool output remains untrusted data.

## Definition of done
- A configured MCP server can expose a tool through the KODA registry.
- Permissions and approvals are enforced consistently with built-in tools.
- Disconnect, malformed schema, timeout, and secret-boundary cases have tests.
