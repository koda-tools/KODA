# Tasks â€” providers-structure-refactor

Incremental implementation plan.

- [x] 1. Confirmar nos `node_modules` os tipos dos eventos de stream do Anthropic (`RawMessageStreamEvent`) e do Gemini (`generateContentStream`, `abortSignal`, `finishReason`).
- [x] 2. Criar `contracts/` (`types.ts` e `content.ts`) e `catalog/` (`types.ts`, `catalog.ts` e `pricing.ts`, com os preÃ§os movidos da TUI).
- [x] 3. Criar `config/` (`types.ts`, `environment.ts` e `validation.ts`) e `factory/factory.ts` derivados do catÃ¡logo, com `resolveProviderIdentity` lanÃ§ando erro para provider desconhecido (bug 7).
- [x] 4. Criar `shared/` com errors, messages, arguments, request, usage e stream (`ResponseAccumulator`), sem SDK.
- [x] 5. Reestruturar `adapters/openai` e `adapters/ollama` (provider, mapping, stream-accumulator sobre `ResponseAccumulator`).
- [x] 6. Reestruturar `adapters/anthropic` com streaming real, imagens (bug 4), sem bloco de texto vazio (bug 5) e com `wrapProviderError` (bug 6).
- [x] 7. Reestruturar `adapters/gemini` com streaming real, nome correto na `functionResponse` (bug 1), `abortSignal` (bug 2), `finishReason` (bug 3) e `wrapProviderError` (bug 6).
- [x] 8. Criar o barrel `src/providers/index.ts` e migrar todos os imports (core, cli, tui, tools, `src/index.ts`, testes). Remover `base.provider.ts`, `defaults.ts`, o shim `openai.provider.ts`, os arquivos antigos dos adapters e `tui/session/pricing.ts`.
- [x] 9. Adicionar testes: `test/providers-structure.test.ts`, um teste para cada bug (1 a 7) e streaming incremental de Anthropic e Gemini com client fake.
- [x] 10. Rodar `npm run check` e `npm test` e confirmar que a API pÃºblica de `src/index.ts` nÃ£o mudou.
