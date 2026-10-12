# Proposal — context-window-limits

## Why
Duas falhas silenciosas no caminho mais usado do KODA, as duas por falta de dados por modelo no catálogo.

**1. A conversa é cortada por contagem de mensagens, não por tamanho.**
`src/cli/tui/session/session.ts` tem `MAX_HISTORY_MESSAGES = 40` e `trimHistory` guarda apenas as 40 últimas mensagens. Nada no KODA conhece o limite de contexto de nenhum modelo: o `ProviderSpec` não tem esse campo.

Numa sessão de código, 40 mensagens com saídas de `readFile` e `searchFiles` passam facilmente de 200 mil tokens. O resultado é um erro do provedor no meio do trabalho, com a conversa perdida. No sentido oposto, 40 mensagens curtas descartam contexto ainda útil sem necessidade.

**2. O Claude trunca a resposta em 4096 tokens.**
O `CodeAgent` nunca passa `maxTokens`. O adapter usa `spec.defaultMaxTokens`, que só existe para o Anthropic, com valor 4096. Então o Claude para no meio de um arquivo grande enquanto OpenAI e Gemini usam o padrão do fornecedor. O 4096 veio da exigência da API da Anthropic de sempre receber `max_tokens`, não de uma decisão de produto.

Nos dois casos o usuário não recebe aviso: no primeiro vira um erro genérico do provedor, no segundo a resposta simplesmente acaba.

## What
- Dar ao catálogo os limites de cada modelo: `contextTokens` (entrada) e `maxOutputTokens` (saída), com um padrão por provedor e override por modelo.
- Estimar tokens das mensagens e compactar o histórico por esse orçamento, não por contagem de mensagens. O corte continua começando num turno de usuário, para não deixar resposta de ferramenta órfã.
- Avisar na TUI quando a compactação descartar turnos, para o usuário saber que o contexto encurtou.
- Passar `maxOutputTokens` do catálogo em toda requisição, para os quatro provedores, acabando com a assimetria.
- Expor o uso do orçamento na sessão, para o cabeçalho poder mostrar quanto do contexto está ocupado.

## Scope
- In scope:
  - `src/providers/catalog/`: campos novos no `ProviderSpec` e uma tabela de limites por modelo;
  - `src/providers/adapters/ai-sdk/provider.ts`: enviar `maxOutputTokens` resolvido pelo catálogo;
  - `src/cli/tui/session/session.ts`: compactação por orçamento de tokens;
  - uma função de estimativa de tokens em `src/providers/` (sem dependência nova);
  - testes: compactação por orçamento, limite de saída por provedor na suíte de wire, e estimativa de tokens.
- Out of scope:
  - sumarização por modelo do histórico descartado (só corte, como hoje);
  - Models.dev e atualização dos nomes de modelo e preços, que ficam para `catalog-refresh`;
  - cache de prompt;
  - reasoning e timeouts;
  - contagem exata de tokens com tokenizador por fornecedor.

## Success criteria
Uma sessão longa deixa de falhar por exceder o contexto: o histórico enviado cabe no orçamento do modelo escolhido, e o usuário é avisado quando turnos são descartados. O Claude deixa de truncar em 4096 e os quatro provedores recebem um limite de saída explícito vindo do catálogo.
