# Design — migrate-to-ai-sdk

## Context
- TypeScript estrito, sem `any`, com `exactOptionalPropertyTypes`. ESM com imports `.js`. Hoje Node ≥20 e TypeScript 5.9.3.
- Contrato que não muda: `ILLMProvider` (`complete`, `stream`, `supportsTools`, `capabilities`, `listModels?`) e os tipos de `contracts/types.ts`. O agente (`core/agent`), a sessão (`cli/tui/session`) e a TUI só conhecem esses tipos.
- Restrições em vigor que continuam valendo:
  - `provider-boundary.test.ts`: imports de SDK só em `providers/adapters/` e nenhum nome de provedor em `src/core`;
  - `providers-structure.test.ts`: pastas por propósito, `export type/interface` só em `types.ts`, imports de fora só pelo barrel;
  - erros nunca contêm a API key.
- Versões atuais no npm, que serão fixadas:

  | Pacote | Versão |
  |---|---|
  | `ai` | 7.0.137 |
  | `@ai-sdk/openai` | 4.0.91 |
  | `@ai-sdk/anthropic` | 4.0.78 |
  | `@ai-sdk/google` | 4.0.93 |
  | `@ai-sdk/openai-compatible` | 3.0.67 |
  | `zod` | 4.6.5 |

  Os pacotes `@ai-sdk/*` compartilham `@ai-sdk/provider` 4.0.26 e `@ai-sdk/provider-utils` 5.0.58. Todos exigem `node >=22`. O `zod` é peer dependency (`^3.25.76 || ^4.1.8`) e o 4.6.5 já está instalado de forma transitiva pelo SDK do MCP.
- O AI SDK resolve nomes de modelo em texto (`"anthropic/claude-..."`) pelo Vercel AI Gateway. O KODA nunca usa esse caminho: sempre cria a instância do provedor de forma explícita.

## Architecture

```
src/providers/
  catalog/
    types.ts        ProviderSpec ganha `sdk: SdkKind`
                    SdkKind = "openai" | "anthropic" | "google" | "openai-compatible"
    catalog.ts      openai → "openai", anthropic → "anthropic", gemini → "google", ollama → "openai-compatible"
  adapters/
    ai-sdk/
      types.ts        AISDKProviderOptions, VendorOptions (opções públicas, sem tipos de SDK)
      models.ts       spec + opções → LanguageModel
                      (createOpenAI(...).chat, createAnthropic, createGoogleGenerativeAI, createOpenAICompatible)
      messages.ts     ChatMessage[] → { system, messages: ModelMessage[] }; valida mídia de imagem
      tools.ts        ToolDefinition[] → ToolSet com tool({ description, inputSchema: jsonSchema(parameters) }), sem execute
      response.ts     resultado do generateText → ChatResponse
      stream.ts       partes do fullStream → StreamEvent (usa o ResponseAccumulator de shared/)
      errors.ts       inspect(error): FailureInfo; desembrulha RetryError, lê APICallError.statusCode
      list-models.ts  GET {baseURL}/models com Bearer, para as variantes compatíveis com OpenAI
      provider.ts     AISDKProvider implements ILLMProvider
      vendors.ts      OpenAIProvider, AnthropicProvider, GeminiProvider, OllamaProvider (classes finas)
```

Saem `adapters/openai`, `adapters/anthropic`, `adapters/gemini` e `adapters/ollama`. `shared/` continua sem SDK. `config/`, `factory/` e `auth/` não mudam de forma; a factory só passa a importar as classes de `adapters/ai-sdk/vendors.ts`.

### AISDKProvider
- O construtor recebe o `ProviderSpec` e as opções. Cria o `LanguageModel` uma vez, por meio de `models.ts`.
- `complete` chama `generateText({ model, system, messages, tools, temperature, maxOutputTokens, abortSignal, maxRetries: 2 })`.
- `stream` chama `streamText` com os mesmos campos e percorre `fullStream`.
- Ferramentas sem `execute`: o AI SDK devolve as chamadas e não executa nada, então o loop continua sendo o do KODA. Com isso, cada chamada é uma única etapa (sem `stopWhen`).
- `maxOutputTokens` vem de `options.maxTokens ?? spec.defaultMaxTokens`, o que mantém o 4096 da Anthropic.
- `options.model` continua sobrescrevendo o modelo da chamada. Quando é diferente do padrão, o adapter cria outro `LanguageModel` a partir da mesma instância de provedor.

