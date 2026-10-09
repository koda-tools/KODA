```
 ▀ ▀
█▀█▀█
▀▀▀▀▀
KODA
```

A secure coding agent for the terminal, written in TypeScript. CLI and SDK.

KODA reads your project, edits files, and executes commands—always asking for approval before performing sensitive actions. Works with multiple LLM providers and is compatible with OpenCode's agent, skill, and command structure.

## Features

- **Multi-provider:** OpenAI, Anthropic, Gemini, and Ollama (local).
- **Secure by default:** write operations and shell commands require approval. Commands feature risk classification, limited output, and allowlisted environment variables.
- **Agents:** `build` and `plan` (primary), `general` and `explore` (subagents), plus your own custom ones.
- **Extensible:** custom commands, custom agents, and skills in Markdown.
- **Permissions:** `allow`, `ask`, and `deny` rules per tool, supporting glob patterns.
- **OpenCode Compatible:** reads `.opencode/`, `.claude/`, and `.agents/` in addition to `.koda/`.

## Requirements

- Node.js >= 20

## Installation

```bash
npm install -g @koda-tools/koda
koda
```

To test without installing: `npx @koda-tools/koda`.

To run from source code:

```bash
npm install
npm run build
npm start
```

To compile and start in a single step: `npm run koda`. The `koda` binary is exposed via `bin/koda.js`.

## Configuration

Provider and model are configured via environment variables.

```bash
export KODA_PROVIDER=anthropic          # default: openai
export ANTHROPIC_API_KEY=sk-...
export ANTHROPIC_MODEL=claude-3-5-sonnet-latest
```

| Provider  | Key                | Model            | Default Model             |
| --------- | ------------------ | ---------------- | ------------------------- |
| openai    | `OPENAI_API_KEY`   | `OPENAI_MODEL`   | `gpt-4o-mini`             |
| anthropic | `ANTHROPIC_API_KEY`| `ANTHROPIC_MODEL`| `claude-3-5-sonnet-latest`|
| gemini    | `GEMINI_API_KEY`   | `GEMINI_MODEL`   | `gemini-2.5-flash`        |
| ollama    | `OLLAMA_API_KEY` (optional) | `OLLAMA_MODEL` | `llama3.2`      |

To use local Ollama:

```bash
export KODA_PROVIDER=ollama
export OLLAMA_BASE_URL=http://127.0.0.1:11434/v1
export OLLAMA_TOOL_SUPPORT=true
```

## Usage

```bash
koda
```

Type `/` at the prompt to see suggestions.

| Command               | Description                                 |
| --------------------- | ------------------------------------------- |
| `/help`               | Shows built-in commands                     |
| `/commands`           | Lists custom commands                       |
| `/model [name\|number]` | Switches the model                         |
| `/agents`             | Lists agents                                |
| `/agent [name]`       | Switches the primary agent                  |
| `/skills`             | Lists skills                                |
| `/clear`              | Clears conversation context                 |
| `/exit`               | Exits KODA                                  |

Use `@agent task` to delegate a task to a subagent.

## Tools

`readFile`, `writeFile`, `listDirectory`, `searchFiles`, `getFileInfo`, and `runCommand`.

## Extension

Files are located in `.koda/` at the root of the project.

### Custom Commands

```md
<!-- .koda/commands/review.md -->
---
description: Reviews a file
agent: plan
---
Review file $1 with a focus on $2.
```

Usage: `/review src/index.ts security`. Placeholders: `$1`, `$2`, ... and `$ARGUMENTS`.

### Custom Agents

```md
---
description: Security reviewer
mode: subagent
steps: 15
permission:
  edit: deny
  bash: ask
---
You review code looking for vulnerabilities.
```

### Skills

A folder containing a `SKILL.md` file: `.koda/skills/<name>/SKILL.md`.

### Precedence

`.koda/` > `koda.json` > `.opencode/` > `opencode.json` > global configuration. Duplicates at the same level will throw an error.

## Development

```bash
npm run check          # typecheck
npm test               # tests
npm run format         # prettier
```

## Documentation

Full documentation is available at [`docs/index.html`](docs/index.html).

## License

[Unlicense](LICENSE): public domain.
