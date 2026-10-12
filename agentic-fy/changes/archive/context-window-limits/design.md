# Design — context-window-limits

## Context
- TypeScript estrito, `exactOptionalPropertyTypes`, ESM, Node ≥22, sem dependência nova.
- Antes desta mudança:
  - `src/cli/tui/session/session.ts` cortava o histórico pelas 40 últimas mensagens (`MAX_HISTORY_MESSAGES`), avançando até um `role: "user"`.
  - `src/core/agent/agent.ts` monta `[system, ...history, user]`: o system prompt nunca está no histórico da sessão, então a compactação não pode descartá-lo.
  - `ProviderSpec.defaultMaxTokens` só existia para o Anthropic (4096) e era o único `maxOutputTokens` enviado.
- **Revisão:** este design foi escrito antes do `catalog-refresh`. Aquela mudança já trouxe os limites por modelo do models.dev (`ModelLimit { context, output }` em `catalog/types.ts`, via `modelInfo`). Por isso a tabela própria `LIMITS` e os campos `contextTokens`/`maxOutputTokens` planejados aqui foram descartados: esta mudança só consome o que o catálogo já tem.
- Restrições: `provider-boundary.test.ts`, `providers-structure.test.ts` (tipos exportados só em `types.ts`, imports só pelo barrel), `tui-structure.test.ts`.

## Architecture

### 1. Limite efetivo por modelo — `catalog/limits.ts`
`modelLimit(provider: string, model: string): ModelLimit`:
1. Provedor conhecido e modelo no catálogo → `limit` do catálogo.
2. Provedor conhecido, modelo fora do catálogo (alias, id customizado, Ollama) → `ProviderSpec.defaultLimit`, que substitui `defaultMaxTokens`.
3. Provedor desconhecido (identidade customizada, testes) → `{ context: 8192, output: 2048 }`.

A saída é limitada a `MAX_OUTPUT_TOKENS = 32768` e nunca passa do contexto. O catálogo chega a 128k de saída; reservar tudo em toda chamada encolheria o orçamento do histórico sem ganho, e 32k já permite escrever um arquivo grande numa resposta.

| Provedor | `defaultLimit` (só fora do catálogo) | Default do catálogo → efetivo |
|---|---|---|
| openai | 128000 / 16384 | `gpt-4.1-mini`: 1047576 / 32768 |
| anthropic | 200000 / 8192 | `claude-sonnet-4-6`: 1000000 / 128000 → 32768 |
| gemini | 1048576 / 8192 | `gemini-3.8-flash`: 1048576 / 65536 → 32768 |
| ollama | 8192 / 2048 | sem catálogo; o `num_ctx` do servidor manda, e estourá-lo descarta contexto em silêncio |

### 2. Estimativa de tokens — `shared/tokens.ts`
`estimateTokens(messages)`: 4 caracteres por token em texto comum; 1 token por caractere a partir de U+2E80 (CJK, emoji); 4 tokens fixos por mensagem; 1600 por imagem (os fornecedores cobram por área, não pelo tamanho do base64); id, nome e argumentos de tool call contam como texto.

**Mudança em relação ao plano:** a ideia de corrigir a estimativa com o `usage.inputTokens` da última resposta foi abandonada. O `usage` que a sessão recebe é a soma de todas as chamadas do turno (o loop do agente faz várias), então não mede o tamanho do histórico enviado. A estimativa decide sozinha, com a margem do orçamento.

### 3. Compactação por orçamento — `session.ts`
```
budget = context - output - max(1024, ceil(context * 0.1))
```
A reserva cobre o que o histórico não carrega: system prompt, definições de ferramenta e o próximo prompt.

`trimHistory(history, budget)` descarta turnos inteiros, do mais antigo para o mais novo, até caber; o histórico mantido sempre começa num `role: "user"`, então nenhuma resposta de tool fica sem a chamada. O turno mais novo é mantido mesmo sozinho acima do orçamento: sem sumarização, cortá-lo perderia a pergunta atual. `MAX_HISTORY_MESSAGES` deixou de existir.

`appendTurn` devolve `{ dropped }`. `selectModel` também compacta, porque trocar para uma janela menor não pode enviar o histórico do modelo anterior.

### 4. Aviso
A própria sessão escreve no seu `writer` quando `dropped > 0`:
```
Context trimmed: 6 older messages dropped to fit the model window.
```
Escrever na sessão, e não nos chamadores, cobre os quatro pontos que chamam `appendTurn` (prompt, agente, subagente e comando) e também a troca de modelo.

### 5. Limite de saída explícito — `adapters/ai-sdk/provider.ts`
```ts
maxOutputTokens: options.maxTokens ?? modelLimit(provider, options.model ?? modelId).output
```
`AISDKOptions` ganha `provider: ProviderName`, preenchido pelas classes de `vendors.ts`. O limite segue o modelo da requisição, não só o padrão do provedor. `CompletionOptions.maxTokens` continua tendo prioridade.

## Alternatives considered
- **Tabela de limites própria (`LIMITS`), como no plano original.** Rejeitada: o catálogo já tem os limites do models.dev, e uma segunda tabela escrita à mão é o problema que o `catalog-refresh` resolveu.
- **Tokenizador real (`tiktoken` etc.).** Rejeitado: dependência pesada por fornecedor, e a decisão é "cabe ou não cabe" com margem.
- **Sumarizar os turnos descartados.** Fora de escopo: custa uma requisição por compactação.
- **Manter `MAX_HISTORY_MESSAGES` como teto extra.** Rejeitado: o limite por contagem é justamente o que erra.
- **Expor `contextUsage()` para o cabeçalho.** Adiado: nada consumiria agora; fica para quando o cabeçalho mostrar a ocupação.

## Risks
- **Crescimento dentro de um turno.** A compactação roda entre turnos. Um turno com muitas leituras grandes ainda pode estourar a janela no meio do loop do agente. Isso é do `CodeAgent`, fora desta mudança.
- **Modelos com limite de entrada menor que o contexto.** O models.dev separa `limit.input` em alguns modelos (ex.: `gpt-5`: 400k de contexto, 272k de entrada) e o catálogo só guarda `context`. O orçamento pode passar do limite de entrada nesses modelos; nenhum default atual é afetado.
- **A heurística erra.** Mitigação: margem de 10%, CJK contado por caractere, custo fixo por imagem.
- **Ollama com `num_ctx` maior que 8192** fica com orçamento menor que o possível. Conservador de propósito.
- **Spec `session-conversation-memory`** fala em "número máximo de mensagens". O delta usa `remove` + `add` em vez de `modify`, porque o `agentic-fy verify` consolida deltas contra uma spec vazia e falha em `modify`.
