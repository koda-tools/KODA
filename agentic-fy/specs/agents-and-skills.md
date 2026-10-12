# agents-and-skills

## Purpose
Agents e skills no formato do OpenCode (lidos de .koda com prioridade e de .opencode), com permissões allow/ask/deny, subagentes com sessão filha e provider por agente, sem relaxar aprovação nem sandbox.

## Requirements

### Requirement: Descoberta e validação de agents {#agent-discovery}
O sistema DEVE carregar agents de agents/<nome>.md e da chave agent em koda.jsonc/opencode.jsonc, em .koda (prioridade), .opencode e nos diretórios globais, aplicando os campos do OpenCode, personalizando os embutidos build, plan, general e explore, e reportando arquivos inválidos como diagnóstico sem interromper o CLI.
> verify: `node --test --import tsx test/agents-catalog.test.ts`

#### Scenario:
- WHEN existe .koda/agents/review.md e .opencode/agents/review.md
- THEN vale o de .koda

#### Scenario:
- WHEN um arquivo personaliza o embutido plan
- THEN os campos do arquivo sobrepõem os do embutido

#### Scenario:
- WHEN um agent tem frontmatter inválido
- THEN ele é ignorado e um diagnóstico é exibido

### Requirement: Descoberta de skills e ferramenta skill {#skill-discovery}
O sistema DEVE descobrir skills em skills/<nome>/SKILL.md (.koda, .opencode, .claude, .agents, do diretório atual até a raiz do git e globais), validar name e description como o OpenCode, listá-las na descrição da ferramenta skill e entregar o conteúdo sob demanda.
> verify: `node --test --import tsx test/agents-catalog.test.ts`

#### Scenario:
- WHEN o name não bate com a pasta ou viola o padrão
- THEN a skill é ignorada com diagnóstico

#### Scenario:
- WHEN o modelo chama skill com um nome permitido
- THEN recebe o corpo da skill e o diretório base

### Requirement: Permissões allow, ask e deny {#agent-permissions}
O sistema DEVE aplicar permissões por ferramenta e por padrão glob, escondendo e bloqueando deny, pedindo aprovação em ask e liberando allow, mantendo escrita e comandos em ask por padrão e sem permitir que um subagente exceda as permissões do agente pai.
> verify: `node --test --import tsx test/agent-permissions.test.ts`

#### Scenario:
- WHEN o agente tem edit deny
- THEN writeFile não é oferecido e uma chamada direta é recusada

#### Scenario:
- WHEN o agente tem bash com "*" ask e "git status*" allow
- THEN git status roda sem perguntar e os demais pedem aprovação

#### Scenario:
- WHEN o pai tem edit deny e o subagente edit allow
- THEN a escrita é recusada

### Requirement: Agents primários na sessão {#primary-agents}
O sistema DEVE manter um agente primário por sessão, alternável com Alt+A e Alt+Shift+A e por /agent, exibido na sidebar, listado em /agents e usado pelos comandos que declaram agent, com o seletor de sessões em Alt+S.
> verify: `node --test --import tsx test/agents-session.test.ts test/keyboard.test.ts`

#### Scenario:
- WHEN o usuário aperta Alt+A
- THEN o próximo agente primário se torna o agente da sessão

#### Scenario:
- WHEN o usuário aperta Tab
- THEN o agente da sessão não muda, porque Tab completa comandos no prompt

#### Scenario:
- WHEN o usuário aperta Alt+S
- THEN o seletor de sessões abre

### Requirement: Delegação a subagentes {#subagent-delegation}
O sistema DEVE permitir delegar a subagentes pela ferramenta task, por @nome e por comandos com subagent true, executando o filho com seu prompt, permissões, steps e tempo limite, sem a ferramenta task (profundidade 1), em uma sessão filha, propagando cancelamento e somando o uso na sessão pai.
> verify: `node --test --import tsx test/subagents.test.ts`

#### Scenario:
- WHEN o agente chama task com explore
- THEN o resultado do filho volta como observação da ferramenta

#### Scenario:
- WHEN a sessão é cancelada durante a delegação
- THEN o filho é interrompido

#### Scenario:
- WHEN o filho tenta chamar task
- THEN a ferramenta não existe para ele

### Requirement: Provider por agente e limite de passos {#agent-provider-and-steps}
O sistema DEVE executar cada agente com o provider e modelo do seu campo model, mesmo diferente do provider da sessão, e ao atingir steps DEVE pedir um resumo final sem ferramentas em vez de falhar.
> verify: `node --test --import tsx test/subagents.test.ts test/agent.test.ts`

#### Scenario:
- WHEN o agente declara model anthropic/x e a sessão usa openai
- THEN a execução usa o provider anthropic

#### Scenario:
- WHEN o agente atinge steps
- THEN responde com um resumo sem chamar ferramentas