### Mapeamento de mensagens (`messages.ts`)
| KODA | AI SDK |
|---|---|
| `system` (todas) | `system` (texto unido com `\n`, via `splitSystem`) |
| `user` texto/imagem | `{ role: "user", content: [{ type: "text" }, { type: "image", image: base64, mediaType }] }` |
| `assistant` + `toolCalls` | `{ role: "assistant", content: [text?, { type: "tool-call", toolCallId, toolName, input: parseToolArguments(arguments) }] }`; o bloco de texto só entra se não for vazio (bug 5) |
| `tool` | `{ role: "tool", content: [{ type: "tool-result", toolCallId, toolName: toolNameFor(...) ?? toolCallId, output: { type: "text", value } }] }`; o nome vem da chamada original (bug 1) |

- A validação de mídia da Anthropic (jpeg/png/gif/webp, senão `ProviderError`) continua no adapter e acontece antes da chamada.
- `requireToolCallId` continua sendo aplicado.

### Streaming (`stream.ts`)
| Parte do `fullStream` | Efeito |
|---|---|
| `text-delta` | `accumulator.text(text)` → evento `text-delta` |
| `tool-input-start` / `tool-input-delta` | evento `tool-call-delta` (informativo, como hoje) |
| `tool-call` | `accumulator.toolCall({ id, name, arguments: JSON.stringify(input) })` |
| `finish` | `accumulator.finish(reason)` + `addUsage({ inputTokens, outputTokens })` |
| `error` | lança `wrapProviderError("<Vendor> streaming", error, inspect)` |
| `abort` | lança `ProviderError` de cancelamento; nunca emite `done` |

No fim, `accumulator.close()` emite `tool-call`, `usage` e `done`, na mesma ordem de hoje. Os nomes e campos exatos das partes do AI SDK 7 são confirmados na tarefa 1.

### Erros e retries (`errors.ts`)
- `inspect` desembrulha `RetryError` (`lastError`). Para `APICallError`, devolve `{ status: statusCode }`. Quando não há status e a causa é de rede, devolve `{ connection: true }`.
- `wrapProviderError` e `describeFailure` de `shared/` continuam iguais, então as mensagens com dica de HTTP não mudam e nenhuma key aparece.
- `maxRetries: 2` fica explícito. É o mesmo padrão dos SDKs da OpenAI e da Anthropic. No Gemini, isso passa a valer também (diferença aceita, abaixo).

### `listModels` (`list-models.ts`)
- Vale só para as variantes `openai` e `openai-compatible`, como hoje.
- Faz `GET {baseURL}/models` com `Authorization: Bearer <key>`, usando o `fetch` injetado ou o global.
- A OpenAI mantém o filtro de modelos de chat (`isChatModel`) e o Ollama devolve todos.
- Falhas passam por `wrapProviderError("Listing models", ...)`.

### Classes públicas (`vendors.ts`)
```ts
// types.ts
interface VendorOptions {
  readonly apiKey: string;
  readonly model?: string;
  readonly fetch?: typeof fetch; // substitui o `client` do SDK do fornecedor
}
interface OpenAIProviderOptions extends VendorOptions { baseURL?; toolSupport? }
interface OllamaProviderOptions extends Omit<OpenAIProviderOptions, "apiKey"> { apiKey? }
type AnthropicProviderOptions = VendorOptions;
type GeminiProviderOptions = VendorOptions;
```

Cada classe estende `AISDKProvider` com o spec do catálogo e mantém o que é dela:
- `capabilities()`: imagens desligadas no Ollama;
- `supportsTools()` / `assertTools`: `toolSupport` da OpenAI e do Ollama, rejeitado antes da requisição;
- o filtro de `listModels`;
- a URL padrão do Ollama (`http://127.0.0.1:11434/v1`), sem chamada de descoberta.

`src/index.ts` exporta exatamente os mesmos símbolos.

