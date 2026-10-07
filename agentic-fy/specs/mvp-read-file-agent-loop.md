# mvp-read-file-agent-loop

## Purpose
Prove a secure end-to-end terminal agent cycle in which an LLM can request a local project file and answer using the resulting observation.

## Requirements

### Requirement: Provider-neutral completion contract {#provider-neutral-completion}
The system SHALL expose strictly typed provider-neutral contracts for messages, tool definitions, tool calls, and completion results, and the agent core SHALL depend only on those contracts.
> verify: `npm test`

#### Scenario:
- WHEN an OpenAI completion contains text or function calls
- THEN the adapter returns normalized content and tool calls without leaking OpenAI SDK types into the agent core

### Requirement: OpenAI tool-enabled completion {#openai-tool-completion}
The system SHALL provide an OpenAI adapter that submits normalized conversation history and optional tool definitions using a configurable model.
> verify: `npm test`

#### Scenario:
- WHEN at least one tool definition is provided
- THEN the adapter enables automatic tool selection and preserves returned tool call identifiers, names, and arguments

#### Scenario:
- WHEN no tool definitions are provided
- THEN the adapter requests a normal completion without forcing tool use

### Requirement: Secure project file read {#secure-project-file-read}
The system SHALL read UTF-8 files only when their real resolved paths remain within the configured project root, are not sensitive, and do not exceed the configured size limit.
> verify: `npm test`

#### Scenario:
- WHEN readFile receives a relative path to an allowed file inside the project root
- THEN the tool returns the file content asynchronously

#### Scenario:
- WHEN readFile receives parent traversal or an absolute path outside the project root
- THEN the tool rejects the request with a security failure

#### Scenario:
- WHEN readFile targets a symlink whose real path escapes the project root
- THEN the tool rejects the request with a security failure

#### Scenario:
- WHEN readFile targets .env, .git, .npmrc, SSH material, or a credential file
- THEN the tool rejects the request without exposing file content

#### Scenario:
- WHEN readFile targets a file larger than the configured limit
- THEN the tool rejects the request before loading the file content

### Requirement: Deterministic tool dispatch {#deterministic-tool-dispatch}
The system SHALL publish the readFile tool schema and dispatch only registered tool names whose JSON arguments pass runtime validation.
> verify: `npm test`

#### Scenario:
- WHEN the model requests readFile with a non-empty string filePath
- THEN the registry executes the read-file tool and returns its observation

#### Scenario:
- WHEN tool arguments are malformed JSON or fail the readFile argument contract
- THEN the registry returns a sanitized failure observation and the process remains operational

#### Scenario:
- WHEN the model requests an unknown tool
- THEN the registry returns a sanitized unknown-tool observation and executes no file operation

### Requirement: Bounded Think Act Observe loop {#bounded-agent-loop}
The system SHALL continue normalized assistant and tool messages until the provider returns a final answer without tool calls or the configured iteration limit is reached.
> verify: `npm test`

#### Scenario:
- WHEN the first completion requests readFile and the next completion returns text
- THEN the tool result is associated with the original tool call ID and the text is returned as the final answer

#### Scenario:
- WHEN one completion requests multiple tool calls
- THEN each call is executed sequentially and each observation is appended before the next completion

#### Scenario:
- WHEN the provider returns a direct answer without tool calls
- THEN the agent returns it without executing a tool

#### Scenario:
- WHEN tool requests continue through the configured iteration limit
- THEN the agent stops and reports a controlled iteration-limit failure

### Requirement: Non-interactive MVP CLI {#non-interactive-mvp-cli}
The system SHALL provide a terminal entry point that accepts a prompt, obtains the API key from OPENAI_API_KEY, runs the agent, and prints the final answer with graceful failure behavior.
> verify: `npm test`

#### Scenario:
- WHEN a prompt and OPENAI_API_KEY are present
- THEN the CLI runs the agent without persisting or logging the key

#### Scenario:
- WHEN the prompt or OPENAI_API_KEY is missing
- THEN the CLI prints an actionable message and exits with a non-zero status

#### Scenario:
- WHEN the provider or agent fails
- THEN the CLI prints a concise user-facing error without an unhandled stack trace

### Requirement: Offline agent verification {#offline-agent-verification}
The system SHALL verify sandbox and agent-loop behavior with automated tests that require neither network access nor provider credentials.
> verify: `npm test`

#### Scenario:
- WHEN the test suite exercises a fake provider requesting package.json
- THEN it proves the file observation is returned to the provider and a grounded final answer reaches the caller
