# Design — add-providers

## Context
Estado medido no código, não suposto:

- `src/cli/connect/flow.ts:46` → `CONNECTABLE_PROVIDERS.map(providerLabel)` alimenta `ui.select`. O `/connect` não tem lista própria: ele deriva do catálogo. **Crescer o catálogo já faz o `/connect` crescer.**
- `src/providers/auth/store.ts:23` → `CONNECTABLE_PROVIDERS = PROVIDER_NAMES.filter(n => providerSpec(n).apiKeyRequired)`.
- `src/providers/catalog/types.ts` → `ProviderName = "openai" | "anthropic" | "gemini" | "ollama"`. **Esta união é o gargalo.**
- `src/providers/factory/factory.ts` → `FactoryMap` é um tipo mapeado sobre `ProviderName`, então o compilador exige uma função por provedor. Não escala para 20.
- `src/providers/config/types.ts` → `ProviderConfig` é união discriminada com `OllamaProviderConfig` escrita à mão.
- `src/providers/config/environment.ts:76` → `if (provider === "ollama")` decide no nome do provedor em vez de no spec.
- `src/providers/adapters/ai-sdk/provider.ts` → o `AiSdkProvider` **já** é genérico: recebe `spec`, `label`, `apiKey`, `baseURL`, `fetch`, `toolSupport`, `images`, `imageMediaTypes` e despacha pelo `spec.sdk`. Nada aqui precisa mudar por provedor novo.
- `src/providers/adapters/ai-sdk/models.ts` → `createOpenAICompatible({ name, baseURL, apiKey, fetch, includeUsage })` já serve qualquer API compatível.
- `LAYOUT.choiceMaxRows = 8` (`runtime/constants.ts`) e `choice-list.ts:45` → o seletor mostra no máximo 8 linhas. Com 20 itens, rolar sem filtro é ruim.
- `test/factory.test.ts:49` → `CASES ... satisfies Record<ProviderName, ProviderCase>` exigiria 20 casos escritos à mão.
- `test/connect-flow.test.ts:47` → afirma `labels?.length === 3`. Precisa passar a derivar do catálogo.
- `src/agents/agent-file.ts:133` → valida o prefixo de `model: provider/modelo` com `isProviderName`. Ampliar o catálogo libera isso de graça.

## Architecture

### 1. `ProviderName` deixa de ser uma união fechada
```ts
// catalog/types.ts
export type ProviderName = string;          // validado contra o catálogo
export type BuiltInProvider = keyof typeof PROVIDERS;  // para a API pública
```
`isProviderName(value)` continua a porta de entrada: passa a checar `value in PROVIDERS` em vez de varrer uma união. Todas as validações de runtime que já existem (`providerFromEnvironment`, `agent-file.ts`, `auth/store.ts`) continuam valendo sem mudança.

Alternativa considerada e rejeitada: ampliar a união com 20 literais. Mantém a checagem em tempo de compilação, mas quebra justamente o objetivo, porque cada provedor novo volta a ser mudança de tipo e obriga uma entrada em todo `Record<ProviderName, …>` do projeto.

A segurança que se perde é compensada por:
- `PROVIDERS` com `satisfies Readonly<Record<string, ProviderSpec>>`, que mantém a forma de cada entrada verificada;
- `BuiltInProvider` nos lugares que precisam de nomes conhecidos;
- validação de runtime em todas as fronteiras, que já existe.

### 2. A factory despacha pelo `sdk`, não pelo nome
```ts
// factory/factory.ts
export class ProviderFactory {
  public static create(config: ProviderConfig): ILLMProvider {
    const spec = providerSpec(config.provider);
    if (config.baseURL !== undefined)
      validateBaseURL(config.baseURL, spec.baseURLEnv ?? "baseURL");
    return new AiSdkProvider(toAiSdkOptions(config, spec));
  }
}
```
`FactoryMap`, `ConfigMap` e `createFor` saem. A validação de `baseURL` deixa de ser um caso especial do ollama e passa a valer para qualquer provedor que aceite URL própria, o que é mais seguro, não menos.

### 3. `ProviderConfig` genérico
```ts
// config/types.ts
export interface ProviderConfig {
  readonly provider: ProviderName;
  readonly apiKey?: string;      // obrigatório em runtime quando apiKeyRequired
  readonly model?: string;
  readonly baseURL?: string;
  readonly toolSupport?: boolean;
}
```
`configFromEnvironment` passa a ser guiado pelo spec, sem `if (provider === "ollama")`:
- `apiKey`: `requiredEnv` quando `spec.apiKeyRequired`, senão opcional;
- `baseURL`: lido de `spec.baseURLEnv` quando declarado;
- `toolSupport`: lido de `spec.toolSupportEnv` quando declarado.

### 4. Catálogo: cada provedor é dado
O `ProviderSpec` já tem tudo que o adapter precisa. Entradas novas usam `sdk: "openai-compatible"` e `defaultBaseURL`, sem pacote novo:

```ts
openrouter: {
  sdk: "openai-compatible",
  label: "OpenRouter",
  defaultModel: "…",
  modelEnv: "OPENROUTER_MODEL",
  apiKeyEnv: "OPENROUTER_API_KEY",
  apiKeyRequired: true,
  baseURLEnv: "OPENROUTER_BASE_URL",
  defaultBaseURL: "https://openrouter.ai/api/v1",
},
```

