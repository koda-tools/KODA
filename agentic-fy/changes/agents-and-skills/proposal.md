# Proposal — agents-and-skills

## Why
KODA tem um único agente com prompt fixo e as mesmas 6 ferramentas sempre.
Não há como definir agentes especializados, delegar trabalho a subagentes nem
reaproveitar instruções do projeto (skills). O OpenCode resolve isso com
arquivos Markdown versionados no repositório; queremos o mesmo modelo, para
que um projeto que já usa OpenCode funcione no KODA sem conversão.

## What
- **Agents no formato do OpenCode**: `agents/<nome>.md` com frontmatter
  (`description`, `mode`, `model`, `temperature`, `steps`, `permission`,
  `hidden`, `disable`, `color`, `tools` legado) e o corpo como prompt. Também
  a chave `agent` em `koda.jsonc`/`opencode.jsonc`.
- **Locais**: `.koda/` (prioridade), `.opencode/`, e os globais
  `~/.config/koda` e `~/.config/opencode`.
- **Embutidos**: `build` e `plan` (primários), `general` e `explore`
  (subagentes). Um arquivo com o mesmo nome personaliza o embutido.
- **Permissões** `allow` / `ask` / `deny` por ferramenta, com padrões glob para
  `bash`, `edit`, `task` e `skill`. Escrita continua `ask` por padrão.
- **Skills** em `skills/<nome>/SKILL.md` (`.koda`, `.opencode`, `.claude`,
  `.agents`, projeto subindo até a raiz do git, e globais), carregadas sob
  demanda pela ferramenta `skill`.
- **Subagentes** pela ferramenta `task`, por `@nome` na mensagem e por
  comandos com `subagent: true`. Cada delegação abre uma sessão filha.
- **Provider por agente**: `model: provider/modelo` pode usar outro provider.
- **Atalhos**: Tab / Shift+Tab alternam o agente primário; o seletor de
  sessões passa para Alt+S.

## Scope
- In scope: tudo acima, comandos `/agents`, `/agent <nome>`, `/skills`, agente
  ativo na sidebar, `steps` com resumo ao atingir o limite, cancelamento
  propagado às ferramentas e aos subagentes.
- Out of scope: `koda agent create` interativo, permissão global de topo no
  config, `external_directory`, agentes internos ocultos (título/resumo),
  execução de subagentes em paralelo, teto de custo durante a execução.
