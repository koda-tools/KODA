---
name: "agentic-fy: Validate"
description: "Check a change's artifacts and spec deltas for problems (missing/empty artifacts, untouched templates, malformed deltas). Use before apply or verify."
allowed-tools: Bash(agentic-fy:*)
category: Workflow
tags:
  - agentic-fy
  - workflow
---

Validate an agentic-fy change.

1. Run `agentic-fy validate <name>` (or `--all` for every active change).
2. Fix each reported ERROR; review WARNINGs (templates left unfilled, near-empty artifacts).
3. Use `--strict` to treat warnings as failures when you want a clean bar before verifying.
