# Project Rules and Local Instructions

## Objective
Allow repositories to define conventions that KODA follows consistently.

## Scope
Support `KODA.md` and compatible `AGENTS.md` files with:
- global, workspace, and nested-directory scope;
- inheritance from parent directories;
- more-specific rules overriding general rules;
- clear inclusion in the agent system context;
- safe handling of untrusted file content.

## Safety
Rules are guidance, not permission grants. They cannot bypass sandbox, approval, or operation-mode restrictions. Project instructions must be clearly separated from tool output.

## Definition of done
- Editing a nested file loads the correct rule hierarchy.
- Rule precedence is deterministic and documented.
- Missing, malformed, and conflicting rule files are handled safely.
