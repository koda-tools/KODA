# Tasks — command-execution

Incremental implementation plan. As partes puras vêm primeiro, com teste,
antes de qualquer código que crie processo.

- [x] 1. Criar `src/tools/command/types.ts`: `RunCommandArgs`, `RunCommandOptions`, `CommandResult`, `RiskLevel`, `CommandDecision`, `CommandPolicy`, `CommandConfirmation`.
- [x] 2. Criar `src/tools/command/risk.ts` (`classify`), puro: separar segmentos por `&&`, `||`, `;` e `|`, aplicar deny por token, depois allowlist por prefixo, senão confirm. Testes em `test/command-risk.test.ts`, incluindo falso positivo (`sudoku`, `rm -rf node_modules` relativo).
- [x] 3. Criar `src/tools/command/environment.ts` (`buildEnv`), puro: allowlist de variáveis mais extras, descartando nome que pareça credencial. Testes em `test/command-environment.test.ts`.
- [x] 4. Criar `src/tools/command/output.ts` (`truncate`) e o formatador do resultado, puros: orçamento por stream, duas pontas preservadas, corte em fronteira de linha, seção vazia omitida. Testes em `test/command-output.test.ts`.
- [x] 5. Criar `src/tools/command/process.ts` (`spawnCommand`): spawn com shell, `detached` no POSIX, stdin fechado, corte duro de memória, encerramento em dois estágios por timeout e por `AbortSignal`.
- [x] 6. Criar `src/tools/command/run-command.tool.ts`: resolver `cwd` pelo sandbox, classificar, aplicar a política, executar e formatar.
- [x] 7. Registrar no `src/tools/registry.ts`: `RUN_COMMAND_DEFINITION`, parser, rótulo `Running...`, `ToolRegistryOptions.commandPolicy` e recusa quando não há política.
- [x] 8. Fiar na CLI: `createCommandPolicy(io)` em `src/cli/index.ts`, escrevendo o comando no transcript antes de perguntar e reaproveitando `decide()`.
- [x] 9. Exportar a tool e os tipos em `src/index.ts`.
- [x] 10. Testes de integração em `test/run-command.test.ts`: sucesso, exit diferente de zero, sandbox do `cwd`, timeout, cancelamento e morte da árvore de processos (filho que sobrevive ao pai).
- [x] 11. Rodar `npm run check` e `npm test`.

## Notas da implementação

- A classificação de risco separa dois conjuntos de regras: `WHOLE_COMMAND_DENY`, que atravessa
  o pipe (download para shell), e `SEGMENT_DENY`, por segmento. Um teste cobre o falso positivo
  do `-f` dentro de `feature` e o `curl | sh`.
- Os testes de `run-command` usam `node` do PATH e scripts em arquivo, porque o `cmd /c` do
  Windows não lida com executável entre aspas que contém espaço, nem com `=>` solto na linha.
