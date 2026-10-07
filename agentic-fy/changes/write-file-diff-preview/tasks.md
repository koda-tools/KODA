# Tasks — write-file-diff-preview

Plano de implementação incremental. Cada tarefa deixa `npm run check`,
`npm run format:check`, `npm run build` e `npm test` em estado passável.

- [x] 1. Adicionar dependência `diff@9.0.0` com `npm install --save-exact diff@9.0.0` e os tipos necessários; confirmar que nenhuma outra dependência foi adicionada.
- [x] 2. Criar `src/utils/diff.ts`: tipos (`DiffLineKind`, `DiffLine`, `DiffHunk`, `FileDiff`) e função pura `computeFileDiff({ filePath, before, after })` usando `structuredPatch` com contexto de 3 linhas, acumulando `added`/`removed` e truncando em `MAX_DIFF_LINES = 200` com `... N linhas omitidas`. Nenhuma função acima de 60 linhas.
- [x] 3. Escrever testes unitários do diff (`test/diff.test.ts`): arquivo novo, sem mudanças, linha alterada, linha adicionada, linha removida, múltiplos hunks e truncamento.
- [x] 4. Em `src/tools/file-system/write-file.tool.ts`, adicionar leitura segura do conteúdo anterior após `resolveSafeWritePath` retornando `{ before: string | undefined; skipped?: "binary" | "too-large" | "unreadable" }`; aceitar `previousContent` e devolver resumo `+a -r` no texto de retorno sem relaxar segurança nem vazar segredos.
- [x] 5. Alterar `WritePolicy.confirm` em `src/tools/registry.ts` para receber `{ filePath, before, after }`; `ToolRegistry` lê o conteúdo anterior antes de confirmar e preserva a negação quando não há política.
- [x] 6. Atualizar `src/cli/index.ts` (`createWritePolicy`) para calcular e renderizar o diff antes do prompt `Write file '...'? [y/N]`, marcar `new file` quando `before` é `undefined` e imprimir aviso curto quando `skipped`.
- [x] 7. Criar `renderDiff` em `src/cli/tui/output.ts` (ou helper dedicado): cabeçalho `path +a -b`, margem com números antigo/novo, prefixos `+`/`-`/espaço, fundos esmaecidos verde/vermelho, realce Shiki por extensão reusando `createLazyHighlighter`, `sanitize` por linha, só canal `writeStyled`; fallback texto puro fora do Screen.
- [x] 8. Atualizar `src/cli/tui/turn.ts` (`onToolResult`): arquivo existente mostra `Updated path +a -b`; arquivo novo mantém `renderFile` numerado/colorido.
- [x] 9. Ajustar `test/registry.test.ts` para a nova assinatura de `confirm` e adicionar testes de fluxo: diff aparece antes da confirmação; arquivo novo não gera diff e é `new file`; negar não grava nem altera; binário/limite não quebra o fluxo; escapes ANSI do modelo não chegam ao terminal; caminhos bloqueados (`.env`, `.git`, traversal, symlink para fora) continuam bloqueados e nunca são lidos.
- [x] 10. Rodar `npm run check`, `npm run format:check`, `npm run build` e `npm test`; garantir mais de 73 testes passando e `provider-boundary.test.ts` ok; corrigir regressões.
