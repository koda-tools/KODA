---
name: "agentic-fy: Verify"
description: Verify the implementation against the spec and mark the change verified. Use before archiving.
allowed-tools: Bash(agentic-fy:*)
category: Workflow
tags:
  - agentic-fy
  - workflow
---

Verify an agentic-fy change.

1. Run `agentic-fy verify <name>`.
2. If artifacts are missing or tasks are still pending, resolve them and run verify again.
3. Once it reports the change as verified, hand off to `/agentic-fy:archive <name>`.
