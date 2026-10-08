# Proposal — multi-session-sidebar

## Why
Hoje o KODA roda com exatamente uma `Session`: um único histórico, um único
model/usage e um único buffer de transcript. Quem trabalha em várias frentes
(ex.: um backend, um refactor e os testes) precisa descartar o contexto com
`/clear` ou abrir outro terminal. Não há como manter conversas paralelas,
alternar entre elas, nem ver de relance o custo/tokens de cada uma.

O objetivo é permitir várias sessões vivas ao mesmo tempo, com um layout de
sidebar que lista as sessões e mostra o estado da sessão atual
(model, provider, tokens, custo), e navegação por teclado para alternar e
criar sessões.

## What
- Introduzir um `SessionManager` que mantém várias sessões, cada uma com seu
  próprio histórico, usage, model selecionado e buffer de transcript, com uma
  sessão ativa por vez.
- Novo layout do TUI: uma coluna lateral à esquerda (sidebar) com a lista de
  sessões e o bloco "CURRENT" (model/provider/tokens/custo), e a área de chat
  à direita (header enxuto + transcript + prompt). Rodapé com as dicas de
  atalho.
- Navegação por teclado:
  - `Ctrl+N` cria uma nova sessão e a torna ativa.
  - `Ctrl+B` alterna a visibilidade da sidebar.
  - Abrir um modal seletor de sessão (reusa o `ChoiceList` atual) para trocar
    de sessão com ↑/↓/Enter.
- Trocar de sessão troca o transcript e o header exibidos; o custo/tokens
  mostrados passam a refletir a sessão ativa.

## Decisões a confirmar (defaults assumidos)
Estes defaults estão implementados na proposta; ajuste aqui se quiser mudar.
- **Modelo de concorrência: uma sessão ativa por vez (Opção A).** As sessões
  guardam estado próprio, mas apenas a ativa processa um prompt de cada vez.
  Execução realmente concorrente (duas sessões gerando ao mesmo tempo) fica
  **fora de escopo** desta change.
- **Atalho de troca:** `Tab` abre o modal seletor **somente quando o prompt
  está vazio** (senão `Tab` continua inserindo no prompt). Motivo: `Ctrl+Tab`
  não é capturável de forma confiável na maioria dos terminais.
- **Sidebar inicia aberta.**

## Scope
- In scope:
  - `SessionManager` com múltiplas sessões, troca e criação.
  - Transcript e header por sessão (buffer isolado por sessão).
  - Sidebar com lista de sessões + bloco "CURRENT".
  - Modal seletor de sessão (reuso do `ChoiceList`).
  - Keybinds `Ctrl+N`, `Ctrl+B` e `Tab` (prompt vazio) para troca.
  - Atualização do rodapé de dicas de atalho.
- Out of scope:
  - Execução concorrente de prompts em sessões diferentes.
  - Persistência das sessões em disco entre execuções do CLI.
  - Renomear sessão / fechar sessão por UI (pode vir depois).
  - Mudanças no motor do agente, providers ou ferramentas.
