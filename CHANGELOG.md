# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/koda-tools/KODA/compare/v0.1.5...HEAD
[0.1.5]: https://github.com/koda-tools/KODA/compare/v0.1.0...v0.1.5
[0.1.0]: https://github.com/koda-tools/KODA/releases/tag/v0.1.0
