# Proposal — add-koda-init

## Why
Nothing in KODA creates the `.koda/` folder. A user starting a project from
scratch has to know the layout (`commands/`, `skills/`, `agents/`) and create it
by hand. `/skills` even tells them to "Add .koda/skills/<name>/SKILL.md" with no
way to do it from the tool.

## What
Add a `koda init` subcommand and an `/init` slash command that scaffold the
project's `.koda/` folder with `commands/`, `skills/` and `agents/`. It is safe
to run repeatedly: existing folders and files are never touched, and the output
says what was created and what was already there.

## Scope
- In scope:
  - `koda init` (no provider key, no session, no network needed).
  - `/init` built-in in the interactive session, same behavior.
  - One shared function that does the work, so both entry points agree.
  - Listing `/init` in `/help` and in the command suggestions.
  - Tests and a README section.
- Out of scope:
  - Generating an `AGENTS.md`, sample commands, skills or agents.
  - Writing a `koda.json`.
  - Creating the global `~/.config/koda` folder.
  - Interactive prompts or flags (`--force`, `--global`).
