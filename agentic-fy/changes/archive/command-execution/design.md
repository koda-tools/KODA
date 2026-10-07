# Design — command-execution

## Context
- TypeScript estrito, `exactOptionalPropertyTypes`, ESM com imports `.js`, Node ≥20.
- O `ToolRegistry` implementa `ToolExecutor` do core e já recebe `signal` como terceiro parâmetro opcional de `execute` (feito na `project-exploration-tools`).
- `decide(io, title, fallbackPrompt)` em `src/cli/tui/commands/decision.ts` já mostra Autorizar/Rejeitar pela `List` do TermUI, com fallback `[y/N]`. A escrita de arquivo usa o mesmo caminho via `WritePolicy`.
- `resolveSafeExistingPath` em `src/utils/security.ts` valida caminho dentro do workspace, com proteção de symlink.
- O `shell.ts` existente permanece para os blocos `` !`cmd` `` dos comandos customizados. Esta change não o altera; o código comum de spawn fica na pasta nova e o `shell.ts` pode migrar depois.

## Architecture

```
src/tools/command/
  types.ts            # RunCommandArgs, RunCommandOptions, CommandResult,
                      # RiskLevel, CommandPolicy, CommandDecision
  risk.ts             # classify(command): CommandDecision   (puro)
  environment.ts      # buildEnv(base, extra): allowlist, sem segredo  (puro)
  output.ts           # truncate(text, limits): corta no meio  (puro)
  process.ts          # spawnCommand(): spawn + árvore + timeout + signal
  run-command.tool.ts # orquestra: classifica, aprova, executa, formata
```

Tudo que é decisão (risco, env, truncagem) fica em função pura, testável sem processo. Só `process.ts` toca o sistema.

### Classificação (`risk.ts`)

```ts
type RiskLevel = "deny" | "confirm" | "allow";

interface CommandDecision {
  readonly level: RiskLevel;
  /** Motivo a mostrar ao usuário quando o nível é deny. */
  readonly reason?: string;
}

classify(command: string, allowlist: readonly string[]): CommandDecision
```

Ordem de avaliação: **deny primeiro**, depois allowlist, depois confirm. Deny vence a allowlist, então uma entrada permissiva não abre brecha.

Padrões de deny, cada um com motivo próprio:

| Padrão | Motivo |
|---|---|
| `sudo`, `doas`, `runas` | escalada de privilégio |
| `rm -rf /`, `rm -rf ~`, `rm -rf` com caminho absoluto | remoção fora do workspace |
| `curl`/`wget`/`iwr` com pipe para `sh`/`bash`/`iex` | execução de código remoto |
| `git push --force`, `--force-with-lease`, `push -f` | reescreve histórico remoto |
| `npm publish`, `yarn publish`, `pnpm publish` | publicação |
| escrita em `~/.ssh`, `~/.aws`, `/etc` | credencial e sistema |
| `>` ou `>>` para caminho absoluto ou `..` | escapa do workspace |
| `shutdown`, `reboot`, `mkfs`, `diskpart` | sistema |

A comparação é feita sobre o comando normalizado (minúsculas, espaços colapsados) e por segmento separado em `&&`, `||`, `;` e `|`, para que `npm test && sudo rm -rf /` caia em deny pelo segundo segmento.

A allowlist casa por prefixo de segmento, então `npm test` libera `npm test -- --watch=false`, mas não `npm test; rm -rf x`, porque o segundo segmento é avaliado à parte.

### Processo (`process.ts`)

```ts
interface SpawnOutcome {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly durationMs: number;
  readonly timedOut: boolean;
  readonly cancelled: boolean;
}
```

- `spawn(shell, args, { cwd, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32" })`.
- `detached` no POSIX cria um grupo de processo, para `kill(-pid)` derrubar os filhos. No Windows usamos `taskkill /pid <pid> /T /F`.
- Acumula stdout e stderr em buffers com **corte duro** (`hardLimit`, por volta de 1 MB por stream) para não estourar memória com saída infinita; a truncagem de apresentação é separada, em `output.ts`.
- Encerramento em dois estágios, usado por timeout e por `AbortSignal`:
  1. `SIGTERM` (ou `taskkill` sem `/F`);
  2. após `GRACE_MS` (2 s), `SIGKILL` (ou `taskkill /F`).
