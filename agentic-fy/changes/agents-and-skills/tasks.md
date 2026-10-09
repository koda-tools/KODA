# Tasks — agents-and-skills

Cada tarefa mantém `tsc --noEmit` e `npm test` passando.

- [x] 1. Core: `signal` em `ToolExecutor.execute` e no laço; `temperature` e `onStepLimit: "summarize"` em `CodeAgentOptions`; testes no `agent.test.ts`.
- [x] 2. Providers: `configFromEnvironment(env, provider?)` para montar um provider específico.
- [x] 3. `src/agents/`: tipos, frontmatter, parsers de agent e skill, embutidos, descoberta (`loadCatalog`) com precedência e diagnósticos.
- [x] 4. Permissões: resolução por chave e glob, camadas pai/filho, padrões seguros.
- [x] 5. Toolset: gate allow/ask/deny sobre o `ToolRegistry`, ferramentas `skill` e `task`, prompt do agente.
- [x] 6. `AgentRuntime`: providers por nome, `prepare`, `prepareSubagent` (profundidade 1, steps, timeout, permissões combinadas).
- [x] 7. Comandos: built-ins `/agents`, `/agent`, `/skills`; rota de prompt com `agent` e `subagent`.
- [x] 8. TUI: agente por sessão, sidebar, Tab/Shift+Tab, Alt+S, `@nome`, sessão filha com saída em segundo plano, uso somado no pai.
- [x] 9. CLI: montar o `AgentRuntime` (interativo e batch) e exibir diagnósticos.
- [x] 10. Testes novos (`agents-catalog`, `agent-permissions`, `subagents`, `agents-session`), ajustes de `keyboard`/`commands`, prettier, tsc e suíte completa.
