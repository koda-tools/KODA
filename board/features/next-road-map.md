# KODA Feature Roadmap

This directory contains one document per major KODA capability. Each feature document describes its purpose, scope, safety constraints, implementation direction, and definition of done.

## Delivery order

| Priority | Feature | Status | Document |
| --- | --- | --- | --- |
| P0 | Multi-provider abstraction | Implemented | [multi-provider-abstraction.md](./multi-provider-abstraction.md) |
| P0 | Project exploration tools | Planned | [project-exploration.md](./project-exploration.md) |
| P0 | Command execution | Planned | [command-execution.md](./command-execution.md) |
| P0 | Safe patch-based editing | Planned | [safe-patch-editing.md](./safe-patch-editing.md) |
| P1 | Context and memory engine | Planned | [context-engine.md](./context-engine.md) |
| P1 | Automatic validation | Planned | [automatic-validation.md](./automatic-validation.md) |
| P1 | Operation modes | Planned | [operation-modes.md](./operation-modes.md) |
| P1 | Project rules | Planned | [project-rules.md](./project-rules.md) |
| P1 | Multiple sessions and session switching | Planned | [multiple-session-and-change-session.md](./multiple-session-and-change-session.md) |
| P2 | LSP integration | Planned | [lsp-integration.md](./lsp-integration.md) |
| P2 | Session persistence | Planned | [session-persistence.md](./session-persistence.md) |
| P2 | Observability and cost | Planned | [observability-and-cost.md](./observability-and-cost.md) |
| P3 | Subagents | Planned | [subagents.md](./subagents.md) |
| P3 | MCP integration | Planned | [mcp-integration.md](./mcp-integration.md) |

## Recommended sequence

1. Give the agent reliable ways to discover a project.
2. Add controlled command execution and patch-based writes.
3. Add context budgeting and automatic validation.
4. Add explicit operation modes and project-local rules.
5. Add structural intelligence through LSP.
6. Add persistence, observability, subagents, and MCP.

The existing [multi-provider abstraction](./multi-provider-abstraction.md) should remain provider-neutral while these capabilities are added to the core agent and tool registry.
