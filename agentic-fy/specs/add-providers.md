# add-providers

## Purpose
Make every provider a catalog entry instead of code, so connecting and using an OpenAI-compatible vendor needs no new module.

## Requirements

### Requirement: The provider catalog is an open registry {#catalog-open-registry}
Provider identity SHALL be defined by the catalog rather than by a closed type union, validated at every boundary against the catalog, so adding a provider is a catalog entry and requires no change to the factory, the configuration types or the connect flow.
> verify: `node --test --import tsx test/factory.test.ts test/provider-registry.test.ts`

#### Scenario:
- WHEN a provider entry is added to the catalog
- THEN it is accepted by the environment selector, the factory and the agent model prefix with no other source change

#### Scenario:
- WHEN a name absent from the catalog is used
- THEN it is rejected with an unsupported-provider error

### Requirement: The factory dispatches by SDK kind {#factory-dispatch-by-sdk}
The factory SHALL build every provider from its catalog entry by dispatching on the entry's SDK kind, and the provider layer SHALL NOT branch on individual provider names in the factory, config or catalog modules.
> verify: `node --test --import tsx test/provider-registry.test.ts`

#### Scenario:
- WHEN the factory creates any catalog provider
- THEN one code path serves them all and the base URL is validated whenever one is configured

#### Scenario:
- WHEN the provider layer is scanned
- THEN no conditional keyed on a provider name remains in the catalog, config or factory modules

### Requirement: OpenAI-compatible vendors come from the catalog {#openai-compatible-vendors}
The catalog SHALL include the OpenAI-compatible hosted and local vendors, each with its base URL, API key variable, model variable and default model, served by the shared AI SDK adapter without a dedicated package or module.
> verify: `node --test --import tsx test/provider-wire.test.ts`

#### Scenario:
- WHEN a catalog-only OpenAI-compatible provider sends a request
- THEN the request reaches its configured base URL and the response is normalized like the built-in providers

#### Scenario:
- WHEN that provider streams a tool call
- THEN the normalized events match the OpenAI-shaped behavior

### Requirement: Connect lists every provider that needs a key {#connect-lists-every-provider}
The connect flow SHALL offer every catalog provider that requires an API key, with its connection status, SHALL exclude local providers that need no key, and SHALL save the key under the variable declared by the catalog entry.
> verify: `node --test --import tsx test/connect-flow.test.ts`

#### Scenario:
- WHEN the connect selector is opened
- THEN it lists every provider that requires a key and no local provider

#### Scenario:
- WHEN a provider is chosen and a key entered
- THEN the key is stored under that provider's declared variable and never echoed
