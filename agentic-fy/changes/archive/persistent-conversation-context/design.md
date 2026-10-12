# Design — persistent-conversation-context

## Context
- `src/core/agent.ts` `runDetailed`: monta `messages` do zero por turno
  (system + user), roda o loop de tool-calls dentro do turno e descarta tudo ao
  retornar. Não há estado entre turnos.
- `src/cli/tui/application.ts`: `runInteractive` cria um `Session`, lê `❯` em
  loop e chama `runAgentTurn` por turno. O `Session` guarda usage, modelo
  selecionado e o `AbortController` — mas não a conversa.
- `src/cli/tui/turn.ts` `runAgentTurn`: chama `agent.runDetailed(prompt, {...})`
  e retorna `AgentRunResult`. É o único ponto que invoca o agente no modo
  interativo.
- `src/cli/tui/screen.ts`: Ctrl+L chega como tecla `clear` (code 12 no
  `key-parser.ts`) e dispara `this.clear()`, que esvazia o `TextBuffer`. O
  `Screen` não notifica a `application`; portanto o histórico do modelo, se
  viver no `Session`, já é naturalmente imune ao Ctrl+L.
- `src/cli/commands/router.ts`: built-ins (`/help`, `/commands`, `/model`,
  `/exit`) são roteados em `routeBuiltInCommand`, retornando um `RouteResult`.
- `src/providers/base.provider.ts`: `ChatMessage { role, content, toolCalls?,
  toolCallId? }`. `complete`/`stream` já recebem `readonly ChatMessage[]`.
- Restrições do projeto: core neutro quanto a provedores
  (`provider-boundary.test.ts`), nenhuma função nova acima de ~60 linhas, estilo
  compacto, `exactOptionalPropertyTypes`.

## Architecture

### 1. Histórico no agente (core)
- `AgentRunOptions` ganha `history?: readonly ChatMessage[]` (mensagens dos
  turnos anteriores, sem o system prompt).
- `AgentRunResult` ganha `messages: readonly ChatMessage[]`: as mensagens
  **novas** produzidas neste turno (user + assistant + tool), já na ordem.
- `runDetailed`:
  - inicia `messages` com `system`, depois `...options.history`, depois
    `{ role: "user", content: prompt }`;
  - no retorno, além de `content/usage/provider/model`, expõe o `messages` do
    turno (tudo que foi acrescentado a partir do `user` inclusive).
- `run(prompt)` continua existindo e retornando só a string (sem histórico), para
  não quebrar o SDK e os testes atuais.

### 2. Histórico na sessão (CLI)
- `Session` passa a manter `private history: ChatMessage[] = []`.
- Novo método `conversation(): readonly ChatMessage[]` devolve o histórico atual.
- Novo método `appendTurn(messages: readonly ChatMessage[]): void` concatena e
  aplica o limite de janela.
- Novo método `clearConversation(): void` zera `history` e reexibe o header.
- `application.runPrompt`: passa `history: session.conversation()` para
  `runAgentTurn` e, ao concluir, chama `session.appendTurn(result.messages)`.
- `runAgentTurn` recebe `history` e o repassa a `agent.runDetailed`.

### 3. Ctrl+L x /clear
- Ctrl+L: comportamento inalterado no `Screen` (limpa `TextBuffer`). Como o
  histórico vive no `Session`, Ctrl+L não o afeta. Garantido por teste.
- `/clear` (alias `/reset`): novo built-in em `router.ts` que retorna
  `{ type: "clear" }`. `application.handleRoute` trata esse tipo chamando
  `session.clearConversation()` e escrevendo uma confirmação curta
  ("Conversation context cleared.").
- `/help` passa a listar `/clear`.

### 4. Limite de janela
- Constante `MAX_HISTORY_MESSAGES` (ex.: 40). `appendTurn` mantém só as últimas
  N mensagens do `history` (o system prompt não vive no `history`, então nunca é
  cortado). Corte por contagem de mensagens, não por tokens.

## Alternatives considered
- Option A — manter o histórico dentro do `CodeAgent` (estado no core):
  rejeitado; o core deve ser sem estado de sessão e reusável pelo SDK. O estado
  de sessão pertence à camada interativa (`Session`).
- Option B — Ctrl+L disparar um callback para a `application` limpar também a
  conversa: rejeitado; contraria o objetivo (queremos preservar a memória). O
  descarte intencional fica no `/clear`.

## Risks
- Risk: crescer o histórico infla tokens/custo.
  Mitigation: `MAX_HISTORY_MESSAGES` corta por contagem; system prompt preservado.
- Risk: mensagens `tool` órfãs (sem o assistant com toolCalls) se o corte partir
  um turno ao meio.
  Mitigation: cortar em fronteira de turno (nunca deixar `tool` sem seu
  `assistant`), ou cortar em blocos a partir do início preservando pares.
- Risk: quebrar o SDK/testes existentes.
  Mitigation: `run` e a assinatura atual de `runDetailed` sem `history` continuam
  válidas; `history`/`messages` são adições opcionais.
- Risk: tocar o core e violar `provider-boundary`.
  Mitigation: só adicionamos campos neutros (`ChatMessage[]`); sem nomes de
  provedores no core.
