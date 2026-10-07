# Tasks — multi-provider-ai-abstraction

- [x] 1. Capture backward-compatibility tests for the existing OpenAI completion, tool-call loop, CLI defaults, and public exports.
- [x] 2. Extend provider-neutral message/content, completion options, streaming events, metadata, capabilities, and `ILLMProvider` contracts without vendor types or `any`.
- [x] 3. Add reusable provider conformance fixtures for completion, streaming, tool calls, malformed responses, cancellation, and normalized errors.
- [x] 4. Move the OpenAI implementation into `src/providers/adapters/`, preserve compatibility exports, and implement streaming plus capability reporting.
- [x] 5. Select and install exact, vetted official Anthropic and Google Gen AI SDK versions; document dependency and startup impact in the feature roadmap.
- [x] 6. Implement and test the Anthropic adapter, including system separation, tool-use/tool-result blocks, streaming, usage, and error normalization.
- [x] 7. Implement and test the Gemini adapter, including normalized text/image parts, function declarations/calls, deterministic missing call IDs, streaming, and errors.
- [x] 8. Implement and test the Ollama adapter over the OpenAI-compatible API with local defaults, configurable endpoint/model, streaming, and tool capability checks.
- [x] 9. Define the discriminated provider configuration union and implement `ProviderFactory.create()` with exhaustive provider selection and validation.
- [x] 10. Implement `ProviderFactory.fromEnvironment()` with canonical `KODA_PROVIDER`, compatibility `OPENCODE_PROVIDER`, provider-specific keys/models/endpoints, and secret-safe errors.
- [x] 11. Refactor the CLI to use the provider factory while preserving OpenAI-by-default behavior and graceful configuration failures.
- [x] 12. Verify `CodeAgent` remains vendor-agnostic and add parameterized read-file tool-loop tests for OpenAI and Anthropic adapter mappings.
- [x] 13. Export factory, configuration, capability, multimodal, streaming, and adapter APIs from the SDK without leaking vendor types.
- [x] 14. Add static boundary checks that reject vendor SDK imports outside `src/providers/adapters/` and direct vendor branching in `src/core/`.
- [x] 15. Add `docs/features/multi-provider-abstraction.md` with configuration examples, architecture, rollout phases, supported capabilities, and security guidance.
- [x] 16. Run formatting, linting, type checking, unit/contract/integration tests, production build, and agentic-fy validation; resolve all failures.
- [x] 17. Perform credential-free smoke tests for every provider through mocked transports and document live credential tests as optional user-run checks.
