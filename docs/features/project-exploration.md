# Project Exploration Tools

## Objective
Enable KODA to discover a codebase without requiring the user to provide file paths manually.

## Scope
- `listDirectory`: bounded recursive listing with depth and result limits.
- `searchFiles`: text and regular-expression search with file and result limits.
- `getFileInfo`: safe metadata inspection.
- Line-range reads for `readFile`.
- `.gitignore`-aware filtering with defaults for `node_modules`, `.git`, build output, and binary files.

## Safety
All paths must use the existing workspace sandbox. Sensitive files remain inaccessible. Search output must not expose secrets, and every operation needs cancellation and output limits.

## Definition of done
- The agent can identify relevant files from a natural-language request.
- Large repositories do not produce unbounded output.
- Traversal, symlink, sensitive-file, binary-file, and cancellation cases have tests.
