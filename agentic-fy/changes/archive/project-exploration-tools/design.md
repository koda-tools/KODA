# Design — project-exploration-tools

## Context
- TypeScript estrito, `exactOptionalPropertyTypes`, ESM com imports `.js`.
- `resolveSafeExistingPath` em `src/utils/security.ts` já faz a sanitização de path, blindagem contra symlinks e nega acesso a arquivos sensíveis. As tools novas usam o mesmo helper.
- O `ToolRegistry` implementa `ToolExecutor` do core: cada tool nova entra como `ToolDefinition` + parser de args + chamada da função.
- As tools de hoje já têm `STATUS_LABELS` em `src/tools/registry.ts`. Os rótulos novos entram no mesmo mapa.
- A TUI mostra o `ToolCall` com `name`, `args` e `result`, então nenhum ajuste é necessário além dos rótulos.

## Novos helpers

### `src/utils/gitignore.ts`
Parser mínimo. Aceita:
- comentários (`#`);
- linhas em branco;
- padrões relativos ao arquivo que o declara;
- negação com `!`;
- barra inicial (`/foo` só casa na raiz do arquivo);
- barra final (`foo/` só casa diretórios);
- `*`, `?`, `[...]` e `**` traduzidos para regex;
- cadeia de ignores (um por diretório descendente).

API:

```ts
interface IgnoreRule { readonly matcher: RegExp; readonly negated: boolean; readonly dirOnly: boolean }
interface IgnoreMatcher {
  isIgnored(relativePath: string, isDirectory: boolean): boolean;
}
loadIgnores(workspaceRoot: string, directory: string): Promise<IgnoreMatcher>
```

`loadIgnores` percorre do workspace até o diretório pedido, lendo cada `.gitignore` e empilhando as regras. Precedência: regra mais específica (mais perto do arquivo testado) vence; `!` cancela ignores anteriores.

Limitações documentadas: não suporta `.git/info/exclude` nem `core.excludesFile` global. Suficiente para o roadmap.

### `src/utils/binary.ts`
```ts
isLikelyBinary(buffer: Buffer): boolean
```
Olha os primeiros 8 KB: presença de byte `0x00`, ou mais de 30% de bytes fora da faixa UTF-8 imprimível.

## Tools

Cada tool fica em `src/tools/file-system/<tool>.tool.ts`, com assinatura `(args, options) => Promise<Result>`. Elas não lançam exceções para o LLM; o `ToolRegistry` já converte erro em `ToolObservation` com `ok: false`.

### `listDirectory`
```ts
interface ListDirectoryArgs {
  readonly path?: string;        // padrão: raiz do workspace
  readonly depth?: number;       // padrão: 2
  readonly limit?: number;       // padrão: 200
  readonly includeHidden?: boolean;  // padrão: false
}

interface ListDirectoryOptions {
  readonly workspaceRoot: string;
  readonly maxDepth?: number;
  readonly maxEntries?: number;
  readonly signal?: AbortSignal;
}

interface ListDirectoryEntry {
  readonly path: string;         // relativo ao workspace
  readonly kind: "file" | "directory";
  readonly size?: number;        // só para arquivos
  readonly truncated?: boolean;  // só no último entry quando atingiu limite
}

listDirectoryTool(args, options): Promise<string>
```
- Percorre com `readdir({ withFileTypes: true })`.
- Pula pastas sensíveis (reaproveita a lista de `security.ts` via helper exportado).
- Pula pastas de build por padrão: `node_modules`, `dist`, `build`, `.next`, `coverage`, `.turbo`, `.cache`.
- Respeita o `IgnoreMatcher` carregado uma vez para a raiz do walk.
- Formata o resultado como texto em árvore ASCII (determinístico), tipo:
  ```
  src/
    cli/
      index.ts
    core/
    tools/
  package.json
  …more entries truncated (limit 200)
  ```

### `searchFiles`
```ts
interface SearchFilesArgs {
  readonly query: string;
  readonly path?: string;
  readonly regex?: boolean;      // padrão: false
  readonly caseSensitive?: boolean;  // padrão: false
  readonly include?: string;     // glob simples: "**/*.ts"
  readonly exclude?: string;     // glob simples
  readonly maxFiles?: number;    // padrão: 100
  readonly maxMatches?: number;  // padrão: 200
  readonly perFileMatches?: number; // padrão: 20
}

interface SearchMatch {
  readonly path: string;
  readonly line: number;
  readonly column: number;
  readonly text: string;         // linha, truncada em 200 cols
}

searchFilesTool(args, options): Promise<string>
```
- Varre o diretório como `listDirectory`, respeitando ignore.
- `isLikelyBinary` pula arquivos que não parecem texto; `maxFileBytes` do registry corta arquivos grandes.
- Lê o arquivo inteiro (texto UTF-8), aplica regex ou busca textual, respeitando `caseSensitive`.
- Resultado formatado:
  ```
  src/cli/index.ts:42:5  export function runCliInteractive(…)
  src/core/agent/agent.ts:17:3  export class CodeAgent {
  …more matches (showed 100 of 243, scanned 1200 files)
  ```
