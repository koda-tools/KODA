# Proposal — add-providers

## Why
O `/connect` lista **três** provedores: openai, anthropic e gemini. Nem os quatro do catálogo, muito menos os mais de 70 do ecossistema.

O caminho é direto e está todo no código:

1. `src/cli/connect/flow.ts:46` monta as opções com `CONNECTABLE_PROVIDERS`.
2. `src/providers/auth/store.ts:23` define `CONNECTABLE_PROVIDERS = PROVIDER_NAMES.filter(name => providerSpec(name).apiKeyRequired)`.
3. `src/providers/catalog/catalog.ts` tem `PROVIDER_NAMES = ["openai", "anthropic", "gemini", "ollama"]`, e o ollama tem `apiKeyRequired: false`.

Logo: 4 no catálogo, 3 no `/connect`. O ollama fica fora de propósito, porque é servidor local e não pede chave.

**A tabela `factories` com quatro entradas não está incompleta.** O `FactoryMap` é um tipo mapeado sobre `ProviderName`:

```ts
type FactoryMap = {
  readonly [P in ProviderName]: (config: ConfigMap[P]) => ILLMProvider;
};
```

O compilador **obriga** uma entrada por provedor. Quatro entradas é exatamente o completo para um `ProviderName` de quatro membros. O gargalo não é a factory: é o `ProviderName` ser uma união fechada de quatro literais em `catalog/types.ts`.

**Por que migrar para o AI SDK não trouxe os provedores.** Duas razões:

- Provedores novos estavam explicitamente fora do escopo daquela mudança.
- Mais importante: o AI SDK entrega o **transporte**, não o **catálogo**. Os "75+" do OpenCode vêm do Models.dev somado ao pacote compatível com OpenAI, não da contagem de pacotes `@ai-sdk/*`, que são cerca de 20.

A migração foi a base necessária: o `AiSdkProvider` já é guiado por `spec.sdk` e `baseURL`, então **um provedor compatível com OpenAI passa a ser só dado de catálogo, sem código novo**. É esse retorno que esta mudança coleta.

## What
- Abrir o `ProviderName` para além dos quatro literais, mantendo validação contra o catálogo.
- Trocar a tabela `factories` por despacho pelo `spec.sdk`, que é o que o `AiSdkProvider` já consome. Isso também remove o caso especial do ollama em `configFromEnvironment`.
- Preencher o catálogo com cerca de 20 provedores que falam a API compatível com OpenAI, **sem nenhuma dependência nova**: OpenRouter, Groq, DeepSeek, xAI, Mistral, Together, Fireworks, Cerebras, DeepInfra, Moonshot, Z.AI, NVIDIA, Nebius, Baseten, LM Studio, vLLM e llama.cpp, entre outros.
- Dar busca ao seletor do `/connect`, porque hoje a lista mostra 8 linhas por vez (`LAYOUT.choiceMaxRows`) e rolar 20 itens sem filtro é ruim.
- Tornar `test/factory.test.ts` guiado pelo catálogo, já que hoje ele exige um caso de teste escrito à mão por provedor.

## Scope
- In scope:
  - `src/providers/catalog/`: `ProviderName`, `PROVIDER_NAMES`, `PROVIDERS` e os dados dos provedores novos;
  - `src/providers/factory/factory.ts`: despacho por `sdk` em vez de uma função por provedor;
  - `src/providers/config/`: `ProviderConfig` genérico e `configFromEnvironment` guiado pelo spec, sem o `if (provider === "ollama")`;
  - `src/providers/adapters/ai-sdk/vendors.ts`: construção genérica a partir da entrada do catálogo, preservando as quatro classes nomeadas da API pública;
  - `src/cli/connect/flow.ts` e o seletor: filtro por digitação;
  - testes: `factory.test.ts` guiado pelo catálogo, `connect-flow.test.ts` com a lista maior, e um caso de wire para um provedor compatível novo.
- Out of scope:
  - **Models.dev**, que é o que levaria de ~20 para 70+. Fica para `catalog-refresh`;
  - provedores com autenticação diferente: Bedrock (SigV4 da AWS), Vertex (ADC do Google), Azure (resource name e Entra ID) e os de OAuth (Copilot, ChatGPT, GitLab Duo);
  - seção `provider` no `koda.json` para provedores definidos pelo usuário;
  - preços e limites dos modelos novos, que dependem de `catalog-refresh` e `context-window-limits`;
  - trocar de provedor em tempo de execução pelo `/model`, que hoje só troca o modelo dentro do provedor.

## Success criteria
`/connect` lista todos os provedores do catálogo que pedem chave, com busca por digitação, e conectar qualquer um deles salva a chave e permite usá-lo com `KODA_PROVIDER=<nome>` sem código novo. Adicionar outro provedor compatível com OpenAI passa a ser uma entrada no catálogo, provada por um teste que falha se a factory precisar de código por provedor.

## Non-goals assumidos
Esta mudança não promete "70+". Ela entrega a **estrutura** que torna cada provedor um dado, mais cerca de 20 provedores reais. Chegar a 70+ é adotar um catálogo externo, e isso é uma decisão separada, com rede e cache envolvidos.
