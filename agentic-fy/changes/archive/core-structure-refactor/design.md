# Design — core-structure-refactor

## Context
- TypeScript estrito, sem `any`, `exactOptionalPropertyTypes`, ESM com imports `.js`.
- Mesmo padrão já aplicado em `src/cli/tui` e `src/providers`: pasta por propósito, `export interface`/`export type` só em `types.ts`, barrel único.
- O core consome os providers só por `providers/index.js` e não pode citar nomes de vendor (`provider-boundary.test.ts`).

## Architecture

```
src/core/
  index.ts                 # barrel público
  agent/
    types.ts               # CodeAgentOptions, AgentRunOptions, AgentObserver,
                           # AgentRunResult, ToolExecutor
    constants.ts           # DEFAULT_SYSTEM_PROMPT, DEFAULT_MAX_ITERATIONS,
                           # THINKING_STATUS, DEFAULT_TOOL_STATUS
    agent.ts               # CodeAgent: valida, monta mensagens e roda o loop
    response.ts            # requestResponse(provider, messages, options, observer)
    tool-runner.ts         # runToolCalls(calls, tools, observer): ChatMessage[]
  model/
    types.ts               # ModelRef
    model-ref.ts           # parseModelRef, resolveModel(ref, identity)
  usage/
    usage.ts               # EMPTY_USAGE, sumUsage(a, b)
```

### Contratos (`agent/types.ts`)
```ts
interface ToolExecutor {
  readonly definitions: readonly ToolDefinition[];
  execute(name: string, serializedArguments: string): Promise<ToolObservation>;
  statusLabel(name: string): string | undefined;
}

interface AgentObserver {
  onTextDelta?(text: string): void;
  onStatus?(label: string | undefined): void;
  onToolStart?(call: ToolCall): Promise<void> | void;
  onToolResult?(call: ToolCall, observation: ToolObservation): Promise<void> | void;
}

interface CodeAgentOptions {
  readonly identity: ProviderIdentity;   // obrigatório
  readonly maxIterations?: number;
  readonly systemPrompt?: string;
}

interface AgentRunOptions {
  readonly model?: string;
  readonly signal?: AbortSignal;
  readonly history?: readonly ChatMessage[];
  readonly observer?: AgentObserver;
}
```
- `ToolObservation` sai de `tools/registry.ts` e passa a ser definido no core, que é o dono do contrato. `src/tools` importa do barrel do core. Isso inverte a dependência: tools dependem do core, e não o contrário.
- `ProviderIdentity` vem do barrel de providers.
- O construtor do `CodeAgent` passa a ser `new CodeAgent(provider, tools, { identity, ... })`.

### Fluxo
1. `runDetailed` valida o prompt e resolve o modelo com `resolveModel(options.model, identity)`.
2. Monta as mensagens: `system`, `history`, `user`.
3. Loop até `maxIterations`:
   - `onStatus(THINKING_STATUS)`;
   - `requestResponse` usa `stream` se houver `onTextDelta` e `complete` caso contrário;
   - soma o usage com `sumUsage`;
   - empilha a mensagem do assistant;
   - sem tool calls, devolve o resultado final;
   - com tool calls, `runToolCalls` devolve as mensagens `tool`.
4. `finally`: `onStatus(undefined)`.

O comportamento e as mensagens de erro ficam idênticos aos atuais.

### Modelo (`model/model-ref.ts`)
- `parseModelRef("openai/gpt-4o#v")` devolve `{ provider: "openai", model: "gpt-4o" }`, e `parseModelRef("gpt-4o")` devolve `{ model: "gpt-4o" }`.
- `resolveModel(raw, identity)`:
  - `undefined` vira `identity.model`;
  - provider divergente lança `AgentError` com a mensagem atual;
  - nos outros casos devolve `ref.model`.

  Como o modelo agora é sempre resolvido, o `AgentRunResult.model` é sempre real e o `CompletionOptions.model` é sempre enviado.

### Usage (`usage/usage.ts`)
- `sumUsage(a, b)` soma `inputTokens` e `outputTokens`, tratando campos ausentes como 0.
- `EMPTY_USAGE = { inputTokens: 0, outputTokens: 0 }`.
- `router.ts` deixa de ter `accumulateUsage`. O `session.ts` usa `sumUsage` pelo barrel.

### Rótulos de status (`src/tools/registry.ts`)
- Os rótulos ficam num mapa `STATUS_LABELS` em `src/tools/registry.ts`, chaveado pelo `name` de cada definição e ao lado delas. Não muda o `ToolDefinition` dos providers, para não levar conceito de UI ao contrato de LLM.
- O `ToolRegistry` implementa `statusLabel(name)` a partir desse mapa.
- `definitions` continua expondo apenas `ToolDefinition` (`name`, `description`, `parameters`).

### Barrel e testes
- `src/core/index.ts` exporta `CodeAgent`, os tipos de `agent/types.ts`, `parseModelRef`, `resolveModel`, `sumUsage` e `EMPTY_USAGE`.
- `test/core-structure.test.ts`:
  - só `index.ts` na raiz de `src/core`;
  - tipos exportados só em `types.ts`;
  - nada fora do core importa `core/<subpasta>`;
  - o core não contém nomes de tools (`readFile`, `writeFile`);
  - `accumulateUsage` e `UsageTotals` não existem mais.

## Alternatives considered
- **Eventos via `AsyncGenerator<AgentEvent>`.** Rejeitada por ora: a aprovação de escrita precisa aguardar o usuário no meio da execução e a TUI teria que ser reescrita.
- **`statusLabel` no `ToolDefinition` de providers.** Rejeitada: mistura conceito de UI no contrato enviado ao LLM.
- **Classe base ou estratégia para complete/stream.** Rejeitada: uma função com um `if` resolve.

## Risks
- **Mudança da API pública do construtor.** Mitigação: atualizar `src/index.ts`, a CLI e os testes. O projeto não tem consumidores externos.
- **`CompletionOptions.model` passa a ser sempre enviado.** Mitigação: hoje a CLI já passa o modelo resolvido do ambiente, que é o mesmo valor que o provider usaria como padrão.
- **Regressão nos callbacks da TUI.** Mitigação: rodar `test/tui.test.ts` e `test/agent.test.ts`, que cobrem status, deltas e tool calls.
