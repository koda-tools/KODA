# Tasks — koda-acp-server

Incremental implementation plan.

- [x] 1. Inspect the existing Core bootstrap, agents, observers, sessions/history, policies, tools, MCP, cancellation, process cleanup, and CLI dispatcher; record reusable APIs and gaps.
- [x] 2. Select and pin the stable `@agentclientprotocol/sdk` ACP v1 version; inspect its `agent(...)`, stdio/NDJSON transport, initialize, session, prompt, cancel, update, and permission APIs.
- [x] 3. Define the protocol-neutral ACP adapter contracts for sessions, workspace identity, modes, ordered events, approvals, cancellation, shutdown, and stderr logging.
- [x] 4. Add the ACP package/adapter and `koda acp` command without importing the TUI or changing existing CLI behavior; reserve stdout for the SDK transport.
- [x] 5. Implement stdio ACP initialization and negotiation using the official stable SDK; handle malformed input, disconnects, signals, and idempotent shutdown.
- [x] 6. Implement session creation and isolation by ACP session ID plus canonical workspace identity, including multi-root validation and explicit process-local persistence limitations.
- [x] 7. Implement prompt routing through `bootstrapKoda` and `AgentRuntime`, reusing the existing `build` and `plan` agents, Core history, providers, tools, MCP, and model configuration.
- [x] 8. Prove Plan denies writes and side-effecting commands at Core authorization, and add/adjust reusable Core tests if a host-neutral policy contract is missing.
- [x] 9. Implement ordered bounded streaming from Core observers/provider deltas to ACP session updates, including tool progress, file changes, completion, errors, and safe redaction.
- [x] 10. Implement ACP client permission requests backed by existing Core approval/write/command policies; reject unavailable, cancelled, disconnected, or disposed approvals.
- [x] 11. Implement prompt cancellation propagation to `AbortSignal`, providers, tools, subprocesses, MCP, pending approvals, and session state.
- [x] 12. Add unit tests for contracts, session/workspace isolation, Build/Plan, event ordering, queue bounds, redaction, approvals, cancellation, and shutdown.
- [x] 13. Add stdio integration tests with a fake ACP client covering initialize, sessions, prompts, streaming, approvals, rejection, cancellation, malformed input, and disconnect.
- [x] 14. Validate with a real ACP-compatible client/conformance suite and document exact local commands and supported client limitations. The official ACP v1 TCK passed against the stdio fixture; an IDE integration remains a separate manual check.
- [ ] 15. Run Core, CLI/TUI, ACP tests, type checks, formatting, build, packaging, and `agentic-fy validate koda-acp-server`; resolve all failures before handoff to verification.

Validation note: build, type checks, formatting, packaging, change validation,
Core tests, ACP tests, focused CLI ACP test, and the official ACP v1 TCK pass.
The full CLI/TUI suite still has six unrelated failures: five existing prompt
layout assertions against terminal rendering, plus one package-version assertion
that expects CLI 1.1.0 to equal Core 1.0.0. No TUI implementation was changed
as part of the ACP adapter. A live editor/provider integration remains untested.
