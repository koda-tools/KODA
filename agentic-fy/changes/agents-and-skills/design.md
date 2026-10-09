# Design — agents-and-skills

## Context
- O core (`src/core`) não pode conhecer ferramentas concretas nem ler arquivos
  (teste `core-structure`). Agents e skills ficam num módulo novo `src/agents/`
  com barrel e tipos em `types.ts`.
- A descoberta de comandos (`src/cli/commands/discovery.ts`) já lê `.koda`,
  `.opencode` e os globais; o novo módulo segue a mesma precedência.
- `ToolRegistry.execute` despacha pelo nome mesmo sem a definição exposta, então
  esconder uma ferramenta não basta: o bloqueio precisa acontecer na execução.

## Architecture

### Core (mudanças mínimas)
- `ToolExecutor.execute(name, args, signal?)`; o laço repassa o `AbortSignal`.
- `CodeAgentOptions.temperature` e `onStepLimit: "error" | "summarize"`. Com
  `summarize`, ao esgotar os passos o agente faz uma última chamada sem
  ferramentas pedindo o resumo do que fez e do que falta (como o OpenCode).

### `src/agents/`
- `frontmatter.ts` — YAML com mapas aninhados, limite de tamanho.
- `agent-file.ts`, `skill-file.ts` — validação de cada formato (regras de nome
  e tamanho das skills iguais às do OpenCode).
- `discovery.ts` — `loadCatalog()` devolve agents, skills e diagnósticos;
  arquivo inválido vira diagnóstico, não derruba o CLI.
- `builtins.ts` — `build`, `plan`, `general`, `explore`.
- `permissions.ts` — resolução por chave (`read`, `edit`, `list`, `grep`/`glob`,
  `bash`, `task`, `skill`), padrões glob com "última regra vence", padrões
  seguros quando a chave falta. Subagente avalia a camada do pai e a dele e
  fica com a mais restritiva (`deny` > `ask` > `allow`).
- `toolset.ts` — `ToolExecutor` que esconde e bloqueia `deny`, pergunta em
  `ask` e libera `allow`. Escrita e comando usam as políticas interativas
  existentes; `allow` só pula a pergunta (o `deny` de risco do `risk.ts`
  continua valendo).
- `skill-tool.ts`, `task-tool.ts` — ferramentas novas. A lista de skills e de
  subagentes vai na descrição da ferramenta; `deny` some da lista.
- `prompt.ts` — system prompt do agente: base de segurança do KODA + regra
  explícita de que skills e instruções de agente são configuração do projeto
  (não saída de ferramenta) e nunca concedem permissões.
- `runtime.ts` — `AgentRuntime`: catálogo, providers por nome (cache),
  `prepare(agent, ctx)` cria o `CodeAgent` da execução; `prepareSubagent`
  aplica profundidade 1 (sem `task`), `steps`, tempo limite e permissões.

### Providers
- `configFromEnvironment(env, provider?)` monta a config de um provider
  específico, permitindo `model: anthropic/...` com sessão em `openai`.

### TUI / aplicação
- Sessão guarda o agente primário; sidebar mostra `Agent`.
- Tab / Shift+Tab alternam primários; Alt+S abre o seletor de sessões.
- `/agents`, `/agent <nome>`, `/skills`; `@nome tarefa` delega direto.
- Comandos: `agent:` escolhe o agente da execução; `subagent: true` delega.
- Delegação cria uma sessão filha (`↳ nome`) que recebe a saída do subagente
  mesmo em segundo plano; o uso da filha soma na sessão pai.

## Alternatives considered
- Um `CodeAgent` único com opções por execução: espalharia regras de agente
  pelo core. Preferimos criar um `CodeAgent` por execução (barato) no módulo
  `agents`.
- Mesclar regras de permissão estruturalmente: difícil de garantir que o filho
  não exceda o pai. Avaliar cada camada e ficar com a mais restritiva é simples
  e verificável.

## Risks
- Instruções de projeto vs. injeção de prompt: o prompt base separa as duas
  coisas e as permissões continuam valendo.
- `allow` em escrita reduz a proteção: padrão `ask`, só muda por configuração
  explícita.
- Custo de tokens com subagentes: profundidade 1, `steps` e tempo limite.
