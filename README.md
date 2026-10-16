```
 ▀ ▀
█▀█▀█
▀▀▀▀▀
KODA
```

A secure coding agent for the terminal, written in TypeScript. CLI and SDK.

KODA reads your project, edits files, and executes commands—always asking for approval before performing sensitive actions. Works with multiple LLM providers and is compatible with OpenCode's agent, skill, and command structure.

## Features

- **Multi-provider:** OpenAI, Anthropic, Gemini, 14 OpenAI-compatible hosted providers (OpenRouter, Groq, DeepSeek, xAI, Mistral...) and the local servers Ollama, LM Studio, vLLM and llama.cpp.
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

To compile and start in a single step: `npm run koda`. The `koda` binary is exposed via `packages/koda/bin/koda.js`.

To update:

```bash
npm update -g @koda-tools/koda
```

## Configuration

Provider and model are configured via environment variables.

```bash
export KODA_PROVIDER=anthropic          # default: openai
export ANTHROPIC_API_KEY=sk-...
export ANTHROPIC_MODEL=claude-sonnet-4-6
```

Every provider uses `<NAME>_API_KEY`, `<NAME>_MODEL` and `<NAME>_BASE_URL` (the base URL overrides the default below). Hosted providers require their key; local servers do not.

| Provider   | Default model                                | Default base URL                        |
| ---------- | -------------------------------------------- | --------------------------------------- |
| openai     | `gpt-4.1-mini`                               | —                                       |
| anthropic  | `claude-sonnet-4-6`                          | —                                       |
| gemini     | `gemini-3.8-flash`                           | —                                       |
| openrouter | `anthropic/claude-sonnet-4.5`                | `https://openrouter.ai/api/v1`          |
| groq       | `moonshotai/kimi-k2-instruct`                | `https://api.groq.com/openai/v1`        |
| cerebras   | `qwen-3-coder-480b`                          | `https://api.cerebras.ai/v1`            |
| together   | `moonshotai/Kimi-K2-Instruct`                | `https://api.together.xyz/v1`           |
| fireworks  | `accounts/fireworks/models/kimi-k2-instruct` | `https://api.fireworks.ai/inference/v1` |
| deepinfra  | `moonshotai/Kimi-K2-Instruct`                | `https://api.deepinfra.com/v1/openai`   |
| nebius     | `moonshotai/Kimi-K2-Instruct`                | `https://api.studio.nebius.com/v1`      |
| baseten    | `moonshotai/Kimi-K2-Instruct`                | `https://inference.baseten.co/v1`       |
| deepseek   | `deepseek-chat`                              | `https://api.deepseek.com/v1`           |
| xai        | `grok-code-fast-1`                           | `https://api.x.ai/v1`                   |
| mistral    | `devstral-medium-latest`                     | `https://api.mistral.ai/v1`             |
| moonshot   | `kimi-k2-0905-preview`                       | `https://api.moonshot.ai/v1`            |
| zai        | `glm-4.6`                                    | `https://api.z.ai/api/paas/v4`          |
| nvidia     | `moonshotai/kimi-k2-instruct`                | `https://integrate.api.nvidia.com/v1`   |
| ollama     | `llama3.2` (local, key optional)             | `http://127.0.0.1:11434/v1`             |
| lmstudio   | `qwen2.5-coder-7b-instruct` (local, key optional) | `http://127.0.0.1:1234/v1`         |
| vllm       | `Qwen/Qwen2.5-Coder-7B-Instruct` (local, key optional) | `http://127.0.0.1:8000/v1`    |
| llamacpp   | `default` (local, key optional)              | `http://127.0.0.1:8080/v1`              |

Every provider past the first three is OpenAI-compatible and served from the catalog, with no extra package needed.

### Connect a provider

Instead of exporting variables, save the key with `/connect` inside KODA, or with `koda connect` from an interactive terminal. For automation, pipe the key to `koda connect <provider> --token-stdin`; do not pass credentials in command-line arguments.

```bash
/connect                 # pick from a list (↑/↓, Enter, Esc cancels)
/connect anthropic       # or pass the provider directly
koda connect anthropic
printf '%s' "$OPENAI_API_KEY" | koda connect openai --token-stdin
```

In PowerShell, use `$env:OPENAI_API_KEY | koda connect openai --token-stdin`.

The list covers every hosted provider and shows whether each one is `connected`, `from environment` or `not connected`. Local servers need no key. The key is typed hidden and saved to `~/.config/koda/auth.json` with permission `600`.

The first connected provider becomes the global default. A project preference in `.koda/koda.json` overrides that default; an explicit `KODA_PROVIDER` or `OPENCODE_PROVIDER` overrides the project. API keys always stay outside the project in the global auth file. Restart KODA to use a new provider.

### Provider catalog

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
| `/clear`              | Clears conversation context (asks for confirmation) |
| `/exit`               | Exits KODA                                  |

Use `@agent task` to delegate a task to a subagent.

### Start a project (init)

