# Tasks — interactive-confirm-selector

Plano incremental. Cada tarefa mantém `npm run check`, `npm run format:check`,
`npm run build` e `npm test` passáveis.

- [x] 1. Em `src/cli/tui/io.ts`: adicionar `select?: (request: SelectRequest) => Promise<number | undefined>` e o tipo `SelectRequest { title: string; options: readonly string[]; hint?: string }`.
- [x] 2. Em `src/cli/tui/screen/renderer.ts`: estender `FrameInput` com `selection?: { options; index; title?; hint? }`; centralizar o rodapé em `footerRows(input)`; quando houver `selection`, renderizar as linhas de opção (`◉`/`○`, ativa em destaque SGR) e a linha de dica no lugar da `renderInputRow`.
- [x] 3. Em `src/cli/tui/screen.ts`: adicionar estado `selection`, método `select(request)` (imprime o título no scrollback, guarda estado, devolve Promise), expor `select` em `asIO()`, e resolver seleção pendente em `stop()`/`cancel()`.
- [x] 4. Em `src/cli/tui/screen.ts`: guard no topo de `handleKey` para `selection` ativo e novo `handleSelectKey` (←↑ anterior, ↓→ próximo com wrap, Enter confirma e ecoa, Ctrl+C cancela); passar `selection` ao `composeFrame` em `render()`.
- [x] 5. Novo `src/cli/tui/decision.ts`: `decide(io, title, fallbackPrompt) -> boolean` (índice 0 = Allow) com fallback para o `question` por linha quando `io.select` ausente; `src/cli/index.ts` importa e usa `decide(screen.asIO(), ...)`.
- [x] 6. Em `src/cli/index.ts`: `createWritePolicy` usa o seletor (`title: Write  <path>`, `["Allow","Reject"]`, hint `←↑↓→ select · enter confirm`) após o `previewWrite`; `shellPolicy.approve` usa o seletor (`title: Run shell  <source>`, comando no preâmbulo).
- [x] 7. Em `src/cli/tui/decision.ts`: envolver o prompt com `io.setStatus("Waiting for decision...")` antes e `io.setStatus(undefined)` depois (via `finally`), para mascarar o "Writing..." durante a decisão.
- [x] 8. Testes: `test/screen.test.ts` envia setas (`\x1b[A`/`\x1b[B`) + Enter resolvendo o índice certo, Ctrl+C cancela, o bloco do seletor é renderizado (opções + dica) e não rola o transcript. `test/decision.test.ts` cobre Allow/Reject/cancel, fallback por linha e o status "Waiting for decision..." setado e limpo (inclusive em erro).
- [x] 9. Rodar `npm run check`, `npm run format:check`, `npm run build` e `npm test`; garantir todos verdes, `provider-boundary.test.ts` ok, e nenhuma regressão.
