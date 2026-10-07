# Tasks — suppress-spinner-during-confirmation

Plano incremental. Cada tarefa mantém `npm run check`, `npm run format:check`,
`npm run build` e `npm test` passáveis.

- [x] 1. Em `src/cli/tui/io.ts`: adicionar `holdStatus?: (text: string) => void` e `releaseStatus?: () => void` ao `InteractiveIO`.
- [x] 2. Em `src/cli/tui/screen.ts`: adicionar estado `statusHold`; `holdStatus(text)` fixa o status; `releaseStatus()` libera; `setStatus(text)` ignora atualizações enquanto `statusHold` está ativo; `stop()` limpa a trava; expor `holdStatus`/`releaseStatus` em `asIO()`.
- [x] 3. Em `src/cli/tui/decision.ts`: usar `holdStatus(WAITING_STATUS)` no início e `releaseStatus()` no `finally`, com fallback para `setStatus` quando a trava não existir.
- [x] 4. Testes: em `test/screen.test.ts`, com um status do "spinner" ativo, `holdStatus("Waiting for decision...")` fixa o texto e `setStatus("⠹ Writing...")` subsequente é ignorado; após `releaseStatus()`, `setStatus` volta a valer. Em `test/decision.test.ts`, verificar que `decide` chama `holdStatus`/`releaseStatus` (e cai no fallback `setStatus` quando ausentes).
- [x] 5. Rodar `npm run check`, `npm run format:check`, `npm run build` e `npm test`; garantir todos verdes, `provider-boundary.test.ts` ok, e nenhuma regressão.
