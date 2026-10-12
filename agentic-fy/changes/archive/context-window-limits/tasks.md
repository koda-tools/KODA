# Tasks — context-window-limits

Plano incremental. Testes rodados pelo usuário.

- [x] 0. `persistent-conversation-context` arquivado; `session-conversation-memory` existe em `agentic-fy/specs/`.
- [x] 1. Limites dos defaults vêm do catálogo do `catalog-refresh` (models.dev), não de tabela própria. Valores registrados no `design.md`.
- [x] 2. `catalog/types.ts`: `defaultMaxTokens` trocado por `defaultLimit: ModelLimit` no `ProviderSpec`; quatro entradas de `catalog/catalog.ts` preenchidas.
- [x] 3. `catalog/limits.ts`: `modelLimit(provider, model)` (catálogo → default do provedor → fallback), saída limitada a 32768; exportado pelo barrel.
- [x] 4. `shared/tokens.ts`: `estimateTokens(messages)`, exportado pelo barrel.
- [x] 5. `test/tokens.test.ts`: texto, tool call, imagem, CJK, código minificado.
- [x] 6. `AISDKOptions.provider` preenchido em `vendors.ts`; `provider.ts` envia `options.maxTokens ?? modelLimit(...).output` para o modelo da requisição.
- [x] 7. `test/provider-wire.test.ts`: limite do catálogo para os quatro provedores, override de modelo por requisição; `maxTokens` explícito continua com prioridade (cenário existente). `test/model-catalog.test.ts`: casos de `modelLimit`.
- [x] 8. `session.ts`: orçamento por `modelLimit`, `trimHistory` por orçamento, `MAX_HISTORY_MESSAGES` removido, `appendTurn` devolve `{ dropped }`, `selectModel` compacta.
- [x] 9. ~~`contextUsage()`~~ adiado (ver design: nada consumiria agora).
- [x] 10. Aviso `Context trimmed: N older messages dropped…` escrito pela sessão quando `dropped > 0`.
- [x] 11. `test/conversation-context.test.ts` reescrito por orçamento: corte em fronteira de turno, sem tool órfão, turno único grande mantido, aviso com contagem, sem aviso quando nada sai, troca de modelo compacta.
- [x] 12. (Usuário) Gate: `tsc --noEmit`, `prettier --check`, `node --test`, `npm.cmd run build`. Rodado pelo usuário, verde.
- [x] 13. (Usuário) Teste manual: sessão longa com compactação, aviso e turno seguinte. Confirmado pelo usuário.

Nota pós-apply: ao rodar o `koda` global (0.1.5, antiga) em vez de `./bin/koda.js`, o custo aparecia `N/A`. Isso é da versão global defasada, não desta mudança. Duas correções defensivas entraram no código durante a verificação: `modelInfo` cai no snapshot embutido quando o cache em runtime não tem o modelo, e `initCatalog` trata cache vazio como ausente e refaz o fetch.
