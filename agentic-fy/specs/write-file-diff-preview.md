# write-file-diff-preview

## Purpose
Mostrar, antes da confirmação de writeFile, um diff entre o conteúdo anterior e o novo quando o alvo é um arquivo existente, mantendo a renderização numerada e colorida para arquivos novos, sem relaxar nenhuma regra de segurança.

## Requirements

### Requirement: Leitura segura do conteúdo anterior {#previous-content-read}
O sistema DEVE ler o conteúdo anterior de um alvo de writeFile somente após resolveSafeWritePath, devolvendo before indefinido para arquivo novo e nunca lendo caminhos bloqueados.
> verify: `npm test`

#### Scenario:
- WHEN o alvo é um arquivo existente, legível, UTF-8 e dentro do limite de bytes
- THEN o conteúdo anterior é devolvido como before string para o cálculo do diff

#### Scenario:
- WHEN o alvo não existe
- THEN before é indefinido e o arquivo é tratado como novo

#### Scenario:
- WHEN o alvo é binário, ilegível ou acima do limite de bytes
- THEN nenhum diff é gerado, um aviso curto é exibido e o fluxo de confirmação segue normal

#### Scenario:
- WHEN o alvo é .env, .git, um caminho com traversal ou um symlink para fora do root
- THEN continua bloqueado e nunca é lido para o diff

### Requirement: Módulo puro de diff com truncamento {#pure-file-diff}
O sistema DEVE calcular, por função pura a partir de filePath, before e after, hunks com linhas add, remove e context contendo números de linha antigo e novo e as contagens added e removed, usando contexto de 3 linhas e truncando diffs acima de 200 linhas.
> verify: `npm test`

#### Scenario:
- WHEN before é indefinido
- THEN o resultado indica arquivo novo sem hunks de remoção

#### Scenario:
- WHEN before e after são iguais
- THEN não há linhas add nem remove e as contagens são zero

#### Scenario:
- WHEN linhas são alteradas, adicionadas ou removidas
- THEN cada linha recebe o tipo e os números de linha antigo e novo corretos e as contagens batem

#### Scenario:
- WHEN o diff tem múltiplos trechos separados
- THEN múltiplos hunks são produzidos

#### Scenario:
- WHEN o diff excede 200 linhas renderizadas
- THEN é truncado com uma linha "... N linhas omitidas"

### Requirement: Diff exibido antes da confirmação {#diff-before-confirmation}
O sistema DEVE renderizar o diff do arquivo existente no conteúdo central imediatamente antes do prompt "Write file '...'? [y/N]", e negar a escrita quando não há política de aprovação.
> verify: `npm test`

#### Scenario:
- WHEN o modelo edita um arquivo existente com writeFile
- THEN o diff é exibido antes do prompt de confirmação

#### Scenario:
- WHEN o alvo é um arquivo novo
- THEN nenhum diff é gerado e o arquivo é marcado como "new file"

#### Scenario:
- WHEN o usuário nega a confirmação
- THEN o arquivo não é gravado nem alterado

#### Scenario:
- WHEN nenhuma política de aprovação está configurada
- THEN a escrita é negada como no comportamento atual

### Requirement: Renderização do diff no TUI {#diff-rendering}
O sistema DEVE renderizar o diff com cabeçalho de resumo "path +a -b", margem com números de linha antigo e novo, fundos esmaecidos verde e vermelho com prefixos "+", "-" e espaço, realce de sintaxe do Shiki por extensão quando a linguagem é conhecida, usando apenas o canal writeStyled com cada linha sanitizada, e fallback em texto puro fora do Screen.
> verify: `npm test`

#### Scenario:
- WHEN a linguagem do arquivo é conhecida pela extensão
- THEN o realce do Shiki é aplicado por cima das cores de diff

#### Scenario:
- WHEN a linguagem é desconhecida
- THEN apenas as cores de diff são usadas

#### Scenario:
- WHEN o conteúdo do modelo contém sequências de escape ANSI
- THEN o conteúdo é sanitizado e os escapes não chegam ao terminal

#### Scenario:
- WHEN não há canal writeStyled disponível
- THEN o diff é impresso em texto puro com prefixos "+", "-" e espaço

### Requirement: Resumo após a escrita {#post-write-summary}
O sistema DEVE, após gravar um arquivo existente, mostrar apenas um resumo "Updated path +a -b" sem reimprimir o arquivo inteiro, mantendo para arquivo novo a exibição numerada e colorida atual.
> verify: `npm test`

#### Scenario:
- WHEN um arquivo existente é gravado com sucesso
- THEN um resumo "Updated path +a -b" é exibido sem o conteúdo completo

#### Scenario:
- WHEN um arquivo novo é gravado com sucesso
- THEN o arquivo é exibido numerado e colorido como hoje
