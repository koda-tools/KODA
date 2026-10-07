# Design — tui-structure-refactor

## Context

Mapeamento feito em `/agentic-fy-explore tui-structure-refactor`:

- 23 arquivos em `src/cli/tui`, ~2.700 linhas.
- Imports externos à TUI:
  - `src/cli/index.ts`: `application`, `highlight`, `diff-view`, `output`, `termui`;
  - `src/index.ts`: `header`, `pricing`, `application`;
  - 10 arquivos em `test/`.
- Código morto confirmado por cruzamento de exports e imports:

| Item | Motivo |
|---|---|
| `screen.ts`, `screen/*` | Só testes importam. A CLI usa TermUI. |
| `decision.ts` | Não é usado em `src/`. O `cli/index.ts` tem uma cópia própria (`decide`, `confirm`, constantes). |
| `holdStatus`, `releaseStatus` | Só o `decision.ts` morto chama. |
| `showApproval`, `ToolApprovalRequest`, `ToolApproval`, `pendingApproval`, `resolveApproval` | Nada chama. A aprovação usa a `List`. |
| `ToolCallView.kind`, `ToolCallKind`, `TOOL_KIND` | São escritos, mas nunca lidos. |
| Store: `provider`, `model`, `usage` | Nunca lidos. Inicializados com `""`. |
| `spinner.ts` parâmetro `_writer` | Não é usado. |
| `diffTitle` (campo) | Pode ser variável local. |
| `screen/text-buffer.ts` `sanitize*` | Duplica `sanitize.ts`. |

## Decisões

Assumidas como padrão porque não houve resposta na exploração:

1. **Renderer antigo:** remover `screen.ts`, `screen/` e os testes que só exercitam ele (`screen.test.ts`, `key-parser.test.ts` e os casos de `Screen`/`TextBuffer` em `markdown-stream.test.ts`). O teste de `sanitizeStyled` migra para `shared/`.
2. **Aprovação:** remover `showApproval` e `ToolApproval`. A `List` é o único fluxo.
3. **SDK:** os caminhos internos mudam, mas `src/index.ts` continua exportando os mesmos símbolos via `tui/index.ts`.
4. **`highlight.ts`:** foi alterado fora da sessão. Mantém a API atual (`BundledLanguage`, `GrammarState`). Só a forma é compactada.

## Architecture

```
src/cli/tui/
├── index.ts                 barrel público (única porta para fora da TUI)
├── shared/                  usado por 2+ pastas; não importa nenhuma pasta irmã
│   ├── types.ts             InteractiveIO, Segment, LineWriter, requests (diff/model/tool/select)
│   ├── sanitize.ts
│   └── ansi.ts              constantes SGR (DIM, RESET, …)
├── highlight/               types.ts (CodeHighlighter, HighlightedLine) · highlighter.ts
├── markdown/                markdown-stream.ts
├── diff/                    types.ts (PlainDiffLine) · diff-segments.ts · diff-lines.ts
├── output/                  line-writer.ts · render.ts · write-arguments.ts
├── session/                 types.ts · session.ts · header.ts · pricing.ts
├── commands/                model-command.ts · decision.ts (decide/confirm únicos)
├── turn/                    types.ts · turn.ts · spinner.ts
├── runtime/                 TermUI
│   ├── types.ts             MountedApp, Pending*, constantes de layout
│   ├── termui-runtime.ts    orquestra; implementa InteractiveIO
│   ├── layout.ts            árvore de widgets (header, output row, slots, prompt)
│   ├── keyboard.ts          roteamento de teclas (onKey)
│   ├── transcript.ts        AnsiLogView + Scrollbar + estado de scroll
│   ├── choice-list.ts       List para /model e Autorizar/Rejeitar
│   ├── tool-slot.ts         ToolCall
│   ├── ansi-log-view.ts
│   └── conversation-store.ts
└── application/             types.ts (InteractiveOptions, InteractiveRuntime) · application.ts
```

Regras:

- `types.ts` contém só tipos e interfaces, sem lógica.
- `shared/` não importa de nenhuma pasta irmã. As pastas podem importar `shared/`.
- Fora da TUI, os imports vêm só de `tui/index.js`. Exceção: o import dinâmico do runtime em `cli/index.ts` passa a ser `import("./tui/index.js")` com export lazy, ou um entry `tui/runtime/index.ts` documentado, para manter o batch sem carregar TermUI.
- `termui-runtime.ts` compõe classes pequenas (`Transcript`, `ChoiceList`, `ToolSlot`, `KeyboardRouter`). Cada uma tem dono claro do próprio estado.

## Clean code

- Funções curtas e com nome que diz o que fazem. Sem comentários que repetem o código. Comentários só para o "porquê" (ex.: limitações do TermUI).
- Constantes de layout agrupadas em `runtime/types.ts` (ou `runtime/constants.ts`).
- Sem campos de classe usados só por um método.
- Sem parâmetros ignorados (`_writer`).

## Alternatives considered

- **Só mover arquivos sem dividir `termui.ts`:** menor risco, mas mantém a classe de 615 linhas, que é o maior problema.
- **Migrar para `@termuijs/jsx`:** resolveria foco e estado de forma idiomática, mas é reescrita, fora do escopo.

## Risks

- **Imports quebrados em testes e SDK.** Mitigação: o barrel `tui/index.ts`, `npm run check` e a suíte completa a cada etapa.
- **Lazy-load do TermUI no modo batch.** Mitigação: manter o import dinâmico separado do barrel, ou reexportar o runtime só via import dinâmico, e testar com `test/cli.test.ts`.
- **A change `replace-tui-with-termui` ainda está ativa.** O requisito `terminal-lifecycle-safety` dela verifica `test/screen.test.ts`, que será removido. Mitigação: arquivar `replace-tui-with-termui` antes de remover o renderer, e ajustar o `verify` desse requisito para `npm test -- test/tui.test.ts`.
- **Regressão sutil de comportamento ao dividir o runtime.** Mitigação: mover o código sem reescrevê-lo primeiro, separar em classes depois e manter os testes verdes entre os passos.
