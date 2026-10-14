# context-window-limits

## Purpose
Keep every request inside the selected model's context window and let each model answer up to its real output limit.

## Requirements

### Requirement: Each model has effective context and output limits {#catalog-model-limits}
The system SHALL resolve a context limit and an output limit for any provider and model, taking them from the model catalog when the model is catalogued and from the provider's default otherwise, SHALL cap the output limit so a single reply cannot reserve the whole window, and these limits SHALL be the single source for request output caps and conversation budgets.
> verify: `cd packages/core && node --conditions=development --test --import tsx test/model-catalog.test.ts`

#### Scenario:
- WHEN a catalogued model is resolved
- THEN its catalog limits apply, with the output capped

#### Scenario:
- WHEN a model is not in the catalog
- THEN the provider's default limit applies

#### Scenario:
- WHEN the provider is unknown
- THEN a small conservative limit applies

### Requirement: Every provider receives an explicit output limit {#explicit-output-limit}
Each completion and streaming request SHALL carry an output-token limit resolved for the model of that request, and an explicit maxTokens from the caller SHALL take precedence.
> verify: `cd packages/core && node --conditions=development --test --import tsx test/provider-wire.test.ts`

#### Scenario:
- WHEN a request is sent without an explicit maxTokens
- THEN the body carries the resolved output limit for that model

#### Scenario:
- WHEN the request names a different model
- THEN the limit follows that model

#### Scenario:
- WHEN the caller passes maxTokens
- THEN the body carries the caller's value

### Requirement: The conversation is compacted by token budget {#token-aware-compaction}
The interactive session SHALL keep its conversation within a budget derived from the model's context limit minus its output limit and a reserve for the system prompt, tool definitions and next prompt, dropping whole oldest turns first, never dropping the system prompt and never leaving an orphan tool reply, and SHALL re-apply the budget when the user switches model.
> verify: `cd packages/koda && node --conditions=development --test --import tsx test/conversation-context.test.ts`

#### Scenario:
- WHEN the accumulated conversation exceeds the budget
- THEN the oldest turns are dropped until it fits and the remaining history still starts at a user message

#### Scenario:
- WHEN a single turn alone exceeds the budget
- THEN that turn is kept so the current question survives

#### Scenario:
- WHEN the user switches to a model with a smaller window
- THEN the existing history is compacted to the new budget

### Requirement: Dropped turns are reported {#compaction-notice}
When compaction drops messages, the session SHALL report how many were dropped so the user knows the context was shortened.
> verify: `cd packages/koda && node --conditions=development --test --import tsx test/conversation-context.test.ts`

#### Scenario:
- WHEN compaction drops older messages
- THEN the transcript shows how many messages were dropped

#### Scenario:
- WHEN nothing is dropped
- THEN no notice is shown

### Requirement: Token estimation without a new dependency {#token-estimation}
The system SHALL estimate the token size of a conversation from its content without a tokenizer dependency, erring high for ordinary text, counting wide-script characters individually, and charging a fixed cost per message and per image part.
> verify: `cd packages/core && node --conditions=development --test --import tsx test/tokens.test.ts`

#### Scenario:
- WHEN plain text is measured
- THEN the estimate is not lower than one token per four characters

#### Scenario:
- WHEN CJK text is measured
- THEN each character counts as at least one token

#### Scenario:
- WHEN a message carries a base64 image
- THEN the image contributes a fixed cost instead of its encoded length
