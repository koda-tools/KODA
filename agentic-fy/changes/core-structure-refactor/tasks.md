# Tasks — core-structure-refactor

Incremental implementation plan.

- [x] 1. Criar `core/usage/usage.ts` (`sumUsage`, `EMPTY_USAGE`) e `core/model/` (`types.ts`, `model-ref.ts` com `parseModelRef` e `resolveModel`).
- [x] 2. Criar `core/agent/types.ts` (`ToolExecutor`, `ToolObservation`, `AgentObserver`, `CodeAgentOptions` com `identity` obrigatória, `AgentRunOptions`, `AgentRunResult`) e `core/agent/constants.ts`.
- [x] 3. Criar `core/agent/response.ts` (complete ou stream) e `core/agent/tool-runner.ts` (status pela tool, execução, mensagens `tool`).
- [x] 4. Reescrever `core/agent/agent.ts` só com o loop e criar o barrel `src/core/index.ts`. Remover `src/core/agent.ts`.
- [x] 5. Em `src/tools/registry.ts`: definir `statusLabel` por tool (mapa `STATUS_LABELS`), implementar `ToolExecutor` e importar `ToolObservation` do core.
- [x] 6. Migrar os consumidores:
  - `src/cli/index.ts` (`identity`);
  - `src/cli/commands/router.ts` (remover `accumulateUsage`);
  - `src/cli/tui/session/session.ts` (`sumUsage`);
  - `src/cli/tui/turn/*` (`observer`);
  - `src/cli/tui/application/types.ts`;
  - `src/index.ts`.
- [x] 7. Atualizar os testes do agente (`agent`, `integration`, `conversation-context`, `tui`) para usar o barrel e a `identity`.
- [x] 8. Adicionar `test/core-model.test.ts` (`parseModelRef`, `resolveModel`, `sumUsage`) e `test/core-structure.test.ts`.
- [x] 9. Rodar `npm run check` e `npm test`.
