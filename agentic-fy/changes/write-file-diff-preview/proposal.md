# Proposal — write-file-diff-preview

## Why
Hoje, quando o modelo edita um arquivo existente com `writeFile`, o TUI pede
`Write file '...'? [y/N]` sem mostrar o que muda, e depois reimprime o arquivo
inteiro numerado e colorido. O usuário aprova às cegas e perde a noção do
impacto da edição. Para um agente de código, ver o diff antes de confirmar é a
diferença entre uma aprovação informada e uma aposta.

## What
Quando `writeFile` tem como alvo um arquivo existente, o `ToolRegistry` lê o
conteúdo anterior (depois de `resolveSafeWritePath`, sem relaxar segurança) e
calcula um diff com `structuredPatch` (jsdiff, contexto de 3 linhas). O diff é
renderizado no conteúdo central do TUI, com cabeçalho de resumo
(`src/app.ts  +3 -1`), margem com números de linha antigo/novo, fundos
esmaecidos verde/vermelho e realce de sintaxe do Shiki por cima, logo ANTES do
prompt de confirmação. Arquivo novo continua numerado e colorido, marcado como
`new file`. Depois da escrita, arquivo existente mostra só um resumo
(`Updated src/app.ts +3 -1`) em vez do arquivo inteiro.

## Scope
- In scope:
  - Dependência `diff@9.0.0` com `--save-exact`.
  - Leitura segura do conteúdo anterior no `ToolRegistry`, com `before: string | undefined`.
  - Módulo puro de diff (`src/utils/diff.ts`) com hunks, contagens e truncamento em 200 linhas.
  - Mudar `WritePolicy.confirm` para receber `{ filePath, before, after }`.
  - Renderização do diff no TUI (canal `writeStyled`, sanitização) e fallback texto puro fora do Screen.
  - Resumo pós-escrita para arquivos existentes.
  - Testes unitários do diff e testes de fluxo (confirmação, binário/limite, ANSI, caminhos bloqueados).
- Out of scope:
  - Comando `/undo`.
  - Qualquer novo pacote além de `diff`.
  - Mudança nas regras de segurança de `readFile`/`writeFile`.
  - Edição parcial/patch aplicado pelo modelo (continua sobrescrita total do conteúdo).
