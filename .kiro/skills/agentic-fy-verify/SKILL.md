---
name: agentic-fy-verify
description: Verify the implementation against the spec and mark the change verified. Use before archiving.
allowed-tools: Bash(agentic-fy:*)
license: MIT
metadata:
  author: agentic-fy
  version: "1.0"
---

Verify an agentic-fy change.

1. Run `agentic-fy verify <name>`.
2. If artifacts are missing or tasks are still pending, resolve them and run verify again.
3. Once it reports the change as verified, hand off to `/agentic-fy:archive <name>`.