- Glob simples: `**` casa qualquer coisa, `*` casa dentro de um segmento, `?` casa um char. Nada de alternativas (`{a,b}`) nessa change.

### `getFileInfo`
```ts
interface GetFileInfoArgs { readonly path: string }

interface FileInfo {
  readonly path: string;
  readonly kind: "file" | "directory" | "symlink" | "other";
  readonly size: number;
  readonly modifiedAt: string;    // ISO
  readonly contentKind?: "text" | "binary";  // só para arquivos
}

getFileInfoTool(args, options): Promise<string>
```
Formato texto curto para o LLM:
```
Path:      src/cli/index.ts
Kind:      file
Size:      3421 bytes
Modified:  2026-10-01T12:34:56.789Z
Content:   text
```

### `readFile` com faixa de linhas
```ts
interface ReadFileArgs {
  readonly filePath: string;
  readonly startLine?: number;
  readonly endLine?: number;
}
```
- Sem os campos: comportamento atual.
- Com os campos: lê o arquivo inteiro, divide por `\n`, pega `[startLine, endLine]` (1-indexado, inclusivo), e devolve as linhas como texto, com um cabeçalho:
  ```
  src/cli/index.ts (lines 10–30 of 180)
  ...
  ```
- Validações:
  - ambos ≥ 1;
  - `endLine ≥ startLine`;
  - `endLine ≤ linhas` (clampa para o último);
  - sem o campo correspondente, cada um tem default (`startLine = 1`, `endLine = total`).

## `ToolRegistry`

Adicionar `LIST_DIRECTORY_DEFINITION`, `SEARCH_FILES_DEFINITION`, `GET_FILE_INFO_DEFINITION`, parsers e rótulos. O `execute` ganha um `switch` por nome, para evitar a cadeia de `if`.

`ToolRegistryOptions` recebe opcionalmente:
```ts
readonly listDirectory?: { maxDepth?: number; maxEntries?: number };
readonly searchFiles?: { maxFiles?: number; maxMatches?: number; perFileMatches?: number };
```

## Cancelamento
Cada tool aceita `signal?: AbortSignal` no `options`. O `ToolRegistry` passa o signal da requisição em curso. A varredura verifica `signal.aborted` entre arquivos e entre linhas lidas de um arquivo, e lança `ToolError("Cancelled by user.")`. O core já converte em observação `ok: false`.

## Testes
- `test/gitignore.test.ts`: comentários, negação, `**`, `/raiz`, `dir/`, hierarquia aninhada.
- `test/binary.test.ts`: NUL byte, imagem PNG embutida, texto puro, UTF-8 com acentos.
- `test/list-directory.test.ts`: profundidade, limite, pastas sensíveis, respeito ao `.gitignore`, symlinks apontando para fora do workspace.
- `test/search-files.test.ts`: texto, regex, case, include/exclude, limites, binários pulados, cancelamento.
- `test/get-file-info.test.ts`: arquivo, diretório, missing, binário.
- `test/read-file-range.test.ts`: faixa válida, invertida, estourada, sem campos.
- `test/registry.test.ts`: nomes, rótulos, erros de args.

## Alternatives considered
- **Pacote `ignore`.** Rejeitado para não adicionar dependência. O parser próprio cobre o uso comum e dá para trocar depois.
- **`ripgrep`:** rejeitado por ora. Dependência de binário externo e cuidado extra com segurança. Entra em change futura, atrás da feature `command-execution`.
- **Walker reutilizável único:** o `listDirectory` e o `searchFiles` compartilham o walker interno em `src/tools/file-system/walker.ts` para evitar duplicar a lógica de ignore, símbolos e cancelamento.

## Risks
- **Parser de `.gitignore`:** cobertura parcial. Mitigação: testes explícitos dos padrões aceitos e um comentário na documentação dizendo o que não é suportado.
- **Repositórios enormes:** varredura em JS é O(n). Mitigação: limites conservadores por padrão, cancelamento e corte por tamanho de arquivo.
- **Links simbólicos:** o `resolveSafeExistingPath` já cuida, mas o walker precisa ignorar entradas que apontem para fora. Mitigação: usar `withFileTypes` + `realpath` quando entrar em um symlink, e descartar quando `isContained` falhar.
