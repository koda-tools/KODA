# Design — multi-session-sidebar

## Context
A arquitetura atual tem três camadas (confirmado por leitura do código):

- **Application** (`src/cli/tui/application/application.ts`): o loop
  interativo `while (!exitRequested) { io.question("❯ ") ... }` e um único
  `Session` em `Dependencies.session`.
- **Session** (`src/cli/tui/session/`): `Session` guarda `model`, `usage`,
  `history` e o `AbortController`; `renderHeader` monta o bloco de header.
- **Runtime** (`src/cli/tui/runtime/`): `TermUIRuntime` implementa
  `InteractiveIO`, é dono dos widgets `@termuijs`, do `store` observável
  (`ConversationState { header, status, transcript }`), do layout
  (`layout.ts` → `app(...).rows(...)`) e do teclado (`keyboard.ts`).

Pontos que fixam o "single-session" hoje:
- O `store.transcript` é um único buffer de texto.
- O `store.header` é um único bloco de texto.
- O layout é um stack vertical único; não há coluna/sidebar. O único padrão
  de coluna é `Transcript.createRow()` (`Box({ flexDirection: "row" })`).
- Modais já existem via `ChoiceList` (`choice-list.ts`) e são reusados por
  `showModelPicker`/`select`.

Restrições:
- Sem execução concorrente nesta change (Opção A). Um prompt por vez.
- Reusar widgets `@termuijs` já presentes na versão 0.1.7 (`Box`, `List`,
  `logView`, `text`). Nenhuma dependência nova.
- Manter o canal `InteractiveIO` como a fronteira entre Session e Runtime.
- Funções curtas (padrão do projeto, < ~60 linhas) e sem relaxar segurança.

## Architecture

### SessionManager (novo: `src/cli/tui/session/session-manager.ts`)
Mantém a lista de sessões e o índice ativo. Cada entrada:

```
interface ManagedSession {
  readonly id: string;         // estável, ex. "s1"
  title: string;               // "API Backend", "Session 2"...
  readonly session: Session;   // estado do agente (model/usage/history/abort)
  transcript: string[];        // buffer de output isolado desta sessão
}
```

API (nomes provisórios):
- `active(): ManagedSession`
- `list(): readonly ManagedSession[]`
- `activeIndex(): number`
- `create(title?): ManagedSession` — cria, torna ativa, retorna.
- `switchTo(index): ManagedSession | undefined`
- `remove(index)` (fora de escopo de UI, mas útil internamente/testes)

O `SessionManager` recebe uma fábrica de `Session` (para injetar
`identity`/`io`/`writer`) e não conhece widgets.

### Transcript e header por sessão
O `store` continua com UM `transcript` e UM `header` (o "visível"). Ao trocar
de sessão, o runtime:
1. Salva o `store.transcript` atual no buffer da sessão que está saindo.
2. Carrega o buffer da sessão que entra em `store.transcript`.
3. Pede à sessão que entra para re-renderizar o header
   (`session.showHeader()`).

Para isso o `TermUIRuntime` ganha um ponteiro para o `SessionManager` (ou
callbacks) e um método `showSession(index)`. O write de output já passa pelo
`store.transcript`; a troca é só swap de buffers.

### Sidebar (novo: `src/cli/tui/runtime/session-sidebar.ts`)
Um `Box` em coluna, largura fixa (ex. 28 cols, `flexGrow:0, flexShrink:0`),
`border: "single"`. Conteúdo via `logView(() => ...)` lendo do store:
- Logo KODA (reaproveitando a arte do header atual).
- Seção "SESSIONS": uma linha por sessão com marcador
  (`●` ativa, `○`/`◌` inativas) + título; linha "+ New session".
- Seção "CURRENT": `Model`, `Provider`, `Tokens`, `Cost` da sessão ativa,
  reusando `estimateCost` e os helpers `formatTokens`/`formatCost` de
  `header.ts` (extraídos para reuso).

A sidebar lê um novo campo do store (ver abaixo), não dos widgets.

### Estado do store
`ConversationState` passa a incluir o resumo das sessões para a sidebar, sem
duplicar o transcript de cada uma (que vive no `SessionManager`):

