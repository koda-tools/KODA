# interactive-tui-custom-commands

## Purpose
Provide Koda with a testable interactive terminal session and a secure, deterministic custom slash-command system sourced from Markdown and JSON/JSONC files.

## Requirements

### Requirement: CLI mode selection {#cli-mode-selection}
The system SHALL preserve positional batch execution, start interactive mode only when no prompt is supplied and terminal input/output are interactive, and fail without hanging when no prompt is supplied in a non-interactive environment.
> verify: `npm test`

#### Scenario:
- WHEN positional prompt arguments are present
- THEN the CLI runs one batch request and exits with existing error semantics

#### Scenario:
- WHEN no prompt is present and stdin/stdout are TTYs
- THEN the CLI starts the interactive Koda session

#### Scenario:
- WHEN no prompt is present and either stream is not a TTY
- THEN the CLI prints usage and exits with status 2

### Requirement: Interactive terminal layout {#interactive-terminal-layout}
The system SHALL render Koda branding, provider, model, cumulative token usage, optional estimated cost, and a visible input prompt using terminal-capability-aware output.
> verify: `npm test`

#### Scenario:
- WHEN an interactive session starts
- THEN the header and a ready prompt prefixed with ❯ are rendered

#### Scenario:
- WHEN a completed request reports usage
- THEN cumulative usage and known-model estimated cost are updated

#### Scenario:
- WHEN pricing is unknown or color is disabled
- THEN cost displays N/A and the layout remains readable without ANSI styling

### Requirement: Detailed agent execution metadata {#detailed-agent-execution}
The system SHALL expose a structured agent execution result that accumulates usage across all completion rounds and identifies the selected provider and model while preserving the existing string-returning run method.
> verify: `npm test`

#### Scenario:
- WHEN a tool loop uses multiple provider completions
- THEN input and output token usage is accumulated in the detailed result

#### Scenario:
- WHEN an existing SDK caller invokes run
- THEN it receives the final answer string with backward-compatible behavior

#### Scenario:
- WHEN a command supplies a valid model override
- THEN the override is forwarded through provider-neutral completion options

### Requirement: Markdown custom command parsing {#markdown-command-parsing}
The system SHALL parse size-limited Markdown command files whose optional leading YAML frontmatter contains only validated description, agent, model, and subagent metadata and whose remaining body is a non-empty prompt template.
> verify: `npm test`

#### Scenario:
- WHEN a Markdown file contains valid optional frontmatter
- THEN metadata and the clean body are normalized into a custom command

#### Scenario:
- WHEN frontmatter has invalid types, aliases, tags, nested values, malformed delimiters, or an invalid model identifier
- THEN the source is rejected with a path-aware diagnostic

#### Scenario:
- WHEN a Markdown command exceeds the configured size limit
- THEN it is rejected before its entire content is accepted for parsing

### Requirement: JSON and JSONC custom command parsing {#jsonc-command-parsing}
The system SHALL parse size-limited JSON or JSONC configuration files with commands containing a required template and validated optional description, agent, model, and subagent properties without evaluating code.
> verify: `npm test`

#### Scenario:
- WHEN a configuration contains comments, trailing commas, and valid commands
- THEN every command is normalized deterministically

#### Scenario:
- WHEN a command lacks a template, uses an invalid metadata type, or contains prototype-polluting keys
- THEN the configuration is rejected with a path-aware diagnostic

### Requirement: Deterministic command discovery and precedence {#deterministic-command-discovery}
The system SHALL asynchronously discover non-symlink Markdown and JSON/JSONC commands from project Koda, project OpenCode-compatible, global Koda, and global OpenCode-compatible sources using documented deterministic precedence and ordering.
> verify: `npm test`

#### Scenario:
- WHEN .koda/commands/team/review.md is valid
- THEN it is registered as /team/review

#### Scenario:
- WHEN the same command exists in local Koda and lower-priority sources
- THEN the local Koda definition wins and its source remains visible

#### Scenario:
- WHEN duplicate names occur within the same precedence level
- THEN discovery reports a deterministic validation error

#### Scenario:
- WHEN a discovered entry is a symlink, non-Markdown command file, or outside an injected allowed root
- THEN the entry is ignored or rejected without reading an escaped target

### Requirement: Command argument expansion {#command-argument-expansion}
The system SHALL expand full and positional command arguments with quote-aware tokenization, highest-position remainder semantics, empty missing positions, deterministic repeated placeholders, fallback appending, and literal attachment text preservation.
> verify: `npm test`

#### Scenario:
- WHEN a template contains $ARGUMENTS
- THEN it is replaced by the exact trimmed remainder after the command name

#### Scenario:
- WHEN a template contains positional placeholders
- THEN quoted words form one argument, lower positions consume one token, and the numerically highest position consumes its token and all remaining tokens

#### Scenario:
- WHEN a referenced position is missing or repeated
- THEN missing values become empty strings and repeated placeholders reuse the same expansion

#### Scenario:
- WHEN a template has no argument placeholders and arguments are non-empty
- THEN two line breaks and the full arguments are appended

#### Scenario:
- WHEN arguments or templates contain @path text
- THEN the text remains unchanged for downstream attachment handling

#### Scenario:
- WHEN argument quotes are unterminated
- THEN expansion fails before shell or provider execution

### Requirement: Approved bounded shell expansion {#approved-shell-expansion}
The system SHALL replace backtick-delimited shell blocks only after argument expansion and explicit policy approval, using the project working directory, filtered environment, timeout, output limits, no stdin, and structured failure handling.
> verify: `npm test`

#### Scenario:
- WHEN an interactive custom command contains a shell block
- THEN the expanded command and source are displayed for approval before process creation

#### Scenario:
- WHEN approval is denied or non-interactive policy does not explicitly allow execution
- THEN no process starts and no prompt is submitted

#### Scenario:
- WHEN execution succeeds within limits
- THEN captured stdout replaces the shell block in the prompt

#### Scenario:
- WHEN execution times out, exceeds output limits, or exits non-zero
- THEN processing stops with an actionable error and no LLM request

### Requirement: Slash command routing {#slash-command-routing}
The interactive application SHALL intercept slash-prefixed input before LLM submission, execute built-in or registered commands, and submit only the successfully expanded final prompt.
> verify: `npm test`

#### Scenario:
- WHEN input does not start with a slash
- THEN it is submitted unchanged to the agent

#### Scenario:
- WHEN /help, /commands, or /exit is entered
- THEN the corresponding built-in behavior occurs without an LLM request

#### Scenario:
- WHEN a registered command is entered
- THEN discovery metadata, argument expansion, shell policy, and model override are applied before agent execution

#### Scenario:
- WHEN an unknown command is entered
- THEN a useful error and deterministic suggestions are shown without an LLM request

#### Scenario:
- WHEN a command declares subagent true
- THEN execution is rejected as unsupported before shell or provider side effects

### Requirement: Interactive session resilience {#interactive-resilience}
The interactive session SHALL handle recoverable command and agent failures without terminating, close cleanly on exit or EOF, and treat Ctrl+C as active-request cancellation before idle-session exit.
> verify: `npm test`

#### Scenario:
- WHEN parsing, discovery, shell, or provider execution fails
- THEN a concise error is rendered and the next prompt remains available

#### Scenario:
- WHEN EOF or /exit is received
- THEN terminal resources close and the process exits successfully

#### Scenario:
- WHEN Ctrl+C occurs during an active request
- THEN the request is aborted and the session remains available
