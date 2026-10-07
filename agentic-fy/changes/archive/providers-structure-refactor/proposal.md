# Proposal — providers-structure-refactor

## Why
A camada `src/providers` funciona, mas cresceu sem estrutura:

- Os adapters OpenAI, Anthropic e Gemini repetem os mesmos helpers: `failureSuffix`, extração de system, `parseArguments`, montagem de usage, spreads condicionais, validação de `toolCallId` e o stream simulado.
- A configuração está espalhada:
  - `defaults.ts` mistura o catálogo com a leitura de env;
  - `factory.ts` reescreve à mão os nomes de env que já existem em `MODEL_ENV_VARIABLES`;
  - o pricing vive na TUI (`cli/tui/session/pricing.ts`), longe do catálogo de modelos.
- Não há barrel. Core, CLI, TUI e `src/index.ts` fazem deep imports, e um shim legado (`providers/openai.provider.ts`) só serve a um teste.
- Anthropic e Gemini não fazem streaming real: chamam `complete` e emitem tudo de uma vez.
- Bugs conhecidos:
  1. O Gemini envia `toolCallId` como nome da `functionResponse`.
  2. O Gemini ignora `options.signal`.
  3. O Gemini não preenche `finishReason`.
  4. O Anthropic descarta imagens, embora declare `images: true`.
  5. O Anthropic envia um bloco de texto vazio quando o assistant só tem tool calls.
  6. Anthropic e Gemini re-embrulham `ProviderError` interno, e a mensagem original se perde.
  7. `resolveProviderIdentity` cai silenciosamente para openai quando o provider é desconhecido, enquanto a factory lança erro.

## What
- Reorganizar `src/providers` em pastas por propósito, cada uma com seu `types.ts`, e criar o barrel `src/providers/index.ts` como única entrada.
- Extrair os helpers comuns, sem SDK, para `providers/shared/`. Os adapters passam a compô-los.
- Unificar o catálogo em `providers/catalog/`: nomes, modelo default, env de modelo e de API key, `maxTokens` default e preços. A factory deriva tudo dele.
- Mover `estimateCost` e os preços para o catálogo. A TUI passa a consumi-los pelo barrel.
- Implementar streaming real no Anthropic (`messages.create({ stream: true })`) e no Gemini (`models.generateContentStream`).
- Corrigir os 7 bugs, cada um coberto por teste.
- Remover o shim legado e trocar todos os deep imports pelo barrel. A API pública de `src/index.ts` fica igual.

## Scope
- In scope:
  - `src/providers/**`;
  - os imports em `src/core/agent.ts`, `src/cli/index.ts`, `src/index.ts`, `src/tools/registry.ts` e `src/cli/tui/**`;
  - `src/cli/tui/session/pricing.ts`, que é removido e passa a ser re-exportado pelo barrel da TUI;
  - os testes de providers e um novo `test/providers-structure.test.ts`.
- Out of scope:
  - novos providers;
  - troca de provider em runtime pelo `/model`;
  - retry e backoff customizados;
  - listModels para Anthropic e Gemini;
  - mudanças no loop do agente.
