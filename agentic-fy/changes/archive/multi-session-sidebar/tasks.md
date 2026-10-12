# Tasks — multi-session-sidebar

Plano de implementação incremental. Cada tarefa deve deixar `npm run check`,
`npm run format:check`, `npm run build` e `npm test` em estado passável.
Nenhuma dependência nova; funções curtas (< ~60 linhas); sem relaxar segurança.

- [x] 1. Extrair de `src/cli/tui/session/header.ts` os helpers `formatTokens`, `formatCost` e o cálculo de total de tokens para funções reutilizáveis (exportáveis), sem mudar a saída atual do `renderHeader`.

- [x] 2. Criar `src/cli/tui/session/session-manager.ts` com `ManagedSession` (`id`, `title`, `session`, `transcript: string[]`) e `SessionManager` (`active`, `list`, `activeIndex`, `create`, `switchTo`, `remove`), recebendo uma fábrica de `Session`. Sem conhecer widgets.

- [x] 3. Escrever testes unitários do `SessionManager` (`test/session-manager.test.ts`): inicia com uma sessão; `create` torna ativa e preserva as demais; `switchTo` troca o ativo sem alterar histórico/usage; buffers de transcript independentes.

- [x] 4. Estender `ConversationState` (`runtime/types.ts`) e `createConversationStore` (`runtime/conversation-store.ts`) com `sessions: readonly SessionSummary[]` e `sidebarVisible: boolean`, definindo `SessionSummary` (`id`, `title`, `active`, `model`, `provider`, `tokens`, `cost`). Defaults: `sessions = []`, `sidebarVisible = true`.

- [x] 5. Adicionar à `InteractiveIO` (`shared/types.ts`) os membros opcionais `showSessionPicker`, `setSessions` e `setSidebarVisible` (todos opcionais, com fallback no-op) para manter o caminho sem runtime (testes/SDK) funcionando.

- [x] 6. Criar `src/cli/tui/runtime/session-sidebar.ts`: um `logView` de largura fixa com `border: "single"` que lê `store` (logo KODA, seção SESSIONS com marcadores da ativa/inativas e "+ New session", seção CURRENT com model/provider/tokens/custo via os helpers da task 1). Colapsa para largura 0 quando `sidebarVisible` é falso.

- [x] 7. Reescrever `src/cli/tui/runtime/layout.ts` para o arranjo de duas colunas: `Box({ flexDirection: "row" })` com a sidebar (fixa) à esquerda e a coluna de chat (`flexGrow:1`) à direita contendo header compacto, `transcript.createRow()`, `toolSlot`, `diffPanel`, `choices`, `spinner`, `suggestions`, `prompt`; e o rodapé de dicas abaixo. Atualizar `LayoutParts` e `LAYOUT`/`PROMPT_HINT` em `constants.ts`.

- [x] 8. No `TermUIRuntime`: criar a sidebar como campo, passá-la ao `buildApp`, adicionar swap de transcript (`getTranscript`/`setTranscript`), `toggleSidebar()`, `setSessions()`/resumo, e `showSessionPicker` modelado em `showModelPicker` (reusa `ChoiceList`), com canal `onSessionIntent` para a aplicação.

- [x] 9. Estender `KeyboardTargets` e `createKeyHandler` (`runtime/keyboard.ts`) com `newSession()`, `openSessionPicker()`, `toggleSidebar()`: `Ctrl+N`, `Ctrl+B` e `Tab` com prompt vazio abrindo o picker (senão `prompt.handleKey`). `Prompt.isEmpty` adicionado. Atalhos não disparam com modal aberto.

- [x] 10. Adaptar `src/cli/tui/application/application.ts`: `SessionController` (sessão inicial), loop sobre a sessão ativa, criar sessão em `Ctrl+N`, trocar via picker, empurrar resumo ao store a cada mudança. Preservar o `io.onCancel` (1º Esc aborta, 2º sai) sobre a sessão ativa.

- [x] 11. Fiar as novas chamadas do runtime nos callbacks de `TermUIRuntime.run` via `onSessionIntent`, garantindo que o caminho sem runtime (io direto) continue com uma sessão e sem sidebar.

- [x] 12. Testes de integração do fluxo multi-sessão (`test/session-controller.test.ts`, via `io` falso): criar sessão troca a ativa; trocar preserva e restaura transcript; resumo reflete model/tokens da ativa; picker marca a ativa.

- [x] 13. Rodar `npm run check`, `npm run build` e `npm test`: 212 testes (211 pass, 1 skip de symlink no Windows), 0 falhas; type-check e build limpos. Formatados via prettier os arquivos desta change.
