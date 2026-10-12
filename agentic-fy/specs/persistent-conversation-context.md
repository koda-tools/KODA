# persistent-conversation-context

## Purpose
Manter o contexto da conversa entre turnos na sessão interativa, com Ctrl+L limpando apenas o transcript visível e um comando explícito para descartar o histórico, mantendo o core neutro em relação a provedores.

## Requirements

### Requirement: Histórico de entrada e saída no agente {#agent-history-io}
O sistema DEVE permitir que uma execução do agente receba um histórico opcional de mensagens anteriores e devolva as mensagens novas do turno (usuário, assistente e tool) na ordem, preservando o método run que retorna apenas a string final.
> verify: `npm test`

#### Scenario:
- WHEN um histórico de mensagens anteriores é fornecido a uma execução
- THEN essas mensagens são incluídas no pedido após o system prompt e antes do novo prompt do usuário

#### Scenario:
- WHEN um turno é concluído
- THEN o resultado expõe as mensagens novas do turno na ordem em que foram produzidas

#### Scenario:
- WHEN um chamador existente usa run sem histórico
- THEN ele recebe apenas a string final, com comportamento compatível

### Requirement: Memória de conversa na sessão {#session-conversation-memory}
A sessão interativa DEVE acumular o histórico de conversa entre turnos, fornecê-lo à execução seguinte e limitar o histórico a um número máximo de mensagens sem descartar o system prompt nem deixar mensagens de tool órfãs.
> verify: `npm test`

#### Scenario:
- WHEN dois prompts são enviados em sequência
- THEN o segundo turno recebe as mensagens do primeiro turno como histórico

#### Scenario:
- WHEN o histórico ultrapassa o limite máximo de mensagens
- THEN as mensagens mais antigas são descartadas em fronteira de turno, preservando o system prompt e sem deixar tool sem o assistant correspondente

### Requirement: Ctrl+L preserva o contexto da conversa {#clear-screen-preserves-context}
O sistema DEVE, ao receber Ctrl+L, limpar apenas o transcript visível mantendo o header e a entrada digitada, sem afetar o histórico de conversa usado pelo modelo.
> verify: `npm test`

#### Scenario:
- WHEN o usuário pressiona Ctrl+L
- THEN o transcript visível é limpo e o header e a entrada digitada são mantidos

#### Scenario:
- WHEN um novo prompt é enviado após Ctrl+L
- THEN o turno ainda recebe o histórico de conversa anterior

### Requirement: Comando para descartar o contexto {#clear-context-command}
O sistema DEVE oferecer um comando built-in para descartar intencionalmente o histórico de conversa, confirmar a ação ao usuário e reexibir o header, sem enviar um pedido ao modelo.
> verify: `npm test`

#### Scenario:
- WHEN o usuário executa /clear ou /reset
- THEN o histórico de conversa é descartado, uma confirmação é exibida e nenhum pedido é enviado ao modelo

#### Scenario:
- WHEN /help é exibido
- THEN o comando de descarte de contexto aparece na lista de built-ins

### Requirement: Memória de conversa na sessão {#session-conversation-memory}
A sessão interativa DEVE acumular o histórico de conversa entre turnos, fornecê-lo à execução seguinte e limitá-lo a um orçamento de tokens derivado do limite de contexto do modelo, sem descartar o system prompt nem deixar mensagens de tool órfãs.
> verify: `node --test --import tsx test/conversation-context.test.ts`

#### Scenario:
- WHEN dois prompts são enviados em sequência
- THEN o segundo turno recebe as mensagens do primeiro turno como histórico

#### Scenario:
- WHEN o histórico acumulado passa do orçamento de tokens do modelo
- THEN os turnos mais antigos são descartados até caber, e o histórico restante começa num turno de usuário, sem tool sem o assistant correspondente
