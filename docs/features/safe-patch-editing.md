# Safe Patch-Based Editing

## Objective
Replace full-file writes with precise, reviewable, and conflict-aware changes.

## Scope
Add an `applyPatch` capability supporting:
- unified diffs and targeted replacements;
- file creation, modification, and deletion;
- diff preview before approval;
- content hash or version checks;
- atomic application and rollback on failure;
- a limit on files and changed lines per operation.

## Safety
Writes remain inside the workspace sandbox. A patch must fail rather than overwrite a file changed since it was read. Sensitive paths, directories, binary files, and oversized files require explicit handling.

## Definition of done
- The TUI displays an accurate diff before applying changes.
- Stale patches are rejected safely.
- Partial application cannot leave the workspace in an unknown state.
- Patch parsing, conflict, rollback, and approval behavior have tests.
