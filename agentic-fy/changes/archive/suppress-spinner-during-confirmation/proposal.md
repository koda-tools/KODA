# Proposal — suppress-spinner-during-confirmation

## Why
A mudança anterior (`interactive-confirm-selector`) setava
`io.setStatus("Waiting for decision...")` no `decide`, mas o status continua
mostrando "Writing..." enquanto o seletor Allow/Reject está aberto. A causa raiz
(confirmada no código) é uma corrida entre o spinner e o status:

1. O core (`agent.runToolCalls`) chama `onStatus("Writing...")` ANTES de
   `tools.execute()`.
2. Em `turn.ts`, isso chama `spinner.start("Writing...")`, que inicia um
   `setInterval` de 80ms (`spinner.ts`) reescrevendo `io.setStatus("⠹ Writing...")`
   repetidamente.
3. Dentro de `tools.execute()`, o `decide` chama `io.setStatus("Waiting...")`
   UMA vez.
4. O `setInterval` do spinner, que nunca foi parado, sobrescreve "Waiting..."
   com "Writing..." no tick seguinte (≤80ms).

Ou seja, setar o texto uma vez não basta: o spinner precisa parar (ou ser
ignorado) enquanto a decisão está pendente.

## What
Introduzir uma trava de status: enquanto a confirmação está pendente, o status
exibido fica fixado em "Waiting for decision..." e as atualizações do spinner
são ignoradas; ao decidir, a trava é liberada e o fluxo volta ao normal. A trava
é controlada pela camada CLI (`decide`) via o `InteractiveIO`, sem o core saber
de confirmação e sem o `decide` precisar de referência direta ao spinner.

## Scope
- In scope:
  - Trava de status no `Screen` (fixar um texto e ignorar `setStatus`
    concorrentes do spinner enquanto travado).
  - Expor a trava no `InteractiveIO` (ex.: `holdStatus(text)` + `releaseStatus()`),
    opcional, com fallback seguro quando ausente.
  - `decide` usa a trava em vez de um `setStatus` único.
  - Testes: com o spinner ativo ("Writing..."), ao abrir a confirmação o status
    mostra "Waiting for decision..." e permanece assim apesar dos ticks do
    spinner; ao decidir, a trava é liberada.
- Out of scope:
  - Mudar o core (`agent.ts`) ou a ordem do `onStatus`.
  - Mudar a assinatura de `WritePolicy.confirm`.
  - Qualquer mudança no seletor em si (já implementado).
  - Novas dependências.
