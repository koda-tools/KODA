# Proposal — command-execution

## Why
O KODA já lê, procura e escreve arquivos, mas não executa nada. Sem isso ele não compila, não roda teste, não roda lint e não usa git, então não consegue verificar o próprio trabalho. É a lacuna que separa um assistente que escreve texto de um agente que trabalha, e é pré-requisito da validação automática do roadmap.

Existe execução de shell hoje, mas só dentro de comandos customizados (`expandShellBlocks` em `src/cli/commands/shell.ts`), e ela não serve como tool:
- usa `promisify(execFile)`, que espera o processo terminar e **deixa processo filho órfão** no timeout, porque não mata a árvore;
- `maxBuffer` **mata o processo com erro** quando a saída estoura, em vez de truncar e seguir;
- pergunta para **todo** comando, o que é inviável quando o agente roda `npm test` várias vezes por tarefa;
- não separa stdout de stderr nem devolve exit code.

## What
Uma tool `runCommand` com:

- **`spawn`** em vez de `execFile`, com stdout e stderr separados, exit code e duração.
- **Encerramento de árvore em dois estágios:** `SIGTERM`, espera curta, depois `SIGKILL`; no Windows, `taskkill /T /F`. Vale para timeout e para cancelamento via `AbortSignal`.
- **Classificação de risco em três níveis**, aplicada antes de executar:
  - **deny absoluto** (não pergunta, recusa): `sudo`/`doas`, `rm -rf` em caminho absoluto ou `~`, download com pipe para shell, `git push --force`, `npm publish`, escrita em `~/.ssh`, redirecionamento para fora do workspace. Sem opção de aprovar, porque a aprovação acontece no meio de uma tarefa, com a atenção no problema e não no comando.
  - **confirm**: padrão para todo o resto, pela lista Autorizar/Rejeitar que já existe.
  - **allow**: lista configurável, **vazia por padrão**. Pré-aprovar `npm test` de fábrica seria decidir pelo usuário o que é seguro no projeto dele.
- **Truncagem com as duas pontas preservadas:** 8 KB por stream, 2 KB do início e 6 KB do fim, com aviso do que foi omitido. O começo traz o cabeçalho, o fim traz o erro; o meio de um log de teste é o que menos importa.
- **`cwd` em subdiretório do workspace**, validado pelo sandbox. Sem isso o agente passa a escrever `cd packages/api && npm test`, o que joga o caminho para dentro da string e tira o controle de nós.
- **Env em allowlist, sem segredo.** Além de `PATH`, `HOME` e `USERPROFILE`, passam `NODE_ENV`, `LANG`, `LC_ALL`, `TZ`, `TEMP`/`TMP`, `SystemRoot`/`ComSpec`/`PATHEXT` e as de proxy. Nada que case com `*_API_KEY`, `*_TOKEN`, `*_SECRET` ou `*_PASSWORD` passa, mesmo se pedido.
- **O comando é registrado no transcript antes de executar**, não depois, para o usuário ver o que foi disparado se o processo travar.

## Scope
- In scope:
  - `src/tools/command/run-command.tool.ts`, `risk.ts` (classificação), `process.ts` (spawn e encerramento de árvore), `output.ts` (truncagem), `types.ts`;
  - `CommandPolicy` em `src/tools/registry.ts`, com definição, parser e rótulo `Running...`;
  - fiação em `src/cli/index.ts` reaproveitando o `decide()` que a escrita de arquivo já usa;
  - testes de risco, truncagem, timeout, cancelamento, árvore de processos e sandbox do `cwd`.
- Out of scope:
  - **streaming da saída na TUI** enquanto o comando roda (change seguinte: é melhoria de percepção e mexe no transcript e no widget de tool-call);
  - validação automática disparando build e teste sozinha (feature própria do roadmap, depende desta);
  - comando interativo que pede input (stdin fica fechado);
  - processo de longa duração em background, como dev server.

## Decisions assumidas
1. **Shell, sim** (`cmd /d /s /c`, `sh -c`). O agente precisa de `&&` e pipe; sem isso ele contorna com três chamadas, o que é pior. O controle real é a classificação de risco mais a aprovação, não a ausência de shell.
2. **Deny é absoluto**, sem opção de confirmar.
3. **Allowlist vazia por padrão**, preenchida pelo usuário.
4. **Timeout padrão de 120 s**, configurável por chamada e com teto no registry.
5. **stdin fechado**, para comando interativo falhar rápido em vez de pendurar a sessão.
