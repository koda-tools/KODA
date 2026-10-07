# Proposal — tui-structure-refactor

## Why

A TUI (`src/cli/tui`) cresceu durante a migração para TermUI e ficou difícil de manter:

- 23 arquivos soltos em uma pasta, sem separação entre domínio, renderização e runtime.
- Tipos misturados com implementação. `io.ts` concentra o contrato `InteractiveIO` e todos os tipos auxiliares.
- `termui.ts` tem 615 linhas e uma classe com responsabilidades demais: layout, teclado, scroll, lista de escolha, slot de tool call, diff, status e ciclo de vida.
- Código morto deixado pela migração:
  - renderer antigo `screen.ts` + `screen/`, com cerca de 750 linhas;
  - `decision.ts` duplicado em `cli/index.ts`;
  - `holdStatus`/`releaseStatus`, só usados pelo `decision.ts` morto;
  - `showApproval`/`ToolApproval`;
  - campo `ToolCallView.kind`;
  - campos `provider`/`model`/`usage` do store;
  - `sanitize` duplicado.
- Trechos verbosos, como `highlight.ts` com 305 linhas para o que cabe em ~100.

## What

Reorganizar **apenas `src/cli/tui`** em pastas por propósito. Cada pasta tem um `types.ts` com seus tipos e os arquivos de implementação. O que é compartilhado por dois ou mais módulos vai para `shared/`. O código morto é removido, e o código verboso é simplificado sem mudar comportamento.

Comportamento visível ao usuário e API pública do SDK (`src/index.ts`) não mudam.

## Scope

- In scope:
  - nova estrutura de pastas em `src/cli/tui` com `types.ts` por pasta e `shared/`;
  - barrel `src/cli/tui/index.ts` como única porta de entrada usada por `src/cli/index.ts` e `src/index.ts`;
  - dividir `termui.ts` em módulos menores (layout, teclado, transcript, lista de escolha, slot de tool);
  - unificar `decide`/`confirm` em um único módulo e removê-lo de `cli/index.ts`;
  - remover código morto listado acima e os testes que só exercitam o renderer antigo;
  - migrar os testes úteis (por exemplo `sanitizeStyled`) para os novos caminhos;
  - simplificar `highlight.ts` e outros trechos verbosos mantendo o comportamento;
  - teste de estrutura que garanta a convenção de pastas.
- Out of scope:
  - qualquer código fora de `src/cli/tui`, exceto ajustes de import em `src/cli/index.ts`, `src/index.ts` e `test/`;
  - mudanças de comportamento, layout ou atalhos da TUI;
  - novas funcionalidades (LSP, novos widgets etc.).
