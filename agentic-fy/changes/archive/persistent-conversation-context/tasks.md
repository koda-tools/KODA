# Tasks — persistent-conversation-context

Plano incremental. Cada tarefa mantém `npm run check`, `npm run format:check`,
`npm run build` e `npm test` passáveis.

- [x] 1. Em `src/core/agent.ts`: adicionar `history?: readonly ChatMessage[]` a `AgentRunOptions` e `messages: readonly ChatMessage[]` a `AgentRunResult`; `runDetailed` monta `system + history + user`, acumula as mensagens novas do turno e as devolve. Manter `run` e a chamada sem `history` compatíveis. Nenhuma função acima de 60 linhas.
- [x] 2. Testes de core (`test/agent.test.ts`): histórico prévio é incluído no pedido; o resultado devolve as mensagens novas do turno (user/assistant/tool) na ordem; `run` continua retornando só a string.
- [x] 3. Em `src/cli/tui/session.ts`: manter `history: ChatMessage[]`; adicionar `conversation()`, `appendTurn(messages)` com limite `MAX_HISTORY_MESSAGES` cortando em fronteira de turno, e `clearConversation()` que zera e reexibe o header.
- [x] 4. Em `src/cli/tui/turn.ts`: `runAgentTurn` recebe `history` e repassa a `agent.runDetailed`; o `AgentRunResult` já traz `messages`.
- [x] 5. Em `src/cli/tui/application.ts`: `runPrompt` passa `history: session.conversation()` e, ao concluir, chama `session.appendTurn(result.messages)`.
- [x] 6. Em `src/cli/commands/router.ts`: novo `RouteResult { type: "clear" }`, built-in `/clear` (alias `/reset`), e `/help` passa a listar `/clear`.
- [x] 7. Em `src/cli/tui/application.ts`: `handleRoute` trata `type: "clear"` chamando `session.clearConversation()` e escrevendo "Conversation context cleared.".
- [x] 8. Testes de fluxo (`test/conversation-context.test.ts`): a conversa persiste entre dois turnos; a memória da sessão sobrevive à atividade de tela e só é descartada no `/clear`; `/clear` e `/reset` descartam o histórico; a janela trunca em `MAX_HISTORY_MESSAGES` sem deixar `tool` órfão e sem cortar o system prompt.
- [x] 9. Rodar `npm run check`, `npm run format:check`, `npm run build` e `npm test`; garantir todos verdes, `provider-boundary.test.ts` ok, e nenhuma regressão.
