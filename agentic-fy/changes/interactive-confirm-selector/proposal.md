# Proposal — interactive-confirm-selector

## Why
Dois problemas no fluxo de confirmação de escrita (e de shell):

1. Layout fraco. Hoje o prompt é uma linha de texto:
   `Write file 'src/core/agent.ts'? [y/N]`, respondida digitando `y`/`n` + Enter.
   O usuário quer um seletor visual por setas:

   ```
   Write  src/core/agent.ts

   ◉ Allow
   ○ Reject

   ←↑↓→ select · enter confirm
   ```

2. Status errado. O status "Writing..." aparece **antes** de o usuário decidir.
   A causa (confirmada no código): em `src/core/agent.ts` `runToolCalls` emite
   `onStatus("Writing...")` antes de `tools.execute(...)`, e é dentro de
   `tools.execute` que `writePolicy.confirm` mostra o diff e pergunta. Então o
   spinner já diz "Writing..." enquanto o usuário ainda está decidindo. Deveria
   dizer algo como "Waiting for decision..." (ou nenhum status) enquanto o
   seletor está aberto.

## What
- Adicionar um modo de seleção interativo por teclado ao `Screen` (um método
  `select` opcional em `InteractiveIO`), com um radio de duas opções
  (`Allow`/`Reject`), navegável por setas (←↑↓→) e confirmado com Enter;
  Ctrl+C cancela como rejeição.
- Usar esse seletor na confirmação de escrita e na aprovação de shell no
  `src/cli/index.ts`, com cabeçalho `Write  <path>` (ou `Run shell  <source>`),
  as opções e a linha de dica `←↑↓→ select · enter confirm`.
- Manter um fallback para o `question` por linha quando `io.select` não existir
  (modo batch, testes com fakes antigos).
- Corrigir o status: enquanto o prompt de confirmação está aberto, exibir
  "Waiting for decision..." em vez de "Writing...", restaurando o fluxo normal
  depois. A correção fica inteiramente na camada CLI (wrapper de
  `createWritePolicy`/`approve`), sem o core aprender sobre confirmação.

## Scope
- In scope:
  - `InteractiveIO.select?` e implementação no `Screen` (novo modo modal).
  - Interceptar setas enquanto o seletor está ativo (hoje ←↑↓→ fazem scroll).
  - Renderização do bloco do seletor (opções + dica) e eco da escolha ao confirmar.
  - Uso do seletor na confirmação de escrita e na aprovação de shell, com fallback para `question`.
  - Status "Waiting for decision..." em volta do prompt, no wrapper CLI.
  - Testes: navegação por setas resolve Allow/Reject, Ctrl+C rejeita, fallback por linha, e o status de espera durante a confirmação.
- Out of scope:
  - Mudar a assinatura de `WritePolicy.confirm` (`{filePath, before, after, skipped?}`), que permanece.
  - Seletores com mais de duas opções ou menus genéricos.
  - Qualquer mudança no core (`src/core/agent.ts`) além da que já existe; o core continua neutro.
  - Novas dependências (setas, SGR e status já existem).
