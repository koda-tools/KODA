# suppress-spinner-during-confirmation

## Purpose
Garantir que, enquanto uma confirmação está pendente, o status exibido permaneça "Waiting for decision..." e não seja sobrescrito pelas atualizações contínuas do spinner da ferramenta, sem o núcleo neutro em relação a provedores participar da confirmação.

## Requirements

### Requirement: Trava de status durante a confirmação {#status-hold-during-confirmation}
O terminal interativo DEVE permitir fixar um status enquanto uma confirmação está pendente, ignorando as atualizações concorrentes do spinner, e liberar a trava ao concluir, restaurando o fluxo normal do status.
> verify: `npm test`

#### Scenario:
- WHEN um status é fixado e o spinner tenta atualizar o status em seguida
- THEN o status exibido permanece o texto fixado e a atualização do spinner é ignorada

#### Scenario:
- WHEN a trava de status é liberada
- THEN as atualizações de status voltam a ter efeito

### Requirement: Status de espera estável com o spinner ativo {#stable-waiting-status-with-spinner}
O sistema DEVE exibir "Waiting for decision..." de forma estável enquanto a confirmação de escrita está pendente, mesmo com o spinner da ferramenta ativo emitindo "Writing...", liberando o status ao concluir a decisão.
> verify: `npm test`

#### Scenario:
- WHEN o spinner está ativo com "Writing..." e uma confirmação de escrita é aberta
- THEN o status passa a "Waiting for decision..." e permanece assim apesar dos ticks do spinner

#### Scenario:
- WHEN a decisão é tomada
- THEN a trava é liberada e o status volta ao fluxo normal
