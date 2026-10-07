# Tasks — prompt-command-autocomplete

Incremental implementation plan.

- [x] 1. Definir `CommandSuggestion` em `shared/types.ts` e o método opcional `InteractiveIO.setCommandSuggestions`.
- [x] 2. Criar `commands/suggestions.ts` com `BUILT_IN_SUGGESTIONS`, `commandSuggestions`, `slashQuery`, `matchSuggestions` e `completion`, além dos testes puros.
- [x] 3. Criar `runtime/command-suggestions.ts` sobre o `Autocomplete` do TermUI (slot colapsável, `update`, `move`, `selected`, `close`).
- [x] 4. `Prompt`: listener de mudança e `replace(text)`. `LAYOUT.suggestionMaxRows`. Inserir o slot no `buildApp` acima do prompt.
- [x] 5. `keyboard.ts`: rotear ↑/↓, Tab, Enter e Esc enquanto as sugestões estiverem abertas, preservando a prioridade da lista de escolhas.
- [x] 6. `termui-runtime.ts`: implementar `setCommandSuggestions` e ligar `prompt.onChange` a `suggestions.update`.
- [x] 7. `application.ts`: chamar `io.setCommandSuggestions?.(commandSuggestions(registry))` ao iniciar a sessão.
- [x] 8. Testes de teclado e widget (abrir com `/`, filtrar, navegar, completar com Tab e Enter, Esc fecha sem cancelar, Enter sem seleção envia).
- [x] 9. Rodar `npm run check` e `npm test`.