O `ProviderSpec` ganha dois campos que hoje estão espalhados: `label` (nome de exibição, hoje escrito à mão em `vendors.ts`) e `local?: boolean` (para separar servidor local de serviço hospedado na interface).

Provedores da primeira rodada, todos compatíveis com OpenAI. **Modelo padrão e URL base de cada um são confirmados na tarefa 1 contra a documentação do fornecedor**, não chutados:

| Grupo | Provedores |
|---|---|
| Gateways | OpenRouter |
| Inferência rápida | Groq, Cerebras, Together, Fireworks, DeepInfra, Nebius, Baseten |
| Modelos próprios | DeepSeek, xAI, Mistral, Moonshot, Z.AI, NVIDIA |
| Locais | LM Studio, vLLM, llama.cpp |

### 5. Busca no seletor do `/connect`
O `ChoiceList` hoje só navega com setas. Ganha um filtro: ao digitar, a lista reduz; Backspace apaga; setas e Enter continuam. Com 20 itens e 8 linhas visíveis, digitar `gro` chega no Groq em três teclas.

O filtro vive no `ChoiceList` porque o seletor de model e o de sessão sofrem do mesmo problema quando a lista cresce. O `/connect` passa o rótulo já formatado, como hoje.

### 6. Testes guiados pelo catálogo
- `factory.test.ts`: em vez de `CASES` escrito à mão, itera `PROVIDER_NAMES` e verifica, para cada provedor, que `ProviderFactory.create` devolve um `ILLMProvider`, que `capabilities().streaming` é true e que a chave vem da variável declarada no spec. Um provedor novo passa a ser coberto automaticamente.
- Um teste novo garante que **nenhuma** parte de `src/providers/factory`, `config` ou `catalog` cita nome de provedor em condicional, isto é, que o despacho é por `sdk`. É isso que impede a regressão para "uma função por provedor".
- `connect-flow.test.ts`: troca `labels.length === 3` por `labels.length === CONNECTABLE_PROVIDERS.length`, e passa a afirmar que todo provedor com `apiKeyRequired` aparece e que nenhum local aparece.
- `provider-wire.test.ts`: acrescenta um provedor compatível novo (Groq) à tabela de fornecedores, reaproveitando os leitores e as respostas da OpenAI, provando que um provedor de catálogo funciona ponta a ponta sem código próprio.

## Alternatives considered
- **Models.dev como fonte do catálogo.** É o que leva a 70+, e é o caminho do OpenCode. Rejeitado para esta mudança: envolve requisição de rede no início da sessão, cache em disco, modo offline e uma decisão de privacidade. Merece mudança própria (`catalog-refresh`), e esta prepara o terreno ao tornar o catálogo um dado.
- **Um pacote `@ai-sdk/*` por provedor** (`@ai-sdk/groq`, `@ai-sdk/xai`, `@ai-sdk/deepseek`...). Rejeitado nesta rodada: dez dependências novas para ganho pequeno, porque todos esses provedores falam a API compatível. Os pacotes oficiais valem onde mudam a autenticação ou o protocolo, ou seja, Azure, Bedrock e Vertex, que estão fora de escopo.
- **Seção `provider` no `koda.json`**, como o OpenCode. Desejável e compatível com este desenho, porque o catálogo passa a ser dado. Fica para depois, para esta mudança não misturar carga de configuração com a abertura do catálogo.
- **Manter a união fechada e gerar os literais por script.** Rejeitado: complexidade de build para um ganho que a validação de runtime já cobre.

## Risks
- **Perder a exaustividade do compilador.** Hoje um `ProviderName` novo quebra a compilação até ter factory e caso de teste, o que é uma rede de proteção real. Mitigação: validação de runtime em todas as fronteiras (já existe), `PROVIDERS` com `satisfies`, testes guiados pelo catálogo que cobrem qualquer provedor novo automaticamente, e o teste que proíbe condicional por nome de provedor.
- **Chave de API em `Record<ProviderName, …>` com `ProviderName = string`.** `StoredAuth.providers` passa a ser um registro aberto. O `parseAuth` já ignora nome desconhecido (`isProviderName`), então um `auth.json` de outra versão continua sendo lido sem erro.
- **URL base errada ou modelo padrão inexistente.** É o risco mais provável, porque são 20 entradas de dado. Mitigação: a tarefa 1 confirma cada uma na documentação do fornecedor, e o `/connect` não valida credencial (não faz requisição), então um erro aparece no primeiro uso, com a mensagem de HTTP já normalizada.
- **Custo em branco para os provedores novos.** `catalog/pricing.ts` tem 3 modelos. Fica assumido: o cabeçalho mostra custo indefinido até `catalog-refresh`. Não é regressão, é a situação atual para qualquer modelo fora dos três.
- **`/connect` com 20 itens sem filtro é pior que com 3.** É por isso que a busca entra nesta mudança e não na seguinte.
- **A API pública exporta `ProviderName`.** Virar `string` relaxa o tipo para quem usa o KODA como SDK: deixa de haver autocompletar. Mitigação: exportar também `BuiltInProvider` e registrar no CHANGELOG.
