# Design — prompt-command-autocomplete

## Context
- O `Autocomplete` do `@termuijs/ui` 0.1.7 instalado tem estas limitações:
  - só insere teclas de um caractere, e o espaço chega como `"space"`;
  - é de uma linha só e não tem cursor;
  - tem altura fixa de 6;
  - desenha a lista abaixo da própria linha de query;
  - `_isOpen` e `_selectedIndex` são privados.

  Por isso ele não substitui o prompt, só exibe as sugestões.
- O `AppBuilder` só despacha teclas para `List` e `TextInput`. Todo o resto passa por `runtime/keyboard.ts`.
- `Screen.writeString` remove ANSI, então a lista não tem cores de terminal, só os atributos do TermUI.
- Os slots colapsam com `height: 0`, como `ToolSlot` e `DiffPanel` já fazem.
- O modo batch não carrega o TermUI. A lista de comandos chega ao runtime por um método opcional do `InteractiveIO`.

## Architecture

### Sugestões puras (`commands/suggestions.ts`)
`commands/` é a pasta de propósito da TUI para comandos. O módulo não depende do TermUI, então é testável sem runtime.

```ts
// commands/types.ts
interface CommandSuggestion { readonly name: string; readonly description?: string }

// commands/suggestions.ts
BUILT_IN_SUGGESTIONS: readonly CommandSuggestion[]   // help, commands, model, clear, exit
commandSuggestions(registry): CommandSuggestion[]    // built-ins + registry.list(), sem duplicatas, ordenado
slashQuery(text): string | undefined                 // "/com" -> "com"; undefined se multilinha, sem "/" ou com espaço
matchSuggestions(items, query): CommandSuggestion[]  // prefixo case-insensitive
completion(item): string                             // "/name "
```

### Widget (`runtime/command-suggestions.ts`)
`CommandSuggestions` envolve o `Autocomplete` do TermUI num `Box` colapsável.
- `setItems(items)` guarda as sugestões.
- `update(text)`:
  - calcula `slashQuery`;
  - sem query ou sem correspondência, colapsa (`height: 0`);
  - com correspondência, ajusta `autocomplete.query` e a altura (`1 + min(matches, LAYOUT.suggestionMaxRows) + borda`).

  Assim a linha de query do `Autocomplete` mostra o texto digitado, como cabeçalho.
- Estado próprio: `isOpen` e `selectedIndex`, que o `Autocomplete` não expõe.
  - `move(±1)` repassa `down`/`up` ao `Autocomplete`, que destaca o item, e espelha o índice;
  - `selected()` devolve a sugestão atual ou `undefined`;
  - `close()` repassa `escape` e colapsa.
- O `filter` do `Autocomplete` é configurado com `matchSuggestions`, e os itens são `"/name  description"` formatados. O espelho do índice usa a mesma lista filtrada, então os dois ficam iguais.
- O `Autocomplete` recebe `isFocused = true` só enquanto aberto, porque ele só desenha a lista quando focado. O `Prompt` continua com o foco visual do cursor.

### Layout
O `buildApp` insere `parts.suggestions.widget` entre o spinner e o prompt. O `LAYOUT` ganha `suggestionMaxRows: 6`.

### Prompt
O `Prompt` aceita um listener de mudança (`onChange`), além do resize que já existe, e ganha `replace(text)` para completar. O runtime chama `suggestions.update(prompt.value)` a cada mudança.

### Teclado (`runtime/keyboard.ts`)
Depois de choices e escape, com `suggestions.isOpen`:
- `up`/`down` chamam `suggestions.move`, e o transcript não rola;
- `tab`, ou `enter` com item selecionado, chama `prompt.replace(completion(item))`;
- `escape` chama `suggestions.close()` e não cancela a requisição;
- `enter` sem seleção envia normalmente;
- as demais teclas vão para o prompt, que dispara o `update`.

A ordem fica: choices aberta > sugestões abertas > comportamento atual.

### IO e aplicação
- `InteractiveIO.setCommandSuggestions?: (items: readonly CommandSuggestion[]) => void` (em `shared/types.ts`, porque `shared/` não importa pastas irmãs, então o `CommandSuggestion` fica definido em `shared/types.ts` e `commands/types.ts` o re-exporta).
- `runSession` chama `io.setCommandSuggestions?.(commandSuggestions(registry))` depois de descobrir os comandos.
- O fallback em texto ignora a chamada.

## Alternatives considered
- **Trocar o `TextArea` pelo `Autocomplete`.** Rejeitada: perde espaço, multilinha e cursor, e a lista ficaria fora da tela no rodapé.
- **`List` do TermUI com descrição.** Mais previsível, mas não é o componente pedido. Fica como plano B, se o `Autocomplete` não renderizar bem no slot.
- **Lista de sugestões no `ConversationStore`.** Rejeitada: é estado efêmero de entrada, e não da conversa.

## Risks
- **Destaque e índice divergirem.** O `Autocomplete` mantém o próprio índice privado. Mitigação: o espelho usa a mesma função de filtro e reinicia junto em cada `update`. Um teste cobre a sequência digitar, ↓, ↓, ↑, Tab.
- **Detalhe de render do `Autocomplete` sem foco.** Mitigação: `isFocused` é controlado manualmente, como no `Prompt`.
- **Enter ambíguo.** Mitigação: o Enter só completa quando há seleção explícita, e sem seleção ele envia.
