# multi-provider-ai-abstraction

## Purpose
Allow Koda to select and consume OpenAI, Anthropic, Gemini, or Ollama through one strictly typed completion, streaming, tool-calling, and capability contract.

## Requirements

### Requirement: Unified provider contract {#unified-provider-contract}
The system SHALL expose strictly typed provider-neutral contracts for text and image messages, tool definitions and calls, completion options and results, streaming events, cancellation, usage metadata, and provider capabilities, and core code SHALL depend only on those contracts.
> verify: `npm test`

#### Scenario:
- WHEN any adapter returns completion or streaming data
- THEN callers receive only normalized types and no vendor SDK type outside the adapter directory

#### Scenario:
- WHEN a caller supplies an AbortSignal
- THEN the selected adapter forwards cancellation to supported vendor requests

#### Scenario:
- WHEN a caller queries tool support
- THEN the provider reports its capability without issuing a network request

### Requirement: Streaming OpenAI adapter {#streaming-openai-adapter}
The system SHALL provide an OpenAI adapter, built on the AI SDK OpenAI Chat Completions model, that maps normalized completion and streaming requests, multimodal content, and native function calls using a configurable model.
> verify: `npm test -- test/provider-wire.test.ts`

#### Scenario:
- WHEN OpenAI returns text or native function calls
- THEN the adapter preserves normalized content, call identifiers, names, arguments, usage, and finish reason

#### Scenario:
- WHEN OpenAI streams text and function-call argument fragments
- THEN the adapter yields ordered normalized deltas and completed normalized tool calls

### Requirement: Anthropic provider adapter {#anthropic-provider-adapter}
The system SHALL provide an Anthropic adapter, built on @ai-sdk/anthropic, that maps normalized messages, system instructions, tools, tool results, completions, streams, usage, and failures to and from the Claude Messages API.
> verify: `npm test -- test/provider-wire.test.ts`

#### Scenario:
- WHEN normalized history includes a system message and a readFile tool definition
- THEN the adapter separates the system instruction and sends the tool using Anthropic input schema without changing agent code

#### Scenario:
- WHEN Claude returns tool-use blocks
- THEN the adapter preserves call identifiers and yields normalized calls and events

#### Scenario:
- WHEN a tool observation is sent after a Claude tool call
- THEN the adapter maps it to the matching tool-result block

### Requirement: Gemini provider adapter {#gemini-provider-adapter}
The system SHALL provide a Gemini adapter, built on @ai-sdk/google, that maps normalized text and image content, function declarations and calls, completions, streams, usage, and failures to and from the Gemini API.
> verify: `npm test -- test/provider-wire.test.ts`

#### Scenario:
- WHEN a normalized request contains text, image content, and tools
- THEN the adapter maps content parts and function declarations without exposing Gemini types

#### Scenario:
- WHEN Gemini omits a function-call identifier
- THEN the adapter assigns a unique identifier that the corresponding tool result reuses

### Requirement: Ollama provider adapter {#ollama-provider-adapter}
The system SHALL provide an Ollama adapter, built on @ai-sdk/openai-compatible, using the OpenAI-compatible local API with configurable model and base URL, no mandatory API key, normalized streaming, and explicit tool capability reporting.
> verify: `npm test -- test/provider-wire.test.ts`

#### Scenario:
- WHEN Ollama is selected without a base URL
- THEN the adapter uses http://127.0.0.1:11434/v1 and performs no provider-discovery network call

#### Scenario:
- WHEN the configured local model does not support tools
- THEN the provider rejects a tool-enabled request with an actionable capability error before completion

### Requirement: Provider factory and configuration {#provider-factory}
The system SHALL create exactly one adapter from a discriminated explicit configuration or validated environment configuration for openai, anthropic, gemini, or ollama.
> verify: `npm test`

#### Scenario:
- WHEN explicit configuration names a supported provider with valid required values
- THEN the factory returns the matching ILLMProvider implementation

#### Scenario:
- WHEN KODA_PROVIDER selects a hosted provider but its API key is absent
- THEN the factory reports the missing environment variable without exposing any secret value

#### Scenario:
- WHEN both KODA_PROVIDER and OPENCODE_PROVIDER are present
- THEN KODA_PROVIDER takes precedence

#### Scenario:
- WHEN no provider selector is present
- THEN the factory preserves compatibility by selecting OpenAI and validating OPENAI_API_KEY

#### Scenario:
- WHEN the provider name or Ollama URL is invalid
- THEN the factory fails before constructing or contacting a provider

### Requirement: Provider-agnostic agent and CLI integration {#provider-agnostic-agent-integration}
The system SHALL run the agent through an injected ILLMProvider and create the CLI provider through ProviderFactory without vendor-specific imports or branches in the core agent.
> verify: `npm test`

#### Scenario:
- WHEN equivalent adapters request readFile
- THEN the same agent loop dispatches the tool and returns the final normalized answer without provider-specific logic

#### Scenario:
- WHEN KODA_PROVIDER selects anthropic, gemini, or ollama with valid configuration
- THEN the CLI constructs the selected adapter without changing CLI or agent source

### Requirement: Vendor dependency boundary {#vendor-boundary-enforcement}
The system SHALL confine AI SDK imports (ai, @ai-sdk/*) and vendor payload types to src/providers/adapters and expose only provider-neutral types through public SDK exports, including provider option types.
> verify: `npm test -- test/provider-boundary.test.ts`

#### Scenario:
- WHEN static boundary tests inspect src/core, src/cli, tools, and public provider contracts
- THEN no AI SDK or vendor SDK import or payload type is present

#### Scenario:
- WHEN an SDK consumer configures a provider class
- THEN the options accept apiKey, model and a standard fetch function and reference no vendor SDK client type

### Requirement: Every provider can list its models {#model-discovery}
Each provider adapter SHALL be able to list the chat-capable model identifiers its vendor currently serves, excluding models the vendor reports as deprecated or retired and excluding models that cannot generate chat content, and SHALL send credentials in request headers rather than in URLs.
> verify: `node --test --import tsx test/list-models.test.ts test/tui.test.ts`

#### Scenario:
- WHEN the model picker is opened on Anthropic or Gemini
- THEN it lists models returned by that vendor instead of showing nothing

#### Scenario:
- WHEN a vendor reports a model as deprecated or retired
- THEN that model is absent from the list offered to the user

#### Scenario:
- WHEN a vendor returns model identifiers with a resource-name prefix
- THEN the adapter yields the bare identifier the completion request expects

#### Scenario:
- WHEN a vendor paginates its model list
- THEN the adapter follows the pages up to a bounded limit and returns the combined result

#### Scenario:
- WHEN a listing request fails
- THEN the session reports an actionable error without exposing the API key

#### Scenario:
- WHEN model discovery is added for a provider
- THEN the agent loop, the provider contract and the model-picker UI need no change
