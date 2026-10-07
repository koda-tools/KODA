# Language Server Integration

## Objective
Give KODA structural code intelligence and compiler-style diagnostics.

## Scope
Initial support should cover:
- language-server discovery and lifecycle;
- diagnostics after edits;
- definitions and references;
- workspace symbols;
- cancellation and restart after server failure.

## Safety
Language servers run under an explicit workspace scope and resource limits. Their output is untrusted tool data and cannot change permissions or execute commands.

## Definition of done
- At least TypeScript diagnostics, definitions, and references work end to end.
- Diagnostics can be returned to the agent after a patch.
- Server startup, timeout, crash, and workspace-boundary cases have tests.
