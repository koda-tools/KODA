# Design — providers-structure-refactor

## Context
- TypeScript estrito, sem `any`, com `exactOptionalPropertyTypes`. Node ≥20, ESM com imports `.js`.
- SDKs: `openai`, `@anthropic-ai/sdk` e `@google/genai`. O `test/provider-boundary.test.ts` já exige que eles só sejam importados em `providers/adapters/`.
- `ProviderError` vive em `src/utils/errors.ts` e continua lá, porque é compartilhado com o resto do projeto.
- Segue o padrão usado na TUI (`tui-structure-refactor`): uma pasta por propósito, `export interface/type` só em `types.ts` e um barrel único.

## Architecture

```
src/providers/
  index.ts                     # barrel público; única entrada fora da pasta
  contracts/
    types.ts                   # MessageRole, ContentPart, ChatMessage, ToolCall, ToolDefinition,
                               # CompletionOptions, Usage, ChatResponse, StreamEvent,
                               # ProviderCapabilities, ILLMProvider
    content.ts                 # contentToText
  catalog/
    types.ts                   # ProviderName, ProviderSpec, ModelPrice
    catalog.ts                 # PROVIDERS: Record<ProviderName, ProviderSpec>
                               #   { defaultModel, modelEnv, apiKeyEnv?, defaultMaxTokens?, baseURL? }
                               # isProviderName, DEFAULT_PROVIDER
    pricing.ts                 # PRICES + estimateCost(provider, model, usage)
  config/
    types.ts                   # ProviderConfig (union discriminada), ProviderIdentity
    environment.ts             # selectedProvider, configFromEnvironment(env), resolveProviderIdentity
    validation.ts              # validateBaseURL
  factory/
    factory.ts                 # ProviderFactory.create(config) / fromEnvironment(env)
  shared/                      # sem SDK, sem imports de adapters/
    types.ts                   # FailureInfo
    errors.ts                  # describeFailure, wrapProviderError(label, error, info)
    messages.ts                # splitSystem(messages), requireToolCallId(message)
    arguments.ts               # parseToolArguments(json): Record<string, unknown>
    request.ts                 # optional(key, value): {} | { [key]: value }
    usage.ts                   # toUsage(input?, output?): Usage | undefined
    stream.ts                  # ResponseAccumulator (texto, tool calls, usage, finish -> eventos)
  adapters/
    openai/    types.ts  openai.provider.ts  mapping.ts  stream-accumulator.ts
    anthropic/ types.ts  anthropic.provider.ts  mapping.ts  stream.ts
    gemini/    types.ts  gemini.provider.ts  mapping.ts  stream.ts
    ollama/    types.ts  ollama.provider.ts
```

### Princípios
- **Composição, não herança.** Os helpers são funções puras em `shared/`. A única herança que fica é Ollama → OpenAI, porque a API é compatível.
- **`mapping.ts` por adapter.** Contém funções puras que vão do domínio para o vendor e do vendor para o domínio (mensagens, tools, resposta). Assim os testes não precisam de client.
- **Catálogo como fonte única.** A factory itera `PROVIDERS[name]` para descobrir a env da API key e do modelo. Somem os nomes de env escritos à mão e o literal `4096`.
- **Erros.** `wrapProviderError` relança um `ProviderError` sem embrulhar de novo. Os demais erros viram `ProviderError` com `cause` e o sufixo de `describeFailure`. Cada adapter só informa como extrair `status` e `connection` do erro do seu SDK. Isso corrige o bug 6.

### Streaming real
- **Anthropic.** `client.messages.create({ ..., stream: true }, { signal })` produz eventos:
  - `content_block_start` com `tool_use` registra id e nome;
  - `content_block_delta` com `text_delta` vira `text-delta`;
  - `input_json_delta` vira `tool-call-delta`;
  - `message_delta` traz `stop_reason` e `usage.output_tokens`;
  - `message_start` traz `usage.input_tokens`.

  No fim, as tool calls são emitidas e depois o `done`.