### Testes de paridade no nível HTTP
- **`test/helpers/fake-fetch.ts`.** Implementa `fetch` e grava cada requisição: URL, método, headers (sem o valor das chaves) e o body em JSON. Responde a partir de um roteiro, com JSON, SSE (`text/event-stream`), status de erro ou falha de rede.
- **`test/provider-wire.test.ts`.** Uma tabela de cenários roda contra os quatro provedores:
  - texto no `complete`;
  - deltas de texto no `stream`;
  - definição de ferramenta, chamada e resultado em várias rodadas;
  - imagem;
  - system;
  - usage;
  - abort;
  - 401, 429 e falha de rede;
  - os bugs 1 a 6 vistos no body enviado;
  - Ollama: URL padrão e rejeição de tools com `toolSupport: false`.
- **As asserções olham os campos que importam**, não o body byte a byte: mensagens, papéis, tools, `tool_result`/`functionResponse`, imagens, system e `max_tokens`. Os dois SDKs montam o resto do body de jeitos diferentes.
- **Como os adapters atuais recebem o fake.** OpenAI e Ollama via `new OpenAI({ fetch })` e Anthropic via `new Anthropic({ fetch })`, passados como `client`. No Gemini, o `globalThis.fetch` é trocado durante o teste, porque o `@google/genai` não aceita `fetch` próprio (confirmar na tarefa 1).
- **Como o adapter novo recebe o fake:** pela opção pública `fetch`.
- **Regra:** a suíte é escrita e fica verde nos adapters atuais antes de qualquer troca. Depois da troca, nenhuma asserção muda, exceto as listadas em "Diferenças aceitas".

### Diferenças aceitas
1. **IDs gerados no Gemini.** Quando o Gemini não manda id, o AI SDK gera um id único em vez de `gemini-<nome>-<índice>`. O id continua casando com o resultado da ferramenta, que é o que o agente precisa. O `generateId` do `createGoogleGenerativeAI` não recebe nome nem índice, então o formato antigo não dá para manter.
2. **Argumentos normalizados.** Os argumentos da `tool-call` final saem de `JSON.stringify(input)`. O conteúdo é o mesmo, mas espaços podem mudar.
3. **Retries no Gemini.** O Gemini passa a ter retries (2), como os outros. Na suíte HTTP, 429 passa de 1 para 3 requisições no Gemini.
4. **Dica de conexão no Gemini.** O `@google/genai` transformava falha de rede num `Error` genérico, sem dica. Agora o Gemini mostra a mesma dica de conexão dos outros provedores.
5. **Espera entre retries de rede.** O AI SDK espera 2 s e depois 4 s antes de desistir de uma falha de rede. Os SDKs da OpenAI e da Anthropic esperavam cerca de 0,5 s e 1 s.
6. **Cancelamento uniforme.** Medido pela suíte HTTP: hoje OpenAI, Anthropic e Ollama engolem o cancelamento, fecham o stream e emitem `done` com o texto parcial, como se a resposta estivesse completa. Só o Gemini lança erro. Depois da troca, todos lançam `ProviderError`, que é o comportamento certo: o `reportFailure` da TUI já escreve "Cancelled." quando a sessão foi cancelada. A tabela de fornecedores da suíte guarda esse `onAbort` por provedor, e ele passa a ser `throw` em todos.
7. **Chave do resultado de ferramenta no Gemini.** O adapter antigo enviava `functionResponse.response = { result: <texto> }`. O AI SDK envia `{ name, content: <texto> }`. O texto chega igual ao modelo, só muda a chave. O leitor da suíte extrai o texto das duas formas.

