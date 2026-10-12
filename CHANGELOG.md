# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Many more providers, all served by the existing AI SDK adapter with no new dependency: the hosted OpenAI-compatible vendors (OpenRouter, Groq, Cerebras, Together, Fireworks, DeepInfra, Nebius, Baseten, DeepSeek, xAI, Mistral, Moonshot, Z.AI, NVIDIA) and the local servers (LM Studio, vLLM, llama.cpp). `/connect` lists every provider that needs a key, each uses `<NAME>_API_KEY` / `<NAME>_MODEL` / `<NAME>_BASE_URL`, and `KODA_PROVIDER=<name>` selects it. A provider is now a catalog entry: provider identity is validated against the catalog instead of a closed type union, and the factory dispatches on the entry's SDK kind rather than a per-provider function, so adding another OpenAI-compatible provider is data, not code.
- `/model` now lists real models for Anthropic and Gemini, not just OpenAI and Ollama. Both read model ids straight from the vendor's API (`GET /v1/models` for Anthropic, `GET /v1beta/models` for Gemini), filtered to active, chat-capable models, with credentials sent in headers rather than in the URL.
- The provider catalog (price, context limit, output limit, tool support) now refreshes itself from [models.dev](https://models.dev) in the background and caches the result at `~/.config/koda/catalog-cache.json` for up to 7 days. A session never blocks on this: it starts on the cache or the built-in snapshot it already has, and a stale cache is refreshed quietly for the *next* session. Estimated cost now resolves for every model in the catalog instead of three hardcoded entries, and the local Ollama provider now reports `$0.0000` instead of `N/A`, since local inference has no API spend.
- The conversation is now trimmed by the selected model's context window instead of a fixed 40 messages. Whole older turns are dropped until the history fits, and the transcript says how many messages were dropped (`Context trimmed: …`). Switching to a model with a smaller window trims right away.
- Every request now carries an explicit output limit taken from the model catalog (capped at 32,768 tokens). Claude no longer stops at 4,096 tokens, and all four built-in providers behave the same.

### Changed

- Default models are now current, tool-capable, and confirmed to accept `temperature` end to end: `OPENAI_MODEL` defaults to `gpt-4.1-mini` (was `gpt-4o-mini`), `ANTHROPIC_MODEL` defaults to `claude-sonnet-4-6` (was `claude-3-5-sonnet-latest`, which no longer resolves to any model Anthropic serves), and `GEMINI_MODEL` defaults to `gemini-3.8-flash` (was `gemini-2.5-flash`, cheaper but two generations old). The Gemini default costs more per token ($0.75/$3.75 against $0.30/$2.50); set `GEMINI_MODEL` to keep the previous model. Several current `gpt-5`/`gpt-6` and Claude "5" models were considered and rejected as defaults because they silently drop the `temperature` parameter KODA's agent loop and custom agent files rely on — see the catalog-refresh design notes for the two separate reasons this happens (the vendor API itself, and in OpenAI's case the AI SDK's own model-id heuristic, independent of the vendor).
- All providers (OpenAI, Anthropic, Gemini, Ollama) now run through the [AI SDK](https://ai-sdk.dev) behind the same `ILLMProvider` contract, replacing the four hand-written adapters. Ollama uses `@ai-sdk/openai-compatible`, and OpenAI keeps the Chat Completions API. The agent loop, MCP and the terminal UI are unchanged.
- Cancelling a streaming request now fails the stream on every provider. OpenAI, Anthropic and Ollama used to close it with the partial text, as if the answer were complete.
- The message field is now a box with an accent bar, a placeholder and a footer showing the agent and model on the left and the send hint on the right.
- The message field's border uses the same gray background as the message blocks.
- The sidebar now sits on the right of the chat instead of the left.
- The primary agent is now switched with `Alt+A` (next) and `Alt+Shift+A` (previous) instead of `Tab` / `Shift+Tab`.

### Breaking

- Node.js 22 or newer is required, as the AI SDK packages do not support Node 20 (which reached end of life in April 2026).
- The provider option types no longer accept a vendor SDK `client`. Inject a standard `fetch` instead, which keeps vendor types out of the public API.
- The exported `ProviderName` type is now `string` (a provider is a catalog entry validated at runtime), so it no longer autocompletes to the four built-in names. Use the new `BuiltInProvider` type where a known-name literal is needed.
- `ProviderConfig` is now a single generic shape (`provider`, optional `apiKey`, `model`, `baseURL`, `toolSupport`) instead of a discriminated union with a hand-written Ollama variant. `ProviderSpec` gained `label`, `local`, `images` and `imageMediaTypes`, and `defaultMaxTokens` was replaced by `defaultLimit` (context and output tokens).

### Dependencies

- Added `ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/openai-compatible` and `zod`.
- Removed `openai`, `@anthropic-ai/sdk` and `@google/genai`.

## [0.1.6] - 2026-10-09

### Added

- MCP support: servers configured in the `mcp` section of `koda.json` / `opencode.json` (same format as OpenCode). Local servers (stdio) and remote servers (streamable HTTP, falling back to SSE), `{env:NAME}` placeholders, per-server `enabled` and `timeout`.
- `/mcp` command to list servers, their status and tool count.
- `mcp` permission key to allow, ask or deny MCP tools by name pattern (allowed by default).
- MCP tools are exposed as `<server>_<tool>` to every agent and subagent. Servers connect in the background, and a failing server never blocks the session.
- Documentation: an "MCP servers" section on the site and in the README, and `/connect` and `/mcp` in the command tables.

### Changed

- Local MCP servers only receive a safe set of environment variables plus the `environment` set in the config, so session API keys are not passed on.
- The documentation site uses a dark scrollbar that matches the theme.

### Dependencies

- Added `@modelcontextprotocol/sdk` 1.31.0.

## [0.1.5] - 2026-10-09

Covers the changes made since 0.1.0 (versions 0.1.1 to 0.1.5 were not released separately).

### Added

- Sessions are now named after the first message typed in them.
- Documentation site: mobile hamburger menu, GitHub link, and a `/connect` section.

### Changed

- Approval choices are now `Accept` and `Reject` (previously `Autorizar` and `Rejeitar`), and the hint line is in English.
- Message blocks use a darker gray background.
- The documentation site and `README.md` are now in English.
- The docs deploy workflow targets the `koda-code` Cloudflare Pages project.

### Fixed

- Text in message blocks no longer touches the right edge of the transcript; it now keeps a 2-column margin.

## [0.1.0] - 2026-10-09

First release of KODA, a secure TypeScript AI coding agent for the terminal.

### Added

- Interactive terminal UI with a sidebar, scrollable transcript, command suggestions and approval prompts (Authorize / Reject).
- Multiple providers: OpenAI, Anthropic, Gemini and Ollama (local), selected with `KODA_PROVIDER`.
- `/connect` and `koda connect [provider]` to save an API key in `~/.config/koda/auth.json` (permission `600`). The first connected provider becomes the default, and environment variables still take precedence.
- Tools: `readFile` (with line ranges), `writeFile`, `listDirectory`, `searchFiles`, `getFileInfo` and `runCommand`.
- Safe command execution: risk classification, process-tree kill, bounded output and an environment allowlist.
- File writes show a diff and ask for approval first.
- Multiple sessions with a session switcher (`Alt+S`), new session (`Ctrl+N`) and sidebar toggle (`Ctrl+B`).
- Agents: `build` and `plan` (primary), `general` and `explore` (subagents). Cycle with `Tab`, delegate with `@agent`.
- Custom agents, commands and skills in Markdown under `.koda/`, with OpenCode compatibility (`.opencode/`, `.claude/`, `.agents/`).
- Per-tool permissions (`allow`, `ask`, `deny`) with glob patterns.
- Built-in commands: `/help`, `/commands`, `/model`, `/agents`, `/agent`, `/skills`, `/connect`, `/clear` and `/exit`.
- SDK exported from `dist/src/index.js`.
- Documentation site in `docs/` (dark and light themes) and a `README.md`.
- GitHub Actions to deploy the docs site and to publish to npm when a GitHub Release is published.

### Changed

- The package is published as `@koda-tools/koda`.

[Unreleased]: https://github.com/koda-tools/KODA/compare/v0.1.6...HEAD
[0.1.6]: https://github.com/koda-tools/KODA/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/koda-tools/KODA/compare/v0.1.0...v0.1.5
[0.1.0]: https://github.com/koda-tools/KODA/releases/tag/v0.1.0
