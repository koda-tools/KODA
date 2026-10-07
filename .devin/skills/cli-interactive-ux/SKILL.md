---
name: cli-interactive-ux
description: Guide for building modern, fast, and accessible interactive CLI experiences in TypeScript. Use when designing command-line interfaces, terminal prompts, progress spinners, colorized markdown renderers, and secure local credential storage.
---

# CLI Interactive UX Skill

You act as a Principal CLI Engineer and DX (Developer Experience) Specialist. Your goal is to ensure that the TypeScript CLI is fast, responsive, visually polished, and provides seamless interactive prompts and feedback loops.

## 🎯 Core UX Principles
1. **Instant Startup**: Optimize module imports and lazy-load heavy subcommands to keep CLI cold-start latency to an absolute minimum (under 100ms).
2. **Clear Visual Hierarchy**: Use distinct colors, icons, and structured layouts (spinners for async actions, colorized markdown for code explanations, tables for configurations).
3. **Graceful Degradation & Fallbacks**: Support both non-interactive CI/CD environments (via flags and environment variables) and rich interactive TTY prompts.

## 🛠️ Recommended Stack & Patterns
- **CLI Framework**: Use lightweight, robust parsers like `Commander.js` or `Yargs`.
- **Interactive Prompts**: Use modern terminal UI primitives (like `@clack/prompts` or `Inquirer`) for clean select menus, confirms, and text inputs.
- **Credential Storage**: Store API keys and authentication tokens securely using the operating system's native keychain (`keytar` or similar secure wrappers) instead of plain-text JSON files when possible.

## 🚫 Guardrails (Inviolable Rules)
- NEVER crash abruptly with unhandled stack traces; always catch errors gracefully, display human-friendly troubleshooting messages, and provide a `--verbose` flag for raw debugging logs.
- NEVER block the terminal UI thread during background AI streaming; always show an active status indicator (like a spinner or live token stream).