### Achados da tarefa 1 (tipos instalados)
- `system` está obsoleto no `generateText`/`streamText`; o campo atual é `instructions`.
- `ImagePart` (`type: "image"`) está obsoleto; imagem vai como `FilePart` (`{ type: "file", mediaType, data }`).
- O resultado do `generateText` e a parte `finish` do stream trazem `rawFinishReason`, o motivo de parada bruto do fornecedor (`tool_calls`, `end_turn`, `STOP`...). O adapter usa esse valor, então o `finishReason` fica igual ao de hoje. A diferença que o design previa nesse ponto não acontece.
- Partes do `fullStream` usadas: `text-delta` (`text`), `tool-input-start` (`id`, `toolName`), `tool-input-delta` (`id`, `delta`), `tool-call` (`toolCallId`, `toolName`, `input`), `finish` (`rawFinishReason`, `finishReason`, `totalUsage`), `error` (`error`) e `abort`. As demais são ignoradas.
- O cancelamento emite a parte `abort` e fecha o stream. Outros erros chegam como parte `error` ou como exceção do próprio iterador. O adapter trata os três casos.
- Por padrão, o `streamText` faz `console.error` em todo erro, o que sujaria a TUI. O adapter passa `onError` vazio.
- Avisos do AI SDK (configuração não suportada, obsoletos) saem por `process.emitWarning`, que escreve no stderr. O adapter define `globalThis.AI_SDK_LOG_WARNINGS = false` quando o usuário não definiu outro valor.
- Retries: `maxRetries` padrão 2, com espera inicial de 2 s dobrando a cada tentativa. Os headers `retry-after-ms`/`retry-after` (0 a 60 s) são respeitados. Falha de rede com `cause` vira `APICallError` sem `statusCode` e com `isRetryable: true`. Um `TypeError("fetch failed")` sem `cause` sai sem ser embrulhado.
- `createGoogleGenerativeAI` é um alias de `createGoogle`. Os quatro pacotes aceitam `apiKey`, `baseURL` e `fetch`. O `createOpenAICompatible` exige `name` e `baseURL` e aceita `includeUsage`.
- O TypeScript 5.9.3 compila com os tipos do AI SDK (o projeto usa `skipLibCheck`). O risco de precisar do TypeScript 6 não se confirmou.
- O `@google/genai` usa o `fetch` global e não aceita um próprio. A suíte HTTP troca o `globalThis.fetch` durante os testes do Gemini antigo.
- O SDK da OpenAI ignora `retry-after-ms: 0` (valor falso) e cai no backoff padrão. A suíte usa `retry-after-ms: 1` para manter os testes rápidos nos dois lados.

## Alternatives considered
- **Manter os adapters próprios e só criar um adapter genérico compatível com OpenAI.** Rejeitada por decisão do usuário. Resolve os provedores compatíveis com OpenAI, mas continua exigindo trabalho por fornecedor para reasoning, Bedrock, Vertex e Azure.
- **Período de convivência (provedores novos no AI SDK, os quatro atuais nos SDKs próprios).** Rejeitada por decisão do usuário. Seriam duas implementações e duas dependências por fornecedor durante a transição.
- **Remover as classes por fornecedor e expor um provedor que aceita um `LanguageModel` injetado.** Rejeitada. `LanguageModel` é um tipo do AI SDK e iria para a API pública, violando o `vendor-boundary-enforcement`. Também quebraria o `instanceof` usado pela factory e pelos testes.
- **Usar `ToolLoopAgent`, MCP e TUI do AI SDK.** Rejeitada. Repetiriam o loop, as aprovações, as permissões por agent, os subagents e o MCP com filtro de ambiente que o KODA já tem.
- **Responses API da OpenAI (`openai()`) já nesta mudança.** Adiada. Muda o comportamento (armazenamento, itens de reasoning) e não é paridade. Entra junto com reasoning.
- **Servidor HTTP local em vez de `fetch` falso.** Rejeitada como padrão. Porta e tempo de subida deixam o teste mais frágil, e todos os SDKs envolvidos aceitam `fetch`, exceto o `@google/genai`, que é coberto trocando o global.

## Risks
- **API do AI SDK 7 diferente do esperado** (nomes das partes do stream, formato do `tool-result`, `RetryError`). Mitigação: a tarefa 1 confere os tipos em `node_modules` e anota neste design antes de implementar.
- **Tipos do AI SDK exigirem TypeScript mais novo que 5.9.3** (os pacotes são compilados com 6.0.3). Mitigação: `npm run check` logo depois da instalação, na tarefa 4. Se falhar, subir o TypeScript vira uma decisão explícita do usuário.
- **Regressão escondida no mapping.** Mitigação: a suíte HTTP fica verde nos adapters atuais antes da troca e não muda depois.
- **Abort sem exceção.** O `streamText` pode só terminar o stream, e o agente lançaria "stream ended without a response". Mitigação: as partes `abort` e `error` viram `ProviderError`, com cenário próprio na suíte.
- **Requisição indo para o AI Gateway por engano.** Mitigação: nenhum nome de modelo em texto, e um cenário da suíte verifica o host de cada requisição.
- **Quebra para quem usa Node 20 ou injeta `client`.** Mitigação: CHANGELOG com seção "Breaking" e README atualizado.
- **PowerShell bloqueando `npm.ps1` nesta máquina.** Mitigação: usar `npm.cmd` nos comandos locais. O CI não é afetado.
