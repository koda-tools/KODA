# Tasks — project-exploration-tools

Incremental implementation plan.

- [x] 1. Criar `src/utils/binary.ts` (`isLikelyBinary`) e `src/utils/gitignore.ts` (`loadIgnores`, com `IgnoreMatcher`), com testes puros.
- [x] 2. Criar `src/tools/file-system/walker.ts`: walker genérico com cancelamento, limites, respeito a ignore e às pastas sensíveis/de build.
- [x] 3. Criar `src/tools/file-system/list-directory.tool.ts` sobre o walker, com formatação em árvore e limite por profundidade.
- [x] 4. Criar `src/tools/file-system/search-files.tool.ts` sobre o walker, com busca textual e por regex, filtros de glob e limites.
- [x] 5. Criar `src/tools/file-system/get-file-info.tool.ts` com saída em texto curto e detecção text/binary.
- [x] 6. Ajustar `src/tools/file-system/read-file.tool.ts` para aceitar `startLine`/`endLine` com validação e cabeçalho.
- [x] 7. Atualizar `src/tools/registry.ts`: novas `ToolDefinition`, parsers, rótulos (`Listing...`, `Searching...`, `Inspecting...`), reescrita do `execute` como `switch`, e `ToolRegistryOptions.listDirectory`/`searchFiles`.
- [x] 8. Exportar as novas tools e tipos em `src/index.ts`.
- [x] 9. Adicionar testes: `gitignore`, `binary`, `list-directory`, `search-files`, `get-file-info`, `read-file-range` e um teste de `registry` cobrindo os novos nomes e erros.
- [x] 10. Rodar `npm run check` e `npm test`.

## Notas da implementação

- `src/tools/file-system/limits.ts` (`bounded`) foi acrescentado: o valor padrão estava sendo
  usado como teto, então `depth: 3` nunca passava de 2. Um teste trava o comportamento.
- `ToolRegistry.execute` ganhou um terceiro parâmetro opcional `signal`, compatível com
  `ToolExecutor` do core, para o cancelamento chegar às tools de varredura.
- `test/helpers/workspace.ts` (`withWorkspace`) centraliza o workspace temporário dos testes.
