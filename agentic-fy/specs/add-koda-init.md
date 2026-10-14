# add-koda-init

## Purpose
Bootstrap the project's .koda folder from the CLI and from a session.

## Requirements

### Requirement: Init creates the .koda folders {#init-creates-koda-folders}
The system SHALL create .koda/commands, .koda/skills and .koda/agents under the workspace root when init runs, and report which were created.
> verify: `cd packages/koda && node --conditions=development --import tsx --test test/init.test.ts`

#### Scenario:
- WHEN the user runs `koda init` in a folder with no .koda
- THEN the three folders exist and the output lists them as created

#### Scenario:
- WHEN the user runs /init in an interactive session
- THEN the same folders are created and the result is written to the transcript

### Requirement: Init never overwrites existing content {#init-is-idempotent}
The system SHALL leave existing folders and files untouched when init runs again, and report them as already present.
> verify: `cd packages/koda && node --conditions=development --import tsx --test test/init.test.ts`

#### Scenario:
- WHEN init runs in a project that already has .koda/skills with files
- THEN the files are unchanged and only the missing folders are created

### Requirement: Init fails clearly when .koda is a file {#init-rejects-conflicting-file}
The system SHALL fail with an explanatory error and a non-zero exit code when .koda exists but is not a directory.
> verify: `cd packages/koda && node --conditions=development --import tsx --test test/init.test.ts`

#### Scenario:
- WHEN a regular file named .koda exists and the user runs `koda init`
- THEN no folder is created and the error names the path

### Requirement: Init works without a provider key {#init-needs-no-provider}
The system SHALL run `koda init` without requiring an API key, a network connection or an interactive terminal.
> verify: `cd packages/koda && node --conditions=development --import tsx --test test/init.test.ts`

#### Scenario:
- WHEN no provider credentials are configured
- THEN `koda init` still creates the folders and exits with code 0

### Requirement: /init is discoverable {#init-listed-in-help}
The system SHALL list /init in the /help output and in the slash-command suggestions.
> verify: `cd packages/core && node --conditions=development --import tsx --test test/commands.test.ts`

#### Scenario:
- WHEN the user types /help or starts typing /in
- THEN /init is shown
