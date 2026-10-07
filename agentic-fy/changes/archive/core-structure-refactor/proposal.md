# Proposal — core-structure-refactor

## Why
`src/core` tem um único arquivo, `agent.ts` (~230 linhas), que mistura seis responsabilidades:
- contratos públicos (`CodeAgentOptions`, `AgentRunOptions`, `AgentRunResult`);
- constantes e magic strings (`"unknown"`, `"default"`, system prompt, limite de iterações);
- rótulos de status por nome de tool (`TOOL_STATUS` com `readFile`/`writeFile`), o que acopla o core às tools;
- soma de tokens (`UsageTotals`), duplicada em `cli/commands/router.ts` (`accumulateUsage`);
- interpretação de `provider/modelo#variante` (`resolveModel`), escondida num método privado e sem teste direto;
- consumo do stream e execução das tool calls, junto com o loop do agente.

Além disso:
- o agente depende da classe concreta `ToolRegistry`, quando só usa `definitions` e `execute`;
- `provider` e `model` são opcionais, com `"unknown"`/`"default"` como fallback, e o `resolveModel` tem um caso especial só por causa do `"unknown"`;
- CLI, TUI, `router.ts` e testes fazem deep import de `core/agent.js`, sem barrel;
- quatro callbacks soltos no `AgentRunOptions`.

## What
- Organizar `src/core` em pastas por propósito (`agent/`, `model/`, `usage/`), com `types.ts` e o barrel `src/core/index.ts` como única entrada.
- Reduzir o `CodeAgent` ao loop. A resolução de resposta (complete ou stream) e a execução de tools viram funções próprias.
- `parseModelRef` puro, com testes para `gpt-4o`, `openai/gpt-4o`, `openai/gpt-4o#variant` e provider divergente.
- `sumUsage` puro no core, substituindo `UsageTotals` e `accumulateUsage`.
- Interface `ToolExecutor` no core (`definitions`, `execute`, `statusLabel`), que o `ToolRegistry` implementa.
- Rótulo de status declarado por cada tool em `src/tools`. O core só conhece o padrão "Using tool...".
- Callbacks agrupados em `AgentObserver`, passado como `observer` no `AgentRunOptions`.
- `ProviderIdentity` obrigatório no construtor do `CodeAgent`, sem `"unknown"`/`"default"`.
- Migrar todos os imports para o barrel e adicionar `test/core-structure.test.ts`.

## Scope
- In scope:
  - `src/core/**`;
  - `src/tools/registry.ts` (rótulos e `ToolExecutor`);
  - os ajustes de import e de uso em `src/cli/index.ts`, `src/cli/commands/router.ts`, `src/cli/tui/turn/*`, `src/cli/tui/session/session.ts`, `src/cli/tui/application/types.ts` e `src/index.ts`;
  - os testes do agente.
- Out of scope:
  - mudar o comportamento do loop (iterações, ordem das tool calls, mensagens de erro);
  - retry, tools em paralelo ou eventos via `AsyncGenerator`;
  - novas tools e mudanças em `src/providers`.
