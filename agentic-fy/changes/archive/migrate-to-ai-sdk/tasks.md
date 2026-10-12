# Tasks — migrate-to-ai-sdk

Incremental implementation plan. A suíte HTTP (tarefas 2 e 3) fica verde nos adapters atuais antes de qualquer troca.

- [x] 1. Instalar as versões fixadas numa branch e conferir nos tipos de `node_modules`:
  - as partes do `fullStream` do `ai` 7 (`text-delta`, `tool-input-*`, `tool-call`, `finish`, `error`, `abort`);
  - o formato de `ModelMessage` (`tool-call.input`, `tool-result.output`, imagem);
  - `jsonSchema`, `RetryError` e `APICallError`;
  - as opções `apiKey`, `baseURL`, `fetch` e `includeUsage` de `createOpenAI`, `createAnthropic`, `createGoogleGenerativeAI` e `createOpenAICompatible`;
  - se existe `generateId` no Google e se o `finishReason` bruto é exposto.

  Anotar as diferenças no `design.md`.
- [x] 2. Criar `test/helpers/fake-fetch.ts`. Ele grava URL, método, headers sem o valor das chaves e o body JSON, e responde a partir de um roteiro com JSON, SSE, status de erro ou falha de rede.
- [x] 3. Criar `test/provider-wire.test.ts` contra os adapters atuais:
  - cenários por provedor: texto, deltas de stream, ferramenta com chamada e resultado em várias rodadas, imagem, system, usage, abort, 401/429/rede e host da requisição;
  - os bugs 1 a 6 vistos no body;
  - Ollama: URL padrão e `toolSupport: false`.

  Os fakes entram via `client` (OpenAI, Anthropic e Ollama) ou troca do `globalThis.fetch` (Gemini). Rodar `npm.cmd test` e deixar verde.
  Resultado: 48 testes de wire verdes; suíte completa 345 testes, 0 falhas. A tabela de fornecedores guarda as divergências atuais (`onAbort`, `retryableAttempts`, `networkAttempts`, `networkHint`), que viram valores uniformes na tarefa 9.
- [x] 4. Atualizar `package.json`:
  - adicionar `ai` 7.0.137, `@ai-sdk/openai` 4.0.91, `@ai-sdk/anthropic` 4.0.78, `@ai-sdk/google` 4.0.93, `@ai-sdk/openai-compatible` 3.0.67 e `zod` 4.6.5, com versão exata;
  - mudar `engines.node` para `>=22.0.0`.

  Rodar `npm.cmd install` e `npm.cmd run check`.
- [x] 5. Adicionar `SdkKind` e o campo `sdk` em `catalog/types.ts` e preencher as quatro entradas em `catalog/catalog.ts`.
- [x] 6. Implementar `adapters/ai-sdk/`: `types.ts`, `models.ts`, `messages.ts`, `tools.ts`, `response.ts`, `stream.ts`, `errors.ts`, `list-models.ts` e `provider.ts`. Seguir o design: sem `execute`, `maxRetries: 2`, `abort`/`error` viram `ProviderError` e o modelo nunca é resolvido por nome em texto.
- [x] 7. Implementar `adapters/ai-sdk/vendors.ts` com `OpenAIProvider`, `AnthropicProvider`, `GeminiProvider` e `OllamaProvider`:
  - opções com `fetch` no lugar de `client`;
  - mantêm capabilities, `toolSupport`/`assertTools`, filtro de `listModels`, validação de mídia da Anthropic e URL padrão do Ollama.
