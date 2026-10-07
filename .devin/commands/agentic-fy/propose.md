---
name: "agentic-fy: Propose"
description: "Create a change and draft its artifacts (proposal, design, tasks, spec). Use when the user describes something to build. Also triggers on \"agentic-fy propose\"."
allowed-tools: Bash(agentic-fy:*)
category: Workflow
tags:
  - agentic-fy
  - workflow
---

Propose a new agentic-fy change.

**Input**: the argument after `/agentic-fy:propose` is the change name (kebab-case, e.g. add-dark-mode).

1. Run `agentic-fy propose <name>` to scaffold the change and its artifacts.
2. Fill in the artifacts with real content:
   - `proposal.md` - the why and what (intent, scope).
   - `specs/spec.md` - requirements and acceptance criteria.
   - `design.md` - the technical approach.
   - `tasks.md` - an implementation checklist using `- [ ]` checkboxes.
3. Validate with `agentic-fy validate <name>` and fix any reported issues.
4. Hand off to `/agentic-fy:apply <name>` to implement.