- **Gemini.** `client.models.generateContentStream({ ..., config: { abortSignal } })` entrega chunks com `text`, `functionCalls`, `usageMetadata` e `candidates[0].finishReason`. O texto é emitido incrementalmente, as tool calls vêm completas no chunk e o `usage` vem do último chunk.
- **Acumulação compartilhada.** O `ResponseAccumulator` de `shared/stream.ts` acumula texto, tool calls por chave, usage e finishReason, e gera `tool-call` e `done` de forma uniforme. O `StreamAccumulator` da OpenAI passa a usá-lo, mantendo só o parsing do chunk.
- **`complete` não muda.** Continua sendo uma chamada não-streaming em cada adapter.

### Correções de bug
1. **Nome da `functionResponse`.** No Gemini, o nome é resolvido procurando o `toolCallId` nas tool calls das mensagens assistant anteriores. Se não achar, usa `message.toolCallId`. A resposta leva também `id: toolCallId`.
2. **`signal`.** O Gemini repassa `options.signal` como `config.abortSignal`, tanto no complete quanto no stream.
3. **`finishReason`.** O Gemini preenche `finishReason` a partir de `candidates[0].finishReason`.
4. **Imagens.** No Anthropic, o conteúdo de user com imagens vira blocos `{ type: "image", source: { type: "base64", media_type, data } }`.
5. **Texto vazio.** No Anthropic, o assistant com tool calls só inclui o bloco `text` quando o texto não é vazio.
6. **Erro re-embrulhado.** Resolvido pelo `wrapProviderError`.
7. **Provider desconhecido.** `resolveProviderIdentity` lança `ProviderError("Unsupported provider '<x>'.")`, igual à factory, e passa a aplicar `trim` no nome.

### Pricing
- `catalog/pricing.ts` recebe `PRICES` e `estimateCost`, sem mudar a assinatura.
- `src/cli/tui/session/pricing.ts` é removido.
- O barrel da TUI continua exportando `estimateCost`, agora re-exportado de `providers/index.js`, então a API pública não muda.
- `header.ts` importa do barrel de providers.

### Barrel e imports
- `src/providers/index.ts` exporta:
  - os contratos e `contentToText`;
  - os adapters e seus Options;
  - `ProviderFactory`, `ProviderConfig` e `ProviderName`;
  - `resolveProviderIdentity` e `estimateCost`.
- Todos os imports fora da pasta usam `providers/index.js`.
- `src/index.ts` mantém exatamente os mesmos símbolos.
- Os testes de adapter passam a importar do barrel.
- O shim `providers/openai.provider.ts` é removido.

### Teste de estrutura (`test/providers-structure.test.ts`)
- Só `index.ts` fica na raiz de `src/providers`.
- `export interface` e `export type X =` só aparecem em `types.ts`.
- `shared/`, `contracts/`, `catalog/` e `config/` não importam SDK nem `adapters/`.
- Fora de `src/providers` não há imports de `providers/<subpasta>`.
- Os símbolos e arquivos removidos não voltam: `base.provider.ts`, `defaults.ts`, o shim e `tui/session/pricing.ts`.
- O `provider-boundary.test.ts` continua válido (SDK só em `adapters/`).

## Alternatives considered
- **Classe base abstrata `BaseProvider` com template methods.** Rejeitada: acopla os adapters, e o tipo de cada SDK é diferente demais. Funções puras são mais simples de testar.
- **Manter o stream simulado e fazer o streaming real numa change separada.** Rejeitada por decisão do usuário: entra nesta change.
- **Deixar o pricing na TUI.** Rejeitada por decisão do usuário: o preço é um dado do catálogo de modelos.

## Risks
- **Formato dos eventos de stream de cada SDK.** Mitigação: conferir os tipos instalados em `node_modules` antes de implementar. Os testes injetam um client fake que emite eventos tipados.
- **Quebra da API pública.** Mitigação: teste de type-check (`npm run check`) e uma lista explícita de exports de `src/index.ts`, que fica igual.
- **Regressão no agente com streaming incremental de tool calls no Anthropic.** Mitigação: `tool-call-delta` só é emitido de forma informativa, e as chamadas completas continuam saindo em `tool-call` e `done`, como já acontece com a OpenAI.
