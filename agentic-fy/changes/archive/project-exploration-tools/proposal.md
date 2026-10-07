# Proposal — project-exploration-tools

## Why
Hoje `src/tools/file-system/` só tem `readFile` e `writeFile`. Para encontrar algo num projeto, o LLM precisa adivinhar o caminho exato de cada arquivo, e `readFile` carrega o arquivo inteiro no contexto. Isso limita bastante o uso real do KODA: tarefas de "entenda esse projeto" ou "procure onde X é usado" não dão para resolver.

## What
Adicionar quatro capacidades novas, no mesmo padrão das tools atuais, respeitando o sandbox e os limites de saída:

- **`listDirectory`:** lista uma pasta, com profundidade e limite de entradas. Respeita `.gitignore`, as pastas sensíveis já definidas em `security.ts` e as pastas comuns de build (`node_modules`, `dist`, `build`, `.next`, `coverage`, `.turbo`, `.cache`).
- **`searchFiles`:** procura texto ou regex em arquivos, com filtros de glob, limite de arquivos, de ocorrências totais e por arquivo, e corte de linha por tamanho. Pula arquivos binários.
- **`getFileInfo`:** devolve tipo, tamanho em bytes, última modificação e se o arquivo parece texto ou binário.
- **`readFile` com `startLine` e `endLine`:** 1-indexados e inclusivos. Sem os campos, continua lendo o arquivo inteiro, então a API fica retrocompatível.

Também:
- um parser mínimo de `.gitignore` em `src/utils/gitignore.ts`, suportando comentários, negação, `**`, barras no fim e os padrões mais comuns, sem depender de pacote externo;
- helper `isLikelyBinary(buffer)` em `src/utils/binary.ts`;
- rótulos novos em `STATUS_LABELS`: `"Listing..."`, `"Searching..."`, `"Inspecting..."`;
- limites padrão sobrescrevíveis via `ToolRegistryOptions`.

## Scope
- In scope:
  - `src/tools/file-system/{list-directory,search-files,get-file-info}.tool.ts`;
  - mudança em `src/tools/file-system/read-file.tool.ts` para aceitar faixa de linhas;
  - `src/utils/gitignore.ts` e `src/utils/binary.ts`;
  - novas definições e parsers em `src/tools/registry.ts`;
  - exports no `src/index.ts`;
  - testes unitários para cada tool, mais testes do parser de `.gitignore` e do `isLikelyBinary`.
- Out of scope:
  - integração com `ripgrep`;
  - cache de buscas (fica para a `context-engine`);
  - mudanças em providers, core ou TUI (as tools novas aparecem automaticamente pelo `ToolRegistry`);
  - watchers de arquivo.

## Decisions assumidas (ajuste se quiser outra coisa)
1. **Busca:** só em JavaScript, determinística e multiplataforma. `ripgrep` fica para change futura.
2. **`.gitignore`:** parser próprio pequeno, sem dependência externa.
3. **Cancelamento:** cada tool aceita `signal?: AbortSignal` e checa `signal.aborted` entre entradas.
4. **Faixa de linhas:** campos opcionais em `readFile`, 1-indexados.
5. **Limites padrão:**
   - `listDirectory`: profundidade 2, até 200 entradas.
   - `searchFiles`: até 100 arquivos varridos, 200 ocorrências totais, 20 por arquivo, 200 caracteres por linha.
   - `getFileInfo`: só metadados, sem limite relevante.
