# Design — suppress-spinner-during-confirmation

## Context
- `spinner.ts` `createSpinner`: `start(label)` roda `setInterval` (80ms) que
  chama `io.setStatus(\`${frame} ${label}\`)`; `stop()` limpa o interval e chama
  `io.setStatus(undefined)`.
- `turn.ts` `onStatus(label)`: `undefined → spinner.stop()`, senão
  `spinner.start(label)`. O core emite `"Writing..."` antes de `tools.execute`.
- `tools.execute` (writeFile) chama `writePolicy.confirm`, que na CLI chama
  `decide(io, ...)` (`src/cli/tui/decision.ts`). O `decide` só tem o
  `InteractiveIO`; não alcança o `spinner` (criado em `application.runInteractive`).
- `screen.ts` `setStatus(text)`: grava `this.status` e `schedule()` → render no
  separador. É o ponto por onde tanto o spinner quanto o `decide` passam.

## Architecture

### 1. Trava de status no Screen (`screen.ts`)
- Novo estado `private statusHold: string | undefined`.
- `holdStatus(text: string)`: seta `statusHold = text`, `this.status = text`,
  `schedule()`. Enquanto `statusHold !== undefined`, chamadas a `setStatus`
  (vindas do spinner) são ignoradas.
- `releaseStatus()`: `statusHold = undefined`; o próximo `setStatus` (ou
  `stop()`) do spinner volta a valer; `schedule()`.
- `setStatus(text)`: se `statusHold !== undefined`, retorna sem alterar (ignora
  o spinner); senão comporta-se como hoje.

### 2. Exposição no InteractiveIO (`io.ts` + `asIO`)
- `InteractiveIO` ganha opcionais
  `holdStatus?: (text: string) => void` e `releaseStatus?: () => void`.
- `Screen.asIO()` passa a expor ambos.

### 3. decide usa a trava (`decision.ts`)
- Em vez de `io.setStatus?.(WAITING_STATUS)` / `io.setStatus?.(undefined)`:
  - início: `if (io.holdStatus) io.holdStatus(WAITING_STATUS); else io.setStatus?.(WAITING_STATUS);`
  - `finally`: `if (io.releaseStatus) io.releaseStatus(); else io.setStatus?.(undefined);`
- Fallback preserva o comportamento onde não há trava (fakes/batch).

### 4. Efeito
- O spinner continua rodando (o core não é tocado), mas seus `setStatus`
  "Writing..." são no-op enquanto travado. O separador mostra
  "Waiting for decision..." de forma estável até a decisão. Ao liberar, o
  próximo tick do spinner (ou o `stop()` após a escrita) restaura o fluxo.

## Alternatives considered
- A — Parar o spinner no `decide`: o `decide` não tem referência ao spinner
  (vive em `application`), e passá-la cruzaria várias camadas até o `writePolicy`.
  A trava no canal de status é mais local e não vaza o spinner para a CLI de
  confirmação. Rejeitado.
- B — Mover `onStatus("Writing...")` para depois de `tools.execute` no core:
  faria o core saber de confirmação e quebraria `provider-boundary`. Rejeitado.
- C — Fazer o `setStatus("Waiting...")` do decide "pegajoso" por heurística de
  texto: frágil (dependeria de comparar strings). Rejeitado em favor de uma
  trava explícita.

## Risks
- Risk: a trava não é liberada (status preso em "Waiting...").
  Mitigation: `decide` libera no `finally`; `stop()` do Screen também limpa a
  trava para não vazar entre sessões.
- Risk: fakes de teste sem `holdStatus`.
  Mitigation: métodos opcionais com fallback para `setStatus`.
- Risk: regressão no status normal fora da confirmação.
  Mitigation: `setStatus` só é ignorado enquanto `statusHold` está ativo; teste
  cobre o antes/durante/depois.
