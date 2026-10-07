# Proposal — multi-provider-ai-abstraction

## Why
Koda already injects an `ILLMProvider` into the agent, but the contract supports only non-streaming completion and the CLI constructs OpenAI directly. Adding another backend today would duplicate message/tool translation and leak credential selection into entry points. A stable provider boundary, capability model, and factory are required before Anthropic, Gemini, and Ollama can be added safely.

## What
Evolve the provider layer into a pluggable Strategy/Adapter architecture that:

- extends normalized contracts for completion, streaming events, model options, tool calling, and provider capabilities;
- keeps vendor SDK types and payload translation inside `src/providers/adapters/`;
- implements OpenAI, Anthropic, Google Gemini, and OpenAI-compatible Ollama adapters;
- creates providers through a typed factory driven by explicit configuration or environment variables;
- lets the CLI select a provider with `KODA_PROVIDER` while preserving `OPENCODE_PROVIDER` as a compatibility alias;
- preserves dependency injection in `CodeAgent` and keeps the agent free of vendor branches;
- verifies every adapter using mocked transports with no network or credentials;
- documents the architecture and rollout in `docs/features/multi-provider-abstraction.md`.

## Scope
- In scope:
  - Strict provider-neutral types with no `any` or vendor SDK imports outside adapters.
  - `complete()`, `stream()`, and `supportsTools()` on every provider.
  - Normalized text deltas, tool-call deltas/final calls, completion metadata, and errors.
  - OpenAI and Anthropic native tool calling.
  - Gemini function calling and text/image input mapping through normalized content parts.
  - Ollama through its OpenAI-compatible HTTP API with configurable local base URL and model.
  - Provider-specific default models and explicit model overrides.
  - Factory validation for provider names, API keys, endpoints, and supported capabilities.
  - Environment-based CLI selection and backward-compatible OpenAI behavior.
  - Unit, contract, factory, CLI, and agent-agnostic integration tests.
- Out of scope:
  - Automatic cross-provider failover, load balancing, routing by cost/latency, or retries.
  - Persisting credentials or provider configuration to disk.
  - OAuth flows, cloud service-account authentication, and model discovery.
  - Audio/video generation, embeddings, image generation, or provider-specific beta APIs.
  - Reworking the terminal UI to render streaming output; this change exposes streaming at the provider/SDK boundary.

## Success criteria
Changing only `KODA_PROVIDER` plus the selected provider's required environment variables selects a backend without changing agent code. OpenAI and Anthropic execute the existing `readFile` tool loop through identical normalized contracts, all four adapters pass transport-mocked mapping tests, and vendor types remain isolated to provider adapters.
