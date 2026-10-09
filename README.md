```
 ▀ ▀
█▀█▀█
▀▀▀▀▀
KODA
```

Um agente de código seguro para o terminal, escrito em TypeScript. CLI e SDK.

O KODA lê o seu projeto, edita arquivos e executa comandos, sempre pedindo aprovação para ações sensíveis. Funciona com vários provedores de LLM e é compatível com a estrutura de agentes, skills e comandos do OpenCode.

## Recursos

- **Multi-provedor:** OpenAI, Anthropic, Gemini e Ollama (local).
- **Seguro por padrão:** escritas e comandos pedem aprovação. Comandos têm classificação de risco, saída limitada e variáveis de ambiente em allowlist.
- **Agentes:** `build` e `plan` (primários), `general` e `explore` (subagentes), mais os seus próprios.
- **Extensível:** comandos customizados, agentes customizados e skills em Markdown.
- **Permissões:** regras `allow`, `ask` e `deny` por ferramenta, com padrões glob.
- **Compatível com OpenCode:** lê `.opencode/`, `.claude/` e `.agents/` além de `.koda/`.

## Requisitos

- Node.js >= 20

## Instalação

```bash
npm install -g @koda-tools/koda
koda
```

Para testar sem instalar: `npx @koda-tools/koda`.

Para rodar a partir do código-fonte:

```bash
npm install
npm run build
npm start
```

Para compilar e iniciar de uma vez: `npm run koda`. O binário `koda` é exposto por `bin/koda.js`.

## Configuração

Provedor e modelo são definidos por variáveis de ambiente.

```bash
export KODA_PROVIDER=anthropic          # padrão: openai
export ANTHROPIC_API_KEY=sk-...
export ANTHROPIC_MODEL=claude-3-5-sonnet-latest
```

| Provedor  | Chave              | Modelo           | Modelo padrão             |
| --------- | ------------------ | ---------------- | ------------------------- |
| openai    | `OPENAI_API_KEY`   | `OPENAI_MODEL`   | `gpt-4o-mini`             |
| anthropic | `ANTHROPIC_API_KEY`| `ANTHROPIC_MODEL`| `claude-3-5-sonnet-latest`|
| gemini    | `GEMINI_API_KEY`   | `GEMINI_MODEL`   | `gemini-2.5-flash`        |
| ollama    | `OLLAMA_API_KEY` (opcional) | `OLLAMA_MODEL` | `llama3.2`       |

Para usar o Ollama local:

```bash
export KODA_PROVIDER=ollama
export OLLAMA_BASE_URL=http://127.0.0.1:11434/v1
export OLLAMA_TOOL_SUPPORT=true
```

## Uso

```bash
koda
```

Digite `/` no prompt para ver as sugestões.

| Comando               | Descrição                                   |
| --------------------- | ------------------------------------------- |
| `/help`               | Mostra os comandos built-in                 |
| `/commands`           | Lista comandos customizados                 |
| `/model [nome\|número]` | Troca o modelo                            |
| `/agents`             | Lista agentes                               |
| `/agent [nome]`       | Troca o agente primário                     |
| `/skills`             | Lista skills                                |
| `/clear`              | Limpa o contexto da conversa                |
| `/exit`               | Sai do KODA                                 |

Use `@agente tarefa` para delegar uma tarefa a um subagente.

## Ferramentas

`readFile`, `writeFile`, `listDirectory`, `searchFiles`, `getFileInfo` e `runCommand`.

## Extensão

Os arquivos ficam em `.koda/` na raiz do projeto.

### Comandos customizados

```md
<!-- .koda/commands/review.md -->
---
description: Revisa um arquivo
agent: plan
---
Revise o arquivo $1 com foco em $2.
```

Uso: `/review src/index.ts segurança`. Placeholders: `$1`, `$2`, ... e `$ARGUMENTS`.

### Agentes customizados

```md
---
description: Revisor de segurança
mode: subagent
steps: 15
permission:
  edit: deny
  bash: ask
---
Você revisa código procurando vulnerabilidades.
```

### Skills

Uma pasta com um `SKILL.md`: `.koda/skills/<nome>/SKILL.md`.

### Precedência

`.koda/` > `koda.json` > `.opencode/` > `opencode.json` > configuração global. Duplicatas no mesmo nível geram erro.

## Desenvolvimento

```bash
npm run check          # typecheck
npm test               # testes
npm run format         # prettier
```

## Documentação

A documentação completa está em [`docs/index.html`](docs/index.html).

## Licença

[Unlicense](LICENSE): domínio público.
