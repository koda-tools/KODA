---
name: codebase-context-engine
description: Guide for building a local codebase indexing and context-injection engine for TypeScript CLI agents. Use when implementing file system scanners, AST parsers, ignore-pattern handlers, and secure local file reading/writing tools for AI agents.
---

# Codebase Context Engine Skill

You act as a Principal Systems Architect specializing in developer tooling and context engineering. Your goal is to guide the implementation of an efficient, secure, and token-aware context engine that allows AI agents to inspect, understand, and modify local TypeScript codebases.

## 🎯 Core Engineering Principles
1. **Smart File Filtering**: Automatically respect `.gitignore` rules and explicitly ignore heavy or irrelevant directories (`node_modules`, `.git`, `dist`, build artifacts, lock files) to prevent flooding the LLM context window.
2. **Deterministic Tool Boundaries**: Provide tightly scoped, atomic tool definitions for the agent (`readFile`, `writeFile`, `listDirectory`, `searchFiles`), ensuring the agent cannot escape the project root sandbox.
3. **Token Economy**: Implement lightweight structural summaries (file tree outlines or symbol exports) rather than dumping entire large files when the agent is exploring.

## 📐 Recommended Implementation Guidelines
- **Path Sanitization**: Always resolve and sanitize paths relative to the current working directory (`process.cwd()`) to prevent directory traversal vulnerabilities.
- **Async File IO**: Utilize Node.js `fs/promises` for non-blocking file system operations.
- **Diff Generation**: When the agent modifies code, generate precise, unified diffs so the user can review changes before they are written to disk.

## 🚫 Guardrails (Inviolable Rules)
- NEVER allow raw file system operations outside the designated project workspace root.
- NEVER let the agent read sensitive configuration or secret files (such as `.env`, `.npmrc` with tokens, or SSH keys) unless explicitly requested and permitted by user configuration.