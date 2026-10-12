# Proposal — persistent-conversation-context

## Suposição de escopo (confirmar)
A dúvida original foi: "o terminal está perdendo a janela de contexto, como
manter o contexto se a pessoa faz Ctrl+L". Esta proposta assume a interpretação
**B**: o usuário quer que a conversa com o modelo **persista entre turnos**
(memória real), e que o Ctrl+L limpe apenas o transcript visível **sem** apagar
essa memória. Se a intenção for apenas mudar o comportamento visual do Ctrl+L
(interpretação A), esta proposta é grande demais e deve ser reduzida.

## Why
Hoje o KODA não tem histórico de conversa entre turnos. Em `src/core/agent.ts`,
`runDetailed` recria o array `messages` do zero a cada envio:

```
const messages: ChatMessage[] = [
  { role: "system", content: this.systemPrompt },
  { role: "user", content: prompt },
];
```

Cada `❯` começa sem memória dos turnos anteriores. O Ctrl+L (tecla `clear` no
`Screen`) só esvazia o `TextBuffer` visível; ele nunca tocou em "contexto do
modelo" porque esse contexto não existe. Resultado: o usuário percebe perda de
contexto, mas a causa real é a ausência de histórico, não o Ctrl+L.

## What
Introduzir um histórico de conversa mantido na camada interativa (`Session`) e
passá-lo ao agente a cada turno, acumulando as mensagens de usuário, assistente
e tool entre turnos. O Ctrl+L passa a ser explicitamente "limpar a tela, manter
a conversa". Será adicionado um comando `/clear` (e/ou `/reset`) para, quando o
usuário realmente quiser, descartar o histórico do modelo de forma intencional.
Um limite de janela (por número de mensagens/pares de turno) evita crescimento
ilimitado, preservando sempre o system prompt.

## Scope
- In scope:
  - `runDetailed` aceita um histórico prévio e devolve as mensagens do turno
    (ou um transcript atualizado), mantendo o método `run` e a assinatura atual
    por compatibilidade.
  - `Session` guarda o histórico de conversa acumulado e o fornece a cada turno.
  - Ctrl+L limpa só o transcript visível e **não** afeta o histórico do modelo.
  - Novo built-in `/clear` (e alias `/reset`) para descartar o histórico de
    forma intencional, reexibindo o header.
  - Limite de janela de histórico (contagem de mensagens) com o system prompt
    sempre preservado.
  - Testes cobrindo persistência entre turnos, Ctrl+L preservando memória,
    `/clear` descartando memória, e truncamento da janela.
- Out of scope:
  - Persistência em disco entre execuções do processo (só memória da sessão).
  - Compactação/sumarização por tokens (apenas corte por contagem de mensagens).
  - Mudança nas regras de segurança de tools.
  - Mudança no comportamento de providers além de receber mais mensagens.
