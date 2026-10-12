# Proposal — migrate-to-ai-sdk

## Why
A camada de provedores tem quatro adapters escritos à mão (OpenAI, Anthropic, Gemini e Ollama), cada um com mapping, stream e tratamento de erro próprios sobre o SDK do fornecedor (`openai`, `@anthropic-ai/sdk`, `@google/genai`). Isso tem três custos:

- Cada recurso novo precisa ser feito quatro vezes: reasoning, `listModels` para Anthropic e Gemini, timeouts, tokens em cache.
- Adicionar um provedor exige um adapter novo, mesmo quando a API é compatível com OpenAI. Isso trava a próxima mudança (`add-providers`), que quer cobrir o que o OpenCode já suporta.
- `OpenAIProviderOptions`, `AnthropicProviderOptions` e `GeminiProviderOptions` aceitam um `client` do SDK do fornecedor. Isso põe tipos de fornecedor na API pública, contrariando o requisito `vendor-boundary-enforcement`.

O AI SDK (`ai` 7.x) já normaliza mensagens, ferramentas, streaming, uso de tokens e erros para todos esses fornecedores. É a mesma base que o OpenCode usa.

## What
- Trocar os quatro adapters por um adapter único em `src/providers/adapters/ai-sdk/`, construído sobre:
  - `ai`;
  - `@ai-sdk/openai`, usando Chat Completions (`openai.chat`);
  - `@ai-sdk/anthropic`;
  - `@ai-sdk/google`;
  - `@ai-sdk/openai-compatible`, para o Ollama.
- Manter o contrato `ILLMProvider` e todo o resto do KODA igual: loop do agente, aprovações, MCP, TUI e sessões.
- Manter as classes públicas `OpenAIProvider`, `AnthropicProvider`, `GeminiProvider` e `OllamaProvider` como classes finas sobre o adapter. A opção `client` dá lugar a `fetch`, que é um tipo padrão da web.
- Antes da troca, escrever uma suíte de testes no nível HTTP (`test/provider-wire.test.ts`) que passe nos adapters atuais. A mesma suíte, sem mudar as asserções, tem que passar no adapter novo. É isso que prova a paridade.
- Remover `openai`, `@anthropic-ai/sdk` e `@google/genai`. Adicionar `ai`, os pacotes `@ai-sdk/*` e `zod`, todos com versão exata.
- Subir `engines.node` para `>=22`, exigido pelo AI SDK. O Node 20 já saiu de suporte e o CI já roda em Node 22.

## Scope
- In scope:
  - `src/providers/**`, sobretudo `adapters/` e `catalog/`, que ganha o campo `sdk`;
  - `src/index.ts`: mesmos símbolos, tipos das opções atualizados;
  - os testes de provedores: novos `test/provider-wire.test.ts` e `test/helpers/fake-fetch.ts`. `test/openai.provider.test.ts` sai, e `provider-adapters.test.ts`, `provider-boundary.test.ts`, `providers-structure.test.ts` e `factory.test.ts` são atualizados;
  - `package.json` e `package-lock.json`: dependências e `engines`;
  - README (requisito de Node) e CHANGELOG.
- Out of scope:
  - provedores novos e a seção `provider` no `koda.json` (próxima mudança, `add-providers`);
  - Responses API da OpenAI, reasoning, timeouts e tokens em cache;
  - `listModels` para Anthropic e Gemini;
  - Models.dev;
  - `ToolLoopAgent`, MCP, TUI ou telemetria do AI SDK;
  - mudanças no loop do agente, nas sessões ou na TUI;
  - publicar versão (o bump fica para o release).

## Breaking changes
- Node 22 ou mais novo.
- As opções das classes de provedor não aceitam mais `client`. Quem injetava um cliente do SDK do fornecedor passa a injetar `fetch`.
