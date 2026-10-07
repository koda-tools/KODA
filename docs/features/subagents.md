# Subagents

## Objective
Allow specialized, bounded agents to collaborate on larger tasks.

## Scope
Initial delegation should support:
- read-only exploration agents;
- implementation agents with explicit permissions;
- review agents for diff analysis;
- bounded depth, time, iterations, and cost;
- structured result and error exchange.

## Safety
Subagents cannot approve operations for one another. Read-only is the default. Shared-workspace writes require coordination and conflict detection.

## Definition of done
- A parent agent can delegate and receive a structured result.
- Limits are enforced even when a child loops or fails.
- Child permissions cannot exceed the parent session's permissions.
- Delegation, cancellation, and partial failure have tests.
