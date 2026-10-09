# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/koda-tools/KODA/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/koda-tools/KODA/releases/tag/v0.1.0