```
interface SessionSummary {
  id: string; title: string; active: boolean;
  model: string; provider: string;
  tokens: number; cost: number | undefined;
}
interface ConversationState {
  header: string;
  status: string | undefined;
  transcript: readonly string[];
  sessions: readonly SessionSummary[];  // novo
  sidebarVisible: boolean;              // novo
}
```

O runtime recomputa `sessions` sempre que algo muda (troca, novo prompt
concluído, troca de model). A sidebar re-renderiza por `logView`.

### Layout (`layout.ts`)
Novo arranjo em duas colunas dentro de um `Box({ flexDirection: "row" })`:

```
row(
  sidebar            // largura fixa; some quando sidebarVisible = false
  column(            // área de chat (Box flexDirection: "column", flexGrow:1)
    headerCompact    // 1 linha: título da sessão + "model · provider"
    transcript.row   // output + scrollbar (como hoje)
    toolSlot
    diffPanel
    choices          // modais (inclui o seletor de sessão)
    spinner
    suggestions
    prompt
  )
)
footerHints          // "Ctrl+N New · Tab Switch · Ctrl+B Sidebar · ..."
```

O header grande (logo + stats) migra para a sidebar; a área de chat ganha um
header compacto de 1 linha. Isso bate com o mock.

### Modal seletor de sessão
Novo `io.showSessionPicker(request)` no `InteractiveIO`/`TermUIRuntime`,
modelado em `showModelPicker`: monta labels `● título` / `  título` + uma
entrada "+ New session", chama `choices.open(...)`, resolve com a ação
(trocar para índice N, ou criar nova).

### Teclado (`keyboard.ts` + `KeyboardTargets` + wiring no runtime)
Novas ações no `KeyboardTargets`: `newSession()`, `openSessionPicker()`,
`toggleSidebar()`. No `createKeyHandler`, antes do `else` final:
- `Ctrl+N` → `newSession()`
- `Ctrl+B` → `toggleSidebar()`
- `Tab` **com prompt vazio** (`prompt.isEmpty`/`take()==""`) →
  `openSessionPicker()`; caso contrário cai no `prompt.handleKey` (tab normal).
Enquanto um modal (`choices.isOpen`) está aberto, os atalhos de sessão não
disparam (early-return já existente).

### Loop (`application.ts`)
`runSession` passa a operar sobre `manager.active().session` a cada volta do
`while`. A criação inicial cria a sessão 1 no manager. `Ctrl+N` e a troca são
acionados pelo runtime (via callbacks), que também atualizam o `store`.
O `io.onCancel` continua: 1º Esc aborta o request da sessão ativa, 2º sai.

## Alternatives considered
- **Opção A — uma sessão ativa por vez (ESCOLHIDA):** estado por sessão,
  troca por swap de buffer; o motor assíncrono não muda. Baixo risco, entrega
  o mock. 
- **Opção B — execução concorrente:** cada sessão com seu próprio loop/turno
  em paralelo, UI multiplexando streaming simultâneo. Exige reescrever o loop,
  o gerenciamento de abort e a sincronização de foco/entrada. Alto risco e
  esforço; adiada (fora de escopo).
- **Sidebar como widget que lê direto do SessionManager** (sem passar pelo
  store): descartado para manter o padrão atual de "estado observável no
  store, widgets reagem", evitando acoplar widget ↔ manager.

## Risks
- **`Tab` ambíguo (inserir vs. trocar):** mitigado por só abrir o modal com
  prompt vazio; documentado no rodapé. `Ctrl+Tab` evitado por não ser
  capturável no terminal.
- **Troca de buffer perder/duplicar linhas:** mitigado concentrando o swap num
  único método `showSession` com teste cobrindo salvar→trocar→voltar.
- **Altura do layout estourar em terminais pequenos** (header + sidebar +
  modais): a sidebar some com `Ctrl+B`; o header foi reduzido a 1 linha na
  área de chat; validar com terminal estreito.
- **Regressão no single-session:** o caminho sem runtime (testes/SDK, `io`
  direto) deve continuar funcionando com uma sessão; `SessionManager` começa
  com uma sessão, preservando o comportamento atual.
