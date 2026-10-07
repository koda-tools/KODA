# Proposal — prompt-command-autocomplete

## Why
Hoje o usuário precisa lembrar o nome exato de cada comando (`/help`, `/model`, os comandos customizados) e só descobre que errou depois de enviar. O registro já conhece todos os comandos e a TUI já usa o TermUI, mas o prompt não oferece nenhuma sugestão enquanto se digita `/`.

## What
- Enquanto o prompt tiver uma única linha começando com `/` e ainda sem espaço, mostrar acima dele as sugestões de comandos com o componente `Autocomplete` do TermUI (https://www.termui.io/components/autocomplete).
- Fontes das sugestões: os built-ins (`/help`, `/commands`, `/model`, `/clear`, `/exit`) e os comandos customizados do `CommandRegistry`.
- Teclado com a lista aberta:
  - ↑/↓ mudam a seleção;
  - Tab ou Enter completam o prompt com `/<comando> ` (com espaço, pronto para argumentos);
  - Esc fecha a lista sem cancelar nada.
- Sem sugestão selecionada, o Enter continua enviando o prompt normalmente.
- O prompt continua sendo o `TextArea`, que cresce com o conteúdo e aceita espaço e cursor.

## Scope
- In scope:
  - `src/cli/tui/runtime/*` (widget de sugestões, layout, teclado, prompt);
  - `src/cli/tui/shared/types.ts` (`InteractiveIO.setCommandSuggestions`);
  - `src/cli/tui/application/application.ts` (entregar os comandos ao runtime);
  - os testes.
- Out of scope:
  - completar argumentos dos comandos (por exemplo, nomes de modelo depois de `/model `);
  - busca fuzzy;
  - sugestões no modo batch ou no fallback em texto puro.
