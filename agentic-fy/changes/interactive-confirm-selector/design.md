# Design — interactive-confirm-selector

## Context
- Confirmação vive só na CLI (`src/cli/index.ts`): `confirm(screen, question)`
  (linhas ~48-51) é o único helper que deriva booleano, usado pela escrita
  (`createWritePolicy`, ~90-101, string na ~98) e pelo shell
  (`shellPolicy.approve`, ~125-131). O core nunca sabe de confirmação
  (`test/provider-boundary.test.ts`).
- `Screen.question()` (screen.ts ~115-129) é estritamente por linha: seta
  `this.prompt`, reseta o `LineEditor`, resolve `Promise<string|undefined>` em
  `submit()` (Enter), `cancel()` (Ctrl+C → `undefined`), `endOfInput()` (EOF).
  Não há modo de tecla única hoje.
- `key-parser.ts` já entrega `up/down/left/right/enter/cancel/eof`. Em
  `handleKey` (~204-233), `SCROLL_STEPS` consome `up/down` como scroll ANTES do
  switch; `left/right` caem no `default` (editor). Um seletor precisa interceptar
  as setas antes desse ponto.
- `renderer.ts` `composeFrame`: header + viewport + separador (mostra
  `status`) + `renderInputRow` (uma linha de prompt+editor). `FOOTER_ROWS = 2`.
- Status: `agent.runToolCalls` emite `onStatus("Writing...")` antes de
  `tools.execute`; `turn.ts` liga `onStatus` ao `spinner`; `spinner` chama
  `io.setStatus`. O seam para "Waiting..." é o wrapper CLI, que tem o `screen` e
  pode `setStatus` em volta do prompt.

## Architecture

### 1. API de seleção (`io.ts` + `screen.ts`)
- `InteractiveIO.select?: (request: SelectRequest) => Promise<number | undefined>`
  onde `SelectRequest = { title: string; options: readonly string[]; hint?: string }`.
  Resolve com o índice escolhido, ou `undefined` se cancelado.
- `Screen` ganha estado de seleção: `private selection: SelectState | undefined`
  com `{ title, options, hint, index, resolve }`.
- `Screen.select(request)`: imprime o `title` no scrollback (via `append`),
  guarda `selection` com `index = 0`, renderiza e devolve a Promise.
- `asIO()` passa a expor `select: (req) => this.select(req)`.

### 2. Interceptar teclas no modo seleção (`screen.ts`)
- Guard no topo de `handleKey`: `if (this.selection !== undefined) return
  this.handleSelectKey(key)` — antes do `SCROLL_STEPS`, então setas movem o radio
  em vez de rolar.
- `handleSelectKey(key)` (método novo, pequeno):
  - `up`/`left` → `index = (index - 1 + n) % n`; `down`/`right` → `+1`; re-render.
  - `enter` → resolve com `index`, limpa `selection`, ecoa a opção escolhida.
  - `cancel` (Ctrl+C) → resolve `undefined` (tratado como rejeição no wrapper).
  - demais teclas ignoradas.
- `stop()`/`cancel()` existentes também resolvem `selection` pendente com
  `undefined` para não vazar Promise.

### 3. Renderização do seletor (`renderer.ts`)
- `FrameInput` ganha `selection?: { options; index; title?; hint? }`
  (opcional, seguindo o padrão de spread condicional por
  `exactOptionalPropertyTypes`).
- Quando `selection` está presente, `composeFrame` renderiza, abaixo do
  separador, as linhas de opção (`◉ <opt>` para o índice ativo, `○ <opt>` para os
  demais; opção ativa em destaque com SGR) e uma linha de dica (`DIM`), em vez da
  `renderInputRow` de linha única. A geometria do rodapé passa a
  `FOOTER_ROWS_BASE + options.length + 1 (dica)` enquanto a seleção está ativa,
  via um `footerRows(input)` que substitui a constante fixa em `computeGeometry`.
- Sem seleção, nada muda (continua `renderInputRow`). Só SGR; `fit` mantém a
  largura segura.

### 4. Uso na CLI (`index.ts`)
- Novo helper `select(screen, request)` que chama `screen.select(...)` e devolve
  booleano `índice === 0` (Allow). Fallback: se o `screen`/IO não tiver `select`,
  usa o `confirm` por linha atual.
- `createWritePolicy`: em vez de `confirm(... '[y/N]')`, chama
  `select` com `title: \`Write  ${filePath}\``, opções `["Allow", "Reject"]`,
  hint `←↑↓→ select · enter confirm`. O `previewWrite` (diff) continua antes.
- `shellPolicy.approve`: idem, com `title: \`Run shell  ${source.path}\`` e o
  comando impresso no preâmbulo.

### 5. Status "Waiting for decision..." (`index.ts`)
- Wrapper em volta do prompt: antes de abrir o seletor,
  `screen.setStatus("Waiting for decision...")`; depois de resolver,
  `screen.setStatus(undefined)`. Isso sobrescreve o "Writing..." emitido pelo
  core enquanto a decisão está pendente, sem tocar no core nem no spinner.
- O core continua emitindo "Writing..." (correto quando a escrita de fato
  ocorre, após o Allow). O wrapper só mascara durante a decisão.

## Alternatives considered
- A — Renderizar as opções no scrollback e atualizar a cada seta: polui o
  transcript com repetições. Rejeitado; melhor um bloco de rodapé vivo.
- B — Mover o `onStatus` do core para depois do `confirm`: violaria a fronteira
  do core (ele passaria a saber de confirmação) e quebraria `provider-boundary`.
  Rejeitado; a máscara de status fica na CLI.
- C — Tornar `select` obrigatório em `InteractiveIO`: quebraria os fakes de
  teste e o modo batch. Rejeitado; `select` é opcional com fallback.

## Risks
- Risk: setas deixam de rolar durante a seleção.
  Mitigation: é intencional e escopado — o guard só vale enquanto `selection`
  está ativo; o scroll volta ao normal depois.
- Risk: geometria do rodapé variável quebra o layout.
  Mitigation: `footerRows(input)` centraliza o cálculo; viewport usa o mesmo
  valor; testado com um frame de seleção.
- Risk: terminais sem suporte a algumas sequências.
  Mitigation: só SGR + `moveTo`/`CLEAR_TO_LINE_END` já usados; sem truecolor
  obrigatório.
- Risk: Promise de seleção vaza se a tela fechar no meio.
  Mitigation: `stop()`/`cancel()` resolvem a seleção pendente com `undefined`.
