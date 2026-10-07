# providers-structure-refactor

## Purpose
Keep the LLM provider layer organized by purpose, with shared SDK-free helpers, a single catalog, real streaming on every provider, and a single public entry point.

## Requirements

### Requirement: Providers are organized in purpose folders {#providers-folders-by-purpose}
Every TypeScript file under src/providers SHALL live inside a purpose folder (contracts, catalog, config, factory, shared, adapters/<vendor>), except the barrel src/providers/index.ts, and exported interfaces and type aliases SHALL be declared only in types.ts files.
> verify: `npm test -- test/providers-structure.test.ts`

#### Scenario:
- WHEN the providers source tree is listed
- THEN the only file directly under src/providers is index.ts

#### Scenario:
- WHEN a provider module exports an interface or type alias
- THEN it is declared in that folder's types.ts

### Requirement: Adapters reuse SDK-free shared helpers {#providers-shared-helpers}
Error wrapping, system extraction, tool-call argument parsing, optional request fields, usage mapping, and stream accumulation SHALL be implemented once in src/providers/shared, which SHALL NOT import vendor SDKs or adapters.
> verify: `npm test -- test/providers-structure.test.ts`

#### Scenario:
- WHEN shared, contracts, catalog or config modules are inspected
- THEN they import no vendor SDK and nothing from adapters

#### Scenario:
- WHEN an adapter needs to wrap a failure
- THEN it uses wrapProviderError and an existing ProviderError is rethrown unchanged

### Requirement: Single provider catalog with pricing {#providers-single-catalog}
Provider names, default models, model and API key environment variables, default max tokens, and model prices SHALL be defined once in src/providers/catalog, and the factory, identity resolution, and TUI cost estimation SHALL derive from it.
> verify: `npm test -- test/factory.test.ts`

#### Scenario:
- WHEN the provider is selected from the environment
- THEN the API key and model variables come from the catalog entry

#### Scenario:
- WHEN an unknown provider is configured
- THEN both the factory and resolveProviderIdentity throw ProviderError

### Requirement: Real streaming on every provider {#providers-real-streaming}
Anthropic and Gemini adapters SHALL stream incrementally from their SDKs, emitting text-delta events as chunks arrive, followed by tool-call, usage and done events, and SHALL honor options.signal.
> verify: `npm test -- test/provider-adapters.test.ts`

#### Scenario:
- WHEN the vendor stream yields several text chunks
- THEN the adapter emits one text-delta per chunk before done

#### Scenario:
- WHEN the stream contains a tool call
- THEN a complete tool-call event with parsed id, name and JSON arguments is emitted and included in done

### Requirement: Known adapter bugs are fixed {#providers-bug-fixes}
Gemini SHALL send the function name in functionResponse, forward the abort signal and report finishReason; Anthropic SHALL send image parts and SHALL NOT send empty text blocks; adapters SHALL NOT re-wrap ProviderError.
> verify: `npm test -- test/provider-adapters.test.ts`

#### Scenario:
- WHEN a Gemini tool message answers a previous call
- THEN functionResponse.name is the called function name

#### Scenario:
- WHEN an Anthropic user message contains an image
- THEN the request contains a base64 image block

#### Scenario:
- WHEN an Anthropic assistant message has only tool calls
- THEN the request contains no empty text block

### Requirement: Single public entry point {#providers-public-barrel}
Code outside src/providers SHALL import provider modules only through src/providers/index.ts, legacy shims SHALL be removed, and src/index.ts SHALL keep exporting the same public symbols.
> verify: `npm run check`

#### Scenario:
- WHEN core, cli, tui, tools or src/index.ts import provider code
- THEN they use the providers/index.js barrel

#### Scenario:
- WHEN an SDK consumer imports the provider classes, ProviderFactory, ProviderConfig or contracts
- THEN the imports still resolve with the same types

### Requirement: Refactor keeps behavior {#providers-refactor-behavior-parity}
The restructured provider layer SHALL keep the agent, TUI and batch behavior and strict type safety.
> verify: `npm test`

#### Scenario:
- WHEN the full test suite runs after the refactor
- THEN all tests pass

#### Scenario:
- WHEN the project is type checked
- THEN npm run check succeeds with no new suppressions
