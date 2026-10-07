# Tasks — mvp-read-file-agent-loop

Incremental implementation plan.

- [x] 1. Configure the TypeScript package for strict NodeNext compilation and add pinned, vetted runtime and test dependencies.
- [x] 2. Define provider-neutral message, tool, tool-call, completion, and `ILLMProvider` contracts without `any`.
- [x] 3. Add typed application error classes for provider, agent, tool, and security failures.
- [x] 4. Write failing unit tests for workspace containment, sensitive-path denial, symlink escape denial, and maximum file size.
- [x] 5. Implement the cross-platform workspace path guard and secure asynchronous `readFile` tool.
- [x] 6. Write failing tests for tool schema publication, unknown tools, malformed JSON, and invalid `readFile` arguments.
- [x] 7. Implement the read-only tool registry, runtime argument validation, and sanitized tool observations.
- [x] 8. Write failing tests for direct model answers, read-file tool continuation, multiple tool calls, and iteration-limit termination using a fake provider.
- [x] 9. Implement the bounded Think → Act → Observe `CodeAgent` loop with injected provider and tool registry.
- [x] 10. Implement and unit-test the OpenAI adapter's normalized message and tool-call translation without making network requests.
- [x] 11. Add the non-interactive CLI entry point with prompt/API-key validation, concise lifecycle output, and graceful error exit codes.
- [x] 12. Export the supported SDK contracts and agent entry points from `src/index.ts`.
- [x] 13. Add an integration-style test proving that a request to inspect `package.json` yields a grounded final response through a fake provider.
- [x] 14. Run formatting, linting, type checking, unit tests, and the production build; resolve all failures.
- [x] 15. Validate the CLI path offline with mocked OpenAI responses and missing-credential behavior; live `OPENAI_API_KEY` smoke test waived by the user.
