# migrate-to-ai-sdk

## Purpose
Run every LLM provider through the Vercel AI SDK behind the ILLMProvider contract, with behavior parity proven by wire-level tests.

## Requirements

### Requirement: One AI SDK adapter serves every provider {#ai-sdk-single-adapter}
OpenAI, Anthropic, Gemini and Ollama SHALL be served by a single adapter in src/providers/adapters/ai-sdk built on the ai package with @ai-sdk/openai (Chat Completions), @ai-sdk/anthropic, @ai-sdk/google and @ai-sdk/openai-compatible, and the openai, @anthropic-ai/sdk and @google/genai packages SHALL NOT be dependencies or be imported.
> verify: `npm test -- test/providers-structure.test.ts`

#### Scenario:
- WHEN the providers source tree is listed
- THEN the only adapter folder is adapters/ai-sdk

#### Scenario:
- WHEN package.json dependencies are inspected
- THEN openai, @anthropic-ai/sdk and @google/genai are absent and ai, @ai-sdk/* and zod are pinned to exact versions

### Requirement: Wire-level parity with the previous adapters {#ai-sdk-wire-parity}
For every provider, the HTTP requests sent and the normalized results returned SHALL satisfy the same wire-level suite that passed on the previous vendor-SDK adapters, covering text, streaming deltas, tool definitions, tool calls and results across turns, images, system instructions, usage and cancellation.
> verify: `npm test -- test/provider-wire.test.ts`

#### Scenario:
- WHEN a conversation with a tool call and its tool result is sent to any provider
- THEN the request body carries the call and the matching result in that vendor's format and the response yields normalized tool calls

#### Scenario:
- WHEN the vendor streams several text chunks
- THEN the provider yields one text-delta per chunk followed by tool-call, usage and done events

#### Scenario:
- WHEN a caller aborts a streaming request
- THEN the stream ends right after the abort without a further request

### Requirement: Cancelling a stream raises on every provider {#ai-sdk-uniform-cancellation}
When a streaming request is cancelled, every provider SHALL raise a ProviderError instead of closing the stream with a partial response, so the caller never mistakes cancelled output for a complete answer.
> verify: `npm test -- test/provider-wire.test.ts`

#### Scenario:
- WHEN a caller aborts a stream after the first text delta
- THEN the provider raises a ProviderError and emits no done event

### Requirement: Requests go only to the configured vendor endpoint {#ai-sdk-explicit-provider-instances}
The adapter SHALL build language models from explicit provider instances configured from the catalog and SHALL NOT resolve string model identifiers through the AI SDK global default provider or the Vercel AI Gateway.
> verify: `npm test -- test/provider-wire.test.ts`

#### Scenario:
- WHEN any provider sends a request
- THEN the request URL host is that vendor's API host or the configured base URL

### Requirement: Failures keep the normalized ProviderError shape {#ai-sdk-failures}
Completion, streaming and model-listing failures, including stream error parts and exhausted retries, SHALL surface as ProviderError with the existing HTTP status or connection hint, SHALL retry at most twice, and SHALL NOT include API keys.
> verify: `npm test -- test/provider-wire.test.ts`

#### Scenario:
- WHEN the vendor answers 401
- THEN the provider throws ProviderError mentioning HTTP 401 and the invalid key hint without the key value

#### Scenario:
- WHEN the vendor answers 429 on every attempt
- THEN the provider sends three requests in total and throws ProviderError with the HTTP 429 hint

#### Scenario:
- WHEN the network connection fails
- THEN the provider throws ProviderError with the connection hint

### Requirement: Node 22 runtime requirement {#ai-sdk-runtime-requirements}
package.json SHALL declare engines.node >=22.0.0, as required by the AI SDK packages, and the README SHALL state the same requirement.
> verify: `npm test -- test/providers-structure.test.ts`

#### Scenario:
- WHEN package.json is inspected
- THEN engines.node is >=22.0.0
