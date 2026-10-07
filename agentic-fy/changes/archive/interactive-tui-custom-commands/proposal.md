# Proposal — interactive-tui-custom-commands

## Why
Koda currently accepts one prompt from command-line arguments, prints one answer, and exits. It has no interactive terminal session, no visible provider/model/usage status, and no reusable project workflows. Developers need a focused TUI and OpenCode-compatible custom commands so common prompts can be versioned with a repository and invoked consistently without coupling command parsing to the agent loop.

## What
Add an interactive CLI mode and a custom-command subsystem that:

- starts a terminal session when no positional prompt is supplied in a TTY, while preserving existing batch mode;
- renders Koda branding, selected provider/model, cumulative token usage, optional estimated cost, and a `❯` composer;
- routes input beginning with `/` through a command registry before invoking the LLM;
- discovers Markdown commands and JSON/JSONC command definitions from project-local, compatibility, and user-global sources with deterministic precedence;
- parses optional YAML frontmatter into normalized command metadata;
- expands `$ARGUMENTS`, positional placeholders, fallback arguments, and shell blocks while preserving `@path` text;
- executes shell blocks only through an explicit, bounded, reviewable approval boundary;
- exposes structured agent execution metadata/events so the TUI can update status without vendor-specific logic;
- tests parsing, precedence, expansion, TTY fallback, rendering, and shell safety without requiring provider credentials.

## Scope
- In scope:
  - Interactive readline-based terminal loop with a testable renderer and input abstraction.
  - Static Koda header plus dynamic provider, model, cumulative usage, and estimated cost fields.
  - Existing non-interactive invocation retained for prompts passed through `argv` and non-TTY stdin.
  - Markdown discovery under project `.koda/commands/` and `.opencode/commands/` and user-global Koda/OpenCode command directories.
  - Nested file paths mapped to slash names such as `team/review.md` → `/team/review`.
  - Root and namespaced `koda.json`, `koda.jsonc`, `opencode.json`, and `opencode.jsonc` command maps.
  - Optional frontmatter fields `description`, `agent`, `model`, and `subagent` with strict runtime validation.
  - Deterministic source precedence, duplicate handling, diagnostics, and stable lexical ordering.
  - Quote-aware argument tokenization; `$ARGUMENTS`, `$1`…`$N`, highest-position remainder, missing-position, repeated-position, and fallback behavior.
  - Literal preservation of `@path` expressions.
  - Shell block syntax `!` followed by a backtick-delimited command, expanded only after template arguments and run from the project root with confirmation, timeout, output limits, and a filtered environment.
  - Structured agent result containing final answer, per-run usage, and selected provider/model identity, while preserving `run(): Promise<string>` compatibility.
  - Offline unit and integration tests.
- Out of scope:
  - Full-screen alternate-buffer UI, mouse support, rich Markdown rendering, or advanced autocomplete.
  - Persistent conversation/history across process restarts.
  - Automatic file attachment loading for `@path`; attachments remain literal prompt text.
  - Implementing named agent selection; `agent` is parsed and surfaced as metadata for a later agent registry.
  - True child/background sessions; `subagent: true` is parsed but rejected with an actionable unsupported-feature error in this delivery.
  - Unattended shell execution. Non-interactive execution requires an explicit opt-in policy supplied by the caller.
  - Exact billing guarantees; displayed cost is a labeled estimate and may be unavailable for unknown models.