- Resolve sempre, nunca rejeita: a tool decide o que é falha. `timedOut` e `cancelled` vêm marcados.

### Saída (`output.ts`)

```ts
truncate(text: string, { budget, headRatio }): { readonly text: string; readonly omitted: number }
```

Com `budget` 8 KB e `headRatio` 0.25: 2 KB do início, 6 KB do fim, e no meio uma linha `[... N KB omitted ...]`. Corta em fronteira de linha quando possível, para não partir linha no meio.

### Formato devolvido ao LLM

```
$ npm test
exit 1 · 2.4s
--- stdout (42 KB, showing first 2 KB and last 6 KB) ---
...
[... 34 KB omitted ...]
...
--- stderr (1 KB) ---
...
```

Regras: stream vazio é omitido por completo; quando tudo cabe no orçamento, não há marcação de truncagem; timeout e cancelamento aparecem no lugar do `exit N` (`timed out after 120s`, `cancelled`).

A observação volta com `ok: false` quando o exit code é diferente de zero, para o agente tratar como falha acionável, mas **com a saída inteira** — o que importa é o conteúdo do erro, não só o status.

### Política (`registry.ts`)

```ts
interface CommandPolicy {
  /** Pergunta ao usuário; recebe o comando e o cwd já resolvido. */
  readonly confirm: (request: CommandConfirmation) => Promise<boolean>;
  readonly allowlist?: readonly string[];
  readonly timeoutMs?: number;
  readonly maxOutputBytes?: number;
  readonly environment?: Readonly<Record<string, string>>;
}
```

Sem `commandPolicy` configurada, a tool recusa com "no approval policy is configured", igual à escrita de arquivo hoje. Isso mantém o modo batch e o SDK seguros por omissão.

Definição exposta ao LLM: `command` (obrigatório), `cwd` (opcional, relativo), `timeoutMs` (opcional). Rótulo de status: `Running...`.

### Fiação na CLI

`src/cli/index.ts` ganha `createCommandPolicy(io)`, espelhando o `createWritePolicy` atual: escreve o comando no transcript e chama `decide()` com título "Run this command?". A lista Autorizar/Rejeitar aparece sozinha.

## Alternatives considered
- **`execFile` sem shell.** Mais seguro contra injeção, mas rejeita `npm test && npm run lint`, que o agente vai pedir. O comando é aprovado pelo usuário, então o shell não acrescenta risco relevante frente à classificação.
- **`maxBuffer` do `child_process`.** Mata o processo quando estoura; queremos truncar e seguir.
- **Perguntar sempre, sem allowlist.** É o que o `shell.ts` faz hoje; inviável para uma tool que o agente chama repetidas vezes.
- **Deny configurável pelo usuário.** Rejeitado: o valor do deny está em ser absoluto. Quem quer rodar `sudo` roda no terminal.
- **Streaming da saída na TUI.** Vale, mas é outra área (transcript, widget de tool-call) e não é pré-requisito. Fica para a change seguinte.

## Risks
- **Processo órfão.** É o risco principal. Mitigação: `detached` com grupo de processo no POSIX, `taskkill /T` no Windows, e teste que dispara um filho que sobrevive ao pai e confirma que ele morre.
- **Deny por regex com falso positivo.** Um comando legítimo pode cair em deny, por exemplo um caminho que contenha `sudo`. Mitigação: casar por segmento e por início de token, não por substring solta, e testar casos legítimos próximos (`sudoku`, `rm -rf node_modules` relativo, que deve ser confirm e não deny).
- **Deny por regex com falso negativo.** Nenhuma lista cobre tudo: `bash -c 'sudo ...'`, alias, variável de ambiente. Mitigação honesta: documentar que o deny é uma rede de segurança contra acidente, não contra um modelo adversário, e que a defesa principal é a confirmação do usuário.
- **Diferença de plataforma.** Shell, sinal e kill divergem entre Windows e POSIX. Mitigação: isolar em `process.ts` e marcar os testes dependentes de plataforma.
