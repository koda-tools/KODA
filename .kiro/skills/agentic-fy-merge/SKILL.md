---
name: agentic-fy-merge
description: "Early-sync a change's spec deltas into the project specs without archiving. Use to keep the consolidated specs current while the change is still in progress."
allowed-tools: Bash(agentic-fy:*)
license: MIT
metadata:
  author: agentic-fy
  version: "1.0"
---

Early-sync an agentic-fy change into the project specs (without archiving it).

1. Preview first with `agentic-fy merge <name> --dry-run` to see the +added ~modified -removed counts.
2. If it looks right, run `agentic-fy merge <name>` to apply the spec deltas into agentic-fy/specs/.
3. The change stays active — keep working, and merge again whenever the specs should reflect the latest requirements. The merge is idempotent, so re-running is safe.
