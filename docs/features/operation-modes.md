# Operation Modes

## Objective
Make the level of agent autonomy explicit for each session.

## Modes
- **Plan:** read and search only; produces a plan and affected-file list.
- **Build:** can edit and run approved commands; always shows diffs.
- **Review:** analyzes the current diff for defects, security issues, and regressions without editing.

## Safety
Permissions must be enforced by the tool registry, not only by prompts or UI labels. A mode change is visible and applies to every subsequent tool call.

## Definition of done
- Each mode has a tested tool permission matrix.
- Plan and Review cannot mutate the workspace.
- Build still requires configured approval policies for writes and commands.
- The current mode is displayed in batch and interactive interfaces.
