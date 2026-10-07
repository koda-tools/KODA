# Design — write-file-diff-preview

## Context
- TypeScript estrito (`exactOptionalPropertyTypes`), Node ESM `NodeNext`, testes
  com `node --test --import tsx`, Prettier, sem ESLint.
- Baseline: 73 testes passando, 1 pulado (symlink no Windows).
- Fluxo atual do write:
  - `ToolRegistry.execute` parseia os args e chama `writePolicy.confirm(filePath, content)`.
  - `createWritePolicy` (em `src/cli/index.ts`) pergunta via `screen.question`.
  - Só após aprovação, `writeFileTool` grava (UTF-8, cria diretórios, limite de bytes).
  - Em `turn.ts`, `onToolResult` chama `renderFile` para reimprimir o arquivo inteiro.
- Segurança: `resolveSafeWritePath` bloqueia absolutos, traversal, symlink para
  fora do root, nomes/diretórios sensíveis (`.env`, `.git`, `.ssh`, ...). A leitura
  do conteúdo anterior precisa reusar esse mesmo caminho resolvido, sem exceções.
- Canal estilizado do TUI: `writeStyled` só aceita SGR; `sanitize` remove todo o
  resto. O conteúdo vindo do modelo precisa passar por `sanitize` antes de entrar
  no diff para evitar injeção de sequências de escape.

## Architecture

### 1. Dependência
- `npm install --save-exact diff@9.0.0`. Nenhuma outra dependência.
- Importar apenas `structuredPatch` de `diff`, contexto de 3 linhas.

### 2. Leitura do conteúdo anterior (`src/tools/file-system/write-file.tool.ts`)
- Nova função exportada `readPreviousContent(workspaceRoot, filePath, maxBytes)`
  que:
  - resolve com `resolveSafeWritePath` (mesma regra de segurança do write);
  - se o alvo não existe → retorna `undefined` (arquivo novo);
  - se existe e é legível, dentro do limite de bytes e UTF-8 válido → retorna o texto;
  - binário / ilegível / acima do limite → retorna um sentinel que o chamador trata
    como "sem diff" (modelado como `{ before: undefined, note?: string }`).
- Para distinguir "arquivo novo" de "existe mas sem diff", a função devolve um
  objeto `PreviousContent = { before: string | undefined; skipped?: "binary" | "too-large" | "unreadable" }`.
  Arquivo novo: `{ before: undefined }` sem `skipped`.
- Detecção de binário: presença de byte NUL no buffer lido (heurística simples,
  sem dependência nova). Mensagens de erro não expõem conteúdo nem caminho absoluto.

### 3. Módulo de diff (`src/utils/diff.ts`)
- Tipos:
  - `DiffLineKind = "add" | "remove" | "context"`.
  - `DiffLine = { kind, oldLine?: number, newLine?: number, text: string }`.
  - `DiffHunk = { lines: DiffLine[] }`.
  - `FileDiff = { filePath: string; added: number; removed: number; hunks: DiffHunk[]; truncated: boolean }`.
- Função pura `computeFileDiff({ filePath, before, after })`:
  - usa `structuredPatch("a", "b", before, after, "", "", { context: 3 })`;
  - mapeia cada hunk/linha para `DiffLine` com números antigo/novo corretos;
  - acumula `added`/`removed`;
  - trunca o total de linhas renderizadas em `MAX_DIFF_LINES = 200`, anexando uma
    linha de contexto sintética `... N linhas omitidas`.
- Nenhuma função acima de 60 linhas; helpers pequenos para mapear hunk e truncar.

### 4. Confirmação com diff
- `WritePolicy.confirm` passa a receber `{ filePath, before, after }`
  (`WriteConfirmation`). `ToolRegistry.execute`:
  - parseia args;
  - chama `readPreviousContent` **antes** da confirmação;
  - monta `{ filePath, before, after: content }` e chama `confirm`;
  - mantém negação quando não há `writePolicy` (comportamento atual).
- `createWritePolicy` em `src/cli/index.ts`:
  - recebe o `writer`/`io` para imprimir o diff antes do prompt;
  - se `before === undefined` → marca `new file` (não imprime diff aqui; o render
    pós-escrita continua mostrando o arquivo numerado);
  - se `skipped` → imprime aviso curto (`Diff unavailable (binary file)`), segue
    para o prompt normal;
  - caso contrário, calcula `computeFileDiff` e renderiza o diff, depois pergunta
    `Write file '...'? [y/N]`.

### 5. Renderização no TUI (`src/cli/tui/output.ts` + helper de diff)
- Novo `renderDiff(writer, fileDiff, { highlighter, animate })`:
  - cabeçalho `{filePath}  +{added} -{removed}` (dim).
  - cada `DiffLine`: margem com `oldLine`/`newLine` (dim), prefixo `+`/`-`/espaço,
    fundo verde esmaecido (add) / vermelho esmaecido (remove) / sem fundo (context).
  - realce Shiki por cima quando a linguagem (pela extensão) é conhecida,
    reusando `createLazyHighlighter`/`resolveLanguage`; linguagem desconhecida → só
    cores de diff.
  - cada linha de conteúdo passa por `sanitize` antes de compor o SGR.
  - usa só `writer.writeSegment` com segmentos `code` (ansi + plain). Fora do Screen
    (`io.writeStyled === undefined`), o `plain` traz prefixos `+`/`-`/espaço em texto puro.
- Backgrounds via SGR truecolor (`48;2;r;g;b`), com fallback: se o terminal não
  tem truecolor o fundo pode não aparecer, mas prefixos `+`/`-` garantem leitura.

### 6. Depois da escrita (`src/cli/tui/turn.ts`)
- `onToolResult` para `writeFile` ok:
  - arquivo novo → `renderFile` atual (numerado/colorido).
  - arquivo existente → imprime só `Updated {filePath} +{added} -{removed}`.
- Para saber se era novo ou existente no `turn`, o resumo vem do `content` da
  observação ou de um sufixo estruturado devolvido por `writeFileTool`
  (ex.: `Wrote N bytes to path.` já indica sucesso; o turn recalcula o diff a
  partir de `before` capturado? Não — `before` não cruza o boundary do registry).
  Decisão: `writeFileTool` passa a aceitar `previousContent` e devolver um resumo
  `+a -r` no texto de retorno, que `turn.ts` detecta para escolher resumo vs render.

## Alternatives considered
- Option A — Calcular o diff dentro do `writeFileTool` e devolver pronto: acopla
  rendering à ferramenta e vaza responsabilidade de UI para o core de tools.
  Rejeitado; o diff puro fica em `src/utils/diff.ts` e o render no TUI.
- Option B — Reusar `createPatch` (texto unificado) em vez de `structuredPatch`:
  exigiria reparsear o texto para numerar linhas e colorir; `structuredPatch` já
  entrega hunks estruturados. Escolhido `structuredPatch`.

## Risks
- Risk: terminais sem truecolor não mostram os fundos esmaecidos.
  Mitigation: prefixos `+`/`-`/espaço e margem numérica tornam o diff legível sem cor.
- Risk: injeção de ANSI pelo conteúdo do modelo.
  Mitigation: `sanitize` em cada linha antes de compor SGR; canal `writeStyled` só aceita SGR.
- Risk: ler o conteúdo anterior poderia abrir brecha de segurança.
  Mitigation: leitura só após `resolveSafeWritePath`; caminhos bloqueados nunca são lidos.
- Risk: diffs enormes poluem a tela.
  Mitigation: truncamento em 200 linhas com `... N linhas omitidas`.