Run `koda init` in the project root, or `/init` inside a session, to create the folders KODA reads its extensions from. Use `koda init --provider=openai` to also select a project provider. It needs no API key and no interactive terminal. `koda --help` and `koda --version` work without a connection.

```
Created  .koda/commands
Created  .koda/skills
Created  .koda/agents
```

It is safe to repeat: existing folders are not removed, and the output marks them as `Exists`. With `--provider`, the provider preference is updated in `.koda/koda.json` while preserving other configuration. If a file named `.koda` is in the way, `init` fails with an error and creates nothing.

## Agents

| Name      | Mode     | Description                                       |
| --------- | -------- | ------------------------------------------------- |
| `build`   | primary  | Default. All tools available.                     |
| `plan`    | primary  | Analyzes and proposes plans, without editing files. |
| `general` | subagent | Research and multi-step tasks.                    |
| `explore` | subagent | Read-only. Searches files and code.               |

## Tools

| Tool            | What it does                                                                  |
| --------------- | ----------------------------------------------------------------------------- |
| `readFile`      | Reads files, with line ranges                                                 |
| `writeFile`     | Creates or changes files (with approval)                                      |
| `listDirectory` | Lists directories                                                             |
| `searchFiles`   | Searches the project                                                          |
| `getFileInfo`   | File metadata                                                                 |
| `runCommand`    | Runs commands with risk classification, bounded output and an allowlisted env |

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
model: openai/gpt-4.1-mini
subagent: false
---
Review file $1 with a focus on $2.
Full arguments: $ARGUMENTS
```

The file name becomes the command. Usage: `/review src/index.ts security`. Placeholders: `$1`, `$2`, ... and `$ARGUMENTS`.

### Custom Agents

Defined in Markdown (body = prompt) or JSON, in the same directories as commands.

```md
---
description: Security reviewer
mode: subagent
model: anthropic/claude-sonnet-4-6
temperature: 0.1
steps: 15
permission:
  edit: deny
  bash: ask
---
You review code looking for vulnerabilities.
```

### Skills

A folder containing a `SKILL.md` file: `.koda/skills/<name>/SKILL.md`. The `.opencode`, `.claude` and `.agents` folders are also read. List them with `/skills`.

### Permissions

Each action resolves to `allow`, `ask` or `deny`. With glob patterns, the last matching rule wins.

```yaml
permission:
  read: allow
  edit: ask
  bash:
    "*": ask
    "git status": allow
    "rm *": deny
```

Keys: `read`, `edit`, `list`, `glob`, `grep`, `bash`, `task`, `skill`, `mcp`.

### Precedence

`.koda/` > `koda.json` > `.opencode/` > `opencode.json` > global configuration. Duplicates at the same level will throw an error.

## SDK

The SDK is published as its own package, `@koda-tools/core`, with no terminal dependencies, so it is light to install and safe to bundle in other hosts such as an editor extension:

```bash
npm install @koda-tools/core
```

`@koda-tools/koda` (the CLI) re-exports everything from `@koda-tools/core`, so existing imports from it keep working. The terminal UI lives in a separate `@koda-tools/koda/tui` export.

```ts
import { bootstrapKoda, loadConnection } from "@koda-tools/core";

const connection = await loadConnection({ env: process.env });
const koda = await bootstrapKoda({
  cwd: process.cwd(),
  connection,
  // Approvals are supplied by the host: an object, or a function run once the
  // provider is built (a missing API key fails before it is called).
  policies: { approve: async (title) => askUser(title) },
});
void koda.mcp.start();
const prepared = koda.agents.prepare(koda.agents.defaultAgent().name, {});
console.log(await prepared.agent.run("Summarize this project"));
await koda.close();
```

`runInteractive`, `renderHeader` and the other terminal UI exports: `import { runInteractive } from "@koda-tools/koda/tui"`.

## Development

The repository is an npm workspace with two packages; the root only holds the workspace, the shared `tsconfig.base.json`, the docs and the CI:

- `packages/core`: `@koda-tools/core`, the SDK (agent loop, providers, tools, MCP, custom commands, bootstrap). No terminal dependencies.
- `packages/koda`: `@koda-tools/koda`, the CLI and terminal UI (`bin/koda.js`). It depends on the core package at the same version.

Run everything from the root:

```bash
npm install
npm run check          # builds core, then typechecks both packages
npm run build          # compile core, then koda, to each package's dist
npm test               # tests of both packages
npm run format         # prettier
```

Tests in `packages/koda` import `@koda-tools/core` from its sources through the `development` export condition (the test scripts pass `--conditions=development`), so you do not need to rebuild core between edits. Typechecking `packages/koda` reads core's built declarations, which `npm run check` builds first.

To run a single test file, run it from its package: `cd packages/core && node --conditions=development --import tsx --test test/commands.test.ts`.

Both packages are released together with the same version: bump `packages/core/package.json`, `packages/koda/package.json` and the `@koda-tools/core` dependency in koda, then publish a GitHub Release with the matching tag.

## Documentation

Full documentation is available at [`docs/index.html`](docs/index.html).

## License

[Unlicense](LICENSE): public domain.
