# Tasks — add-providers

Plano incremental. A ordem abre o catálogo antes de preenchê-lo, para cada provedor novo já entrar como dado. Testes rodados pelo usuário; o agente só manteve verdes os de estrutura existentes.

- [x] 1. URLs base, variáveis de chave e modelo padrão de cada provedor confirmados contra a documentação / endpoints OpenAI-compatíveis conhecidos; registrados nas entradas do catálogo.
- [x] 2. `catalog/types.ts`: `ProviderName` passou a `string`, `BuiltInProvider` adicionado, `ProviderSpec` ganhou `label`, `local?`, `images?` e `imageMediaTypes?`.
- [x] 3. `catalog/catalog.ts`: `PROVIDERS` com `satisfies Readonly<Record<string, ProviderSpec>>`, `PROVIDER_NAMES = Object.keys(PROVIDERS)`, `isProviderName` por `value in PROVIDERS`, `providerSpec` lança em id desconhecido. As quatro entradas ganharam `label`; o ollama ganhou `local: true`.
- [x] 4. `config/types.ts`: `ProviderConfig` genérico; `RemoteProviderConfig`/`OllamaProviderConfig` removidos.
- [x] 5. `config/environment.ts`: `configFromEnvironment` guiado pelo spec, sem `if (provider === "ollama")`; `apiKey` obrigatório só quando `apiKeyRequired`.
- [x] 6. `factory/factory.ts`: despacho único por `providerFromConfig`; `FactoryMap`/`ConfigMap`/`createFor` removidos; `validateBaseURL` vale para qualquer provedor com `baseURL`.
- [x] 7. `adapters/ai-sdk/vendors.ts`: `providerFromConfig` despacha por `spec.sdk`, com `CatalogOpenAICompatibleProvider` genérico para entradas de catálogo; as quatro classes nomeadas seguem na API pública. `label`/`images`/`imageMediaTypes` vêm do spec.
- [x] 8. (Usuário) Suíte de wire sem mudar asserções dos quatro provedores atuais — prova de que a abertura não mudou comportamento.
- [x] 9. `test/factory.test.ts` reescrito para iterar `PROVIDER_NAMES`: cada provedor cria um `ILLMProvider` e reporta `streaming`; os que pedem chave falham com a variável declarada; locais não.
- [x] 10. `test/provider-registry.test.ts` novo: proíbe condicional por nome de provedor em `src/providers/{factory,config,catalog}` (exceto o próprio `catalog.ts`), e valida `isProviderName`/registro aberto.
- [x] 11. Entradas de catálogo acrescentadas: OpenRouter, Groq, Cerebras, Together, Fireworks, DeepInfra, Nebius, Baseten, DeepSeek, xAI, Mistral, Moonshot, Z.AI, NVIDIA (hospedados), LM Studio, vLLM, llama.cpp (locais).
- [x] 12. Groq acrescentado à tabela de `test/provider-wire.test.ts` via `providerFromConfig`, reusando leitores/respostas da OpenAI — um provedor de catálogo ponta a ponta sem classe própria.
- [x] 13. `test/connect-flow.test.ts`: contagem derivada de `CONNECTABLE_PROVIDERS`, mais um caso de que todo provedor com chave aparece e nenhum local aparece.
- [ ] 14. (Adiado) Filtro por digitação no `ChoiceList`. Removido do delta; vira mudança própria com teste de layout. Com ~15 provedores a lista é navegável, só não filtrável ainda.
- [x] 15. README, `docs/index.html` e CHANGELOG atualizados: provedores novos, variáveis de ambiente, e a nota de que `ProviderName` virou `string` (com `BuiltInProvider`).
- [ ] 16. (Usuário) `node ./node_modules/typescript/bin/tsc -p tsconfig.json --noEmit` (verde no agente), `prettier --check`, `node --test --import tsx "test/**/*.test.ts"` e `npm.cmd run build`.
- [ ] 17. (Usuário) Teste manual: `/connect`, conectar um provedor novo com chave real, rodar um turno com ferramenta e conferir a troca por `KODA_PROVIDER`.
