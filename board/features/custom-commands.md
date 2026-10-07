# Koda custom commands

Koda discovers project commands from `.koda/commands/**/*.md`, `.koda/koda.jsonc`, and root `koda.jsonc`. Equivalent `.opencode` and `opencode.jsonc` locations are supported after Koda sources. User-global commands are loaded from `~/.config/koda` and then `~/.config/opencode`. Project sources override global sources, and nested Markdown paths become slash commands.

Markdown files may start with YAML frontmatter containing `description`, `agent`, `model`, and `subagent`. The body is the prompt template. JSONC files define the same fields under `commands`, with a required `template`.

Templates support `$ARGUMENTS` and positional `$1`, `$2`, and later placeholders. Quoted arguments stay grouped, and the highest positional placeholder consumes the remainder. If a template has no placeholders, arguments are appended after a blank line. `@path` remains literal.

Shell blocks use `!` followed by a backtick-delimited command. They run from the project directory only after the expanded command is shown and explicitly approved. Treat command files as executable code. Execution has timeout and output limits and is denied by default outside interactive mode.

A `provider/model` or `provider/model#variant` model override is forwarded to the selected provider. `agent` is currently informational. Commands with `subagent: true` are rejected because child sessions are not yet supported.
