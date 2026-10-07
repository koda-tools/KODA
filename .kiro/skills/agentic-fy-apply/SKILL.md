---
name: agentic-fy-apply
description: Implement the tasks of a change from its tasks.md. Use when the plan is ready and it is time to write code.
allowed-tools: Bash(agentic-fy:*)
license: MIT
metadata:
  author: agentic-fy
  version: "1.0"
---

Implement an agentic-fy change.

1. Run `agentic-fy apply <name>` to read tasks.md and see what is pending.
2. Implement the pending tasks in order, keeping alignment with design.md and specs/.
3. As each task is completed, mark it `- [x]` in tasks.md.
4. When everything is done, hand off to `/agentic-fy:verify <name>`.
