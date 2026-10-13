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

- Node.js >= 22

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
export ANTHROPIC_MODEL=claude-sonnet-4-6
```

| Provider  | Key                | Model            | Default Model             |
| --------- | ------------------ | ---------------- | ------------------------- |
| openai    | `OPENAI_API_KEY`   | `OPENAI_MODEL`   | `gpt-4.1-mini`             |
| anthropic | `ANTHROPIC_API_KEY`| `ANTHROPIC_MODEL`| `claude-sonnet-4-6`       |
| gemini    | `GEMINI_API_KEY`   | `GEMINI_MODEL`   | `gemini-3.8-flash`        |
| ollama    | `OLLAMA_API_KEY` (optional) | `OLLAMA_MODEL` | `llama3.2`      |

### More providers

Besides the four above, KODA ships catalog entries for the hosted providers that speak the
OpenAI-compatible API — OpenRouter, Groq, Cerebras, Together, Fireworks, DeepInfra, Nebius,
Baseten, DeepSeek, xAI, Mistral, Moonshot, Z.AI and NVIDIA — and the local servers LM Studio,
vLLM and llama.cpp. Each uses `<NAME>_API_KEY`, `<NAME>_MODEL` and `<NAME>_BASE_URL`
(for example `GROQ_API_KEY`). Connect one with `/connect` and select it with
`KODA_PROVIDER=<name>`; no extra package is needed. Run `koda connect` to see the full list.

Adding another OpenAI-compatible provider is a catalog entry, not code: a provider id is an
open string validated against the catalog, and the factory builds every provider from its
SDK kind. Note for SDK users: the exported `ProviderName` type is now `string`; the
built-in four are available as `BuiltInProvider`.

Default model prices, context limits and tool support are kept in a catalog refreshed
automatically from [models.dev](https://models.dev) in the background, cached under
`~/.config/koda/catalog-cache.json` for up to 7 days. KODA ships with a built-in snapshot
and never blocks on the network: a session always starts on the cache or snapshot it
already has, and a stale cache refreshes quietly for the *next* session. `/model` lists the
models each connected provider currently serves.

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
| `/connect [provider]` | Saves a provider's API key                  |
| `/mcp`                | Shows MCP servers and their status          |
| `/init`               | Creates the `.koda/` folder in the project  |
| `/clear`              | Clears conversation context                 |
| `/exit`               | Exits KODA                                  |

Use `@agent task` to delegate a task to a subagent.

To start a project from scratch, run `koda init` (or `/init` in a session). It creates `.koda/commands`, `.koda/skills` and `.koda/agents` in the current folder, needs no API key, and never overwrites anything that already exists. If a file named `.koda` is in the way it fails and creates nothing. Only the exact command `koda init` runs this; `koda init something` is still sent to the model as a prompt.

## Tools

`readFile`, `writeFile`, `listDirectory`, `searchFiles`, `getFileInfo`, and `runCommand`.

## MCP servers

KODA connects to [MCP](https://modelcontextprotocol.io) servers, using the same `mcp` section as OpenCode in `koda.json` or `opencode.json` (project root, `.koda/`, `.opencode/` or the global `~/.config/koda`).

```json
{
  "mcp": {
    "filesystem": {
      "type": "local",
      "command": ["npx", "-y", "@modelcontextprotocol/server-filesystem", "."],
      "environment": { "LOG_LEVEL": "info" }
    },
    "docs": {
      "type": "remote",
      "url": "https://example.com/mcp",
      "headers": { "Authorization": "Bearer {env:DOCS_TOKEN}" }
    },
    "old-server": { "enabled": false }
  }
}
```

- `local` servers are started by KODA and talk over stdio. `remote` servers use streamable HTTP, falling back to SSE.
- Fields: `enabled` (default `true`), `timeout` in ms to connect and list tools (default `30000`), `environment` (local) and `headers` (remote). `{env:NAME}` is replaced by the environment variable.
- A server that fails to start never blocks the session. Run `/mcp` to see each server's status and tool count.
- Each tool is exposed as `<server>_<tool>`. Local servers only receive a safe set of variables (`PATH`, `HOME`...) plus the `environment` you list, never your API keys.
- Calls are allowed by default. Restrict them with the `mcp` permission, which matches the tool name:

```yaml
permission:
  mcp:
    "*": allow
    "docs_*": ask
    "filesystem_write_file": deny
```

> MCP servers run code and send data to third parties. Only enable servers you trust, and review `koda.json` / `opencode.json` in projects you did not write.

## Extension

Files are located in `.koda/` at the root of the project. Run `koda init` (or `/init`) to create `.koda/commands`, `.koda/skills` and `.koda/agents`; it is safe to repeat and never overwrites existing files.

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