- [x] 8. Apontar `factory/factory.ts` e o barrel `src/providers/index.ts` para as novas classes. `src/index.ts` exporta os mesmos símbolos.
- [x] 9. Trocar a injeção da suíte HTTP pela opção `fetch` e rodar sem mudar asserções. Resultado: 48/48 verdes com os cenários intactos; só a tabela de fornecedores mudou (`onAbort` e `networkHint` uniformes, `networkAttempts` 1, `retryableAttempts` 3 também no Gemini). Só podem mudar as asserções listadas em "Diferenças aceitas" do design.
- [x] 10. Remover `adapters/openai`, `adapters/anthropic`, `adapters/gemini` e `adapters/ollama`, e as dependências `openai`, `@anthropic-ai/sdk` e `@google/genai`.
  - Remover `test/openai.provider.test.ts` e os testes de `test/provider-adapters.test.ts` que usam client de SDK, já cobertos pela suíte HTTP.
  - Manter o teste de `describeFailure`.
- [x] 11. Atualizar `test/provider-boundary.test.ts` e `test/providers-structure.test.ts`:
  - regex de SDK com `ai` e `@ai-sdk/*`;
  - pastas antigas na lista de legados;
  - asserções de `package.json`: sem SDKs antigos, versões exatas de `ai`/`@ai-sdk/*`/`zod` e `engines.node` `>=22`.
- [x] 12. Atualizar o README (Node.js >= 22) e o CHANGELOG em `[Unreleased]`:
  - provedores sobre o AI SDK;
  - "Breaking": Node 22 e a opção `client` removida.
- [x] 13. Rodar `npm.cmd run check`, `npm.cmd run format:check`, `npm.cmd run build` e `npm.cmd test`, e garantir que tudo passa.
  Resultado: check limpo; build gera `dist/` e `dist/src/index.js` exporta os quatro providers e a factory; testes 336, 335 passando, 0 falhas, 1 ignorado no Windows.
  `format:check` acusa arquivos não tocados por esta mudança (`src/tools/**`, `src/utils/gitignore.ts`, `src/cli/tui/highlight/highlighter.ts`). Falha pré-existente deste checkout no Windows, provavelmente fim de linha CRLF; os arquivos desta mudança passam. Não reformatei nada fora do escopo.
- [ ] 14. Teste manual com chave real em OpenAI, Anthropic e Gemini, e com Ollama local: resposta em texto, uma chamada de ferramenta (`readFile`) e Esc no meio do stream.
  **Não executado.** Depende de chave real, que o agente não tem. A mudança foi arquivada a pedido do usuário com esta tarefa aberta. O que cobre o risco no lugar dela: a suíte de wire (48 cenários) exercita requisição e resposta de cada provedor no nível HTTP, incluindo cancelamento, e ficou verde nos adapters antigos e no novo sem mudar asserções. O que ela **não** cobre: credencial válida, formato real de resposta dos fornecedores hoje e o comportamento da TUI num terminal de verdade.

## Nota sobre o `verify` do agentic-fy

O `agentic-fy verify` não roda nesta mudança. O `collectEvidence` consolida os deltas contra uma spec **vazia** (`core/evidence.js:77`, `emptySpec(delta.capability)`), de propósito, para avaliar só o que a mudança declara. Como dois dos três deltas desta mudança contêm apenas `modify` de requisitos que já existem nas specs consolidadas, o `mergeDelta` lança `modify: requirement "streaming-openai-adapter" not found`.

Não é problema de conteúdo: o `archive --dry-run`, que mescla contra as specs reais, roda limpo (+6 ~0 -0, ~5, ~5). É uma limitação da ferramenta para mudanças que **emendam** requisitos existentes.

Evidência coletada à mão no lugar, no commit arquivado:

| Comando | Resultado |
|---|---|
| `tsc -p tsconfig.json --noEmit` | exit 0 |
| `prettier --list-different` | 0 arquivos |
| `node --test "test/**/*.test.ts"` | 336 testes, 335 passando, 0 falhas, 1 ignorado no Windows |
| `tsc -p tsconfig.json` (build) | `dist/` gerado; `dist/src/index.js` exporta os 4 providers e a factory |

A mesma limitação vai atingir `context-window-limits`, cujo delta de `persistent-conversation-context` também é só `modify`.
