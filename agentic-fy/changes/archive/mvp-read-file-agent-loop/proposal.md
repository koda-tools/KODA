# Proposal — mvp-read-file-agent-loop

## Why
OpenCode needs a minimal end-to-end proof that an LLM can decide to inspect local project context, invoke a controlled tool, receive the observation, and turn it into a useful terminal response. The repository currently has roadmap intent but no executable agent path. This change establishes that vertical slice without committing the MVP to a broad CLI framework, multiple providers, streaming, or file mutation.

## What
Implement a strictly typed TypeScript proof of concept with:

- a provider-neutral internal contract for chat messages, tool definitions, tool calls, and completion responses;
- an OpenAI adapter that translates the internal contract to OpenAI chat completions with function calling;
- a `readFile` tool that performs asynchronous UTF-8 reads inside the project root while denying traversal, absolute paths outside the root, and sensitive files;
- a bounded Think → Act → Observe agent loop that dispatches validated tool calls and requests a final natural-language answer;
- a non-interactive CLI entry point that accepts a prompt, reads `OPENAI_API_KEY` from the environment, and prints concise lifecycle and result output;
- automated tests using a fake provider so the tool loop and sandbox can be verified without network calls or credentials.

## Scope
- In scope:
  - One OpenAI-backed completion adapter and one configurable model default.
  - One read-only local tool (`readFile`) registered through an explicit dispatcher.
  - JSON argument parsing and runtime validation without `any`.
  - Project-root containment checks that work across supported operating systems.
  - Blocking known sensitive paths such as `.env`, `.git`, `.npmrc`, SSH material, and credential files.
  - A bounded loop supporting one or more sequential read calls up to a configured iteration limit.
  - Human-readable CLI errors with non-zero exit status.
  - Unit tests for successful reads, denied paths, malformed/unknown tool calls, direct answers, and tool-result continuation.
- Out of scope:
  - Anthropic, Gemini, or local model adapters.
  - Streaming output, interactive prompts, Commander.js subcommands, rich terminal rendering, or secure keychain setup.
  - File writes, directory listing, search, indexing, memory trimming, approvals, or autonomous code modification.
  - Production-grade retries, rate-limit backoff, telemetry, and persistent conversation history.
