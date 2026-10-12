# interactive-confirm-selector

## Purpose
Oferecer um seletor de confirmação interativo por teclado para a escrita de arquivos e a aprovação de shell, com um status de espera enquanto a decisão está pendente, mantendo o core neutro em relação a provedores e um fallback por linha onde a seleção não está disponível.

## Requirements

### Requirement: Modo de seleção por teclado no terminal {#keyboard-selection-mode}
O terminal interativo DEVE oferecer um modo de seleção que apresenta um título, opções em formato radio e uma dica, navegável pelas setas e confirmado com Enter, resolvendo o índice escolhido ou um cancelamento com Ctrl+C, sem rolar o conteúdo enquanto a seleção está ativa.
> verify: `npm test`

#### Scenario:
- WHEN um modo de seleção é aberto e o usuário move com as setas e pressiona Enter
- THEN o índice da opção destacada é resolvido

#### Scenario:
- WHEN o usuário pressiona Ctrl+C durante a seleção
- THEN a seleção é cancelada e resolvida como ausência de escolha

#### Scenario:
- WHEN as setas para cima e para baixo são usadas durante a seleção
- THEN a opção destacada muda em vez de rolar o transcript

### Requirement: Seletor na confirmação de escrita e shell {#write-confirmation-selector}
O sistema DEVE apresentar a confirmação de escrita de arquivo e a aprovação de comando de shell como uma seleção Allow ou Reject, após o preâmbulo (diff ou comando), tratando a escolha Reject e o cancelamento como negação, e DEVE recorrer a uma confirmação por linha quando o modo de seleção não estiver disponível.
> verify: `npm test`

#### Scenario:
- WHEN a confirmação de escrita é exibida com o modo de seleção disponível
- THEN um seletor Allow/Reject é mostrado após o diff e a escolha governa a escrita

#### Scenario:
- WHEN Reject é escolhido ou a seleção é cancelada
- THEN o arquivo não é gravado

#### Scenario:
- WHEN o modo de seleção não está disponível
- THEN a confirmação recorre ao prompt por linha com o mesmo resultado booleano

### Requirement: Status de espera durante a confirmação {#waiting-decision-status}
O sistema DEVE exibir um status de espera enquanto a confirmação está pendente, em vez do status da ferramenta, e restaurar o fluxo normal após a decisão, sem que o núcleo neutro em relação a provedores participe da confirmação.
> verify: `npm test`

#### Scenario:
- WHEN uma confirmação de escrita está aguardando a decisão do usuário
- THEN o status exibido indica espera pela decisão e não "Writing..."

#### Scenario:
- WHEN a decisão é tomada
- THEN o status de espera é limpo e o fluxo prossegue normalmente
