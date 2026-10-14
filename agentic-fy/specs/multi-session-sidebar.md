# multi-session-sidebar

## Purpose
Permitir várias sessões vivas no TUI do KODA, cada uma com histórico, model, usage e transcript próprios, com uma sessão ativa por vez; exibir uma sidebar com a lista de sessões e o estado da sessão atual (model, provider, tokens, custo); e navegar entre sessões por teclado, sem introduzir execução concorrente nem relaxar segurança.

## Requirements

### Requirement: Gerenciador de múltiplas sessões {#session-manager}
O sistema DEVE manter várias sessões simultaneamente por meio de um SessionManager, cada sessão com histórico, model selecionado, usage e buffer de transcript próprios, com exatamente uma sessão ativa por vez.
> verify: `npm test`

#### Scenario:
- WHEN o CLI inicia
- THEN existe uma sessão ativa e o comportamento é equivalente ao single-session atual

#### Scenario:
- WHEN uma nova sessão é criada
- THEN ela passa a ser a sessão ativa e as demais mantêm seu histórico, usage e transcript intactos

#### Scenario:
- WHEN a sessão ativa é trocada
- THEN o histórico, usage e model da sessão que sai não são alterados

### Requirement: Transcript isolado por sessão {#per-session-transcript}
O sistema DEVE isolar o buffer de transcript por sessão, exibindo no store apenas o transcript da sessão ativa e preservando o conteúdo das demais ao alternar.
> verify: `npm test`

#### Scenario:
- WHEN o usuário troca da sessão A para a B
- THEN o transcript visível passa a ser o da B e o da A é preservado sem perder nem duplicar linhas

#### Scenario:
- WHEN o usuário retorna à sessão A
- THEN o transcript exibido é exatamente o que a A tinha antes da troca

#### Scenario:
- WHEN um novo output é escrito
- THEN ele é anexado somente ao transcript da sessão ativa

### Requirement: Navegação e criação de sessão por teclado {#session-switch-navigation}
O sistema DEVE permitir criar uma nova sessão com Ctrl+N, alternar a visibilidade da sidebar com Ctrl+B e abrir um modal seletor de sessão (reusando o componente de lista existente) com Alt+S; o Alt+A fica reservado para alternar o agente primário (change agents-and-skills).
> verify: `cd packages/koda && node --conditions=development --test --import tsx test/keyboard.test.ts`

#### Scenario:
- WHEN o usuário pressiona Ctrl+N
- THEN uma nova sessão é criada e torna-se ativa

#### Scenario:
- WHEN o usuário pressiona Alt+S
- THEN o modal seletor de sessão é aberto para escolher a sessão com as setas e Enter

#### Scenario:
- WHEN o usuário pressiona Ctrl+S
- THEN o prompt é enviado e o modal não abre

#### Scenario:
- WHEN o usuário pressiona Ctrl+B
- THEN a sidebar alterna entre visível e oculta

#### Scenario:
- WHEN um modal já está aberto
- THEN os atalhos de sessão não disparam até o modal fechar

### Requirement: Sidebar de sessões e estado atual {#session-sidebar}
O sistema DEVE exibir, quando visível, uma sidebar com a lista de sessões marcando a ativa e um bloco "CURRENT" com model, provider, tokens e custo da sessão ativa, reutilizando o cálculo de custo e a formatação de tokens já existentes.
> verify: `npm test`

#### Scenario:
- WHEN a sidebar está visível
- THEN cada sessão aparece com um marcador distinto para a ativa e as inativas, além de uma entrada para nova sessão

#### Scenario:
- WHEN a sessão ativa acumula uso após um turno
- THEN o bloco "CURRENT" reflete os tokens e o custo atualizados da sessão ativa

#### Scenario:
- WHEN o usuário troca de sessão
- THEN o bloco "CURRENT" passa a mostrar model, provider, tokens e custo da nova sessão ativa

#### Scenario:
- WHEN a sidebar está oculta
- THEN a área de chat ocupa toda a largura e nenhuma coluna lateral é desenhada

### Requirement: Layout de duas colunas para o chat {#chat-layout-two-columns}
O sistema DEVE renderizar a área de chat (header compacto, transcript, prompt e modais) numa coluna à esquerda da sidebar, mantendo o scroll do transcript, os prompts de aprovação, o seletor de model e o fluxo de ferramentas funcionando como antes, e exibindo um rodapé com as dicas dos atalhos de sessão.
> verify: `npm test`

#### Scenario:
- WHEN o TUI é montado com a sidebar visível
- THEN a área de chat fica à esquerda e a sidebar à direita, com o rodapé mostrando Alt+A, Alt+S, Ctrl+N e Ctrl+B

#### Scenario:
- WHEN um prompt de aprovação ou o seletor de model é aberto
- THEN ele aparece na coluna de chat e funciona como no comportamento atual

#### Scenario:
- WHEN a sidebar é ocultada
- THEN a área de chat passa a ocupar toda a largura sem erro de layout
