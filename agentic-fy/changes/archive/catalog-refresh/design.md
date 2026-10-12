# Design — catalog-refresh

## Context

### What exists today

`src/providers/catalog/` holds three files:

- `catalog.ts` — `PROVIDER_NAMES`, `DEFAULT_PROVIDER`, `LOCAL_API_KEY`, the `PROVIDERS`
  table (`sdk`, `defaultModel`, `modelEnv`, `apiKeyEnv`, `apiKeyRequired`, and optional
  `defaultMaxTokens`, `baseURLEnv`, `defaultBaseURL`, `toolSupportEnv`), `providerSpec()`,
  `isProviderName()`.
- `pricing.ts` — a three-entry `PRICES` literal and `estimateCost()`.
- `types.ts` — `ProviderName`, `SdkKind`, `ProviderSpec`, `ModelPrice`.

Cost consumers: `session/header.ts` and `session/session-controller.ts` call `estimateCost`;
`session/usage-format.ts` `formatCost` renders `N/A` for `undefined`; `runtime/session-sidebar.ts`
renders the formatted value.

Model listing: `adapters/ai-sdk/list-models.ts` exports `listChatModels`, which does
`GET {baseURL}/models` with a Bearer header and reads `data[].id`. `adapters/ai-sdk/vendors.ts`
puts it on an `OpenAIShapedProvider` base class that `OpenAIProvider` and `OllamaProvider`
extend. `AnthropicProvider` and `GeminiProvider` extend `AISDKProvider` directly and so have
no `listModels`. `ILLMProvider.listModels` is optional (`listModels?()`).

`application.ts` returns early from the picker when the list is `undefined` or empty;
`model-command.ts` catches a listing failure and surfaces a warning.

### Compiler constraints that shape the generated code

`tsconfig.json` sets `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`verbatimModuleSyntax`, and `strict`. So:

- Indexing the generated record yields `T | undefined`, which is what `estimateCost`
  already wants to return.
- Optional fields must be omitted rather than set to `undefined`, so the fetcher emits
  keys only when it has a value.
- `include` is already `["src/**/*.ts", "test/**/*.ts"]` and `format:check` globs the same
  two trees plus `package.json` and `tsconfig.json`. Everything in this design lives under
  `src/providers/catalog/` and `test/`, so no build plumbing changes are needed.

### The data source

`https://models.dev/api.json` is a single JSON document, roughly 1.7 MB, keyed by provider id.
Verified against the live endpoint on 2026-10-12:

- 226 provider entries. The "75+ providers" figure quoted around OpenCode comes from
  counting gateways over this catalog, not from the catalog itself.
- Provider fields: `id`, `name`, `npm`, `env`, `doc`, `models`, plus `api` for
  OpenAI-compatible providers. These line up almost one-to-one with KODA's `ProviderSpec`,
  which is why `add-providers` will want the same generator.
- Model fields: `id`, `name`, `family`, `attachment`, `reasoning`, `reasoning_options`,
  `tool_call`, `structured_output`, `temperature`, `knowledge`, `release_date`,
  `last_updated`, `modalities`, `open_weights`, `limit.{context,output}`,
  `cost.{input,output,cache_read,cache_write}`, `canonical_model_id`, and an optional
  `status` of `alpha` / `beta` / `deprecated`.
- Model counts: openai 53, anthropic 17, google 39.
- After the usable-model filter (`tool_call === true`, `temperature !== false`, text
  output, not deprecated) and generation on 2026-10-12: openai 12, anthropic 8, gemini 21,
  ollama 0. See "The `temperature` finding" below for why the filter includes
  `temperature`, and why that cuts the openai and anthropic counts roughly in half from an
  earlier draft of this filter that did not.
- **`ollama` is not a provider in the catalog.** The local provider has no upstream source.
- **`anthropic/claude-3-5-sonnet-latest` is not an entry.** models.dev keys Anthropic by
  concrete ids (`claude-sonnet-5-5`, `claude-haiku-5-5`, …) and carries no `-latest` aliases
  for that vendor, though it does carry some for google (`gemini-flash-latest`) and openai
  (`gpt-5.2-chat-latest`).

Candidate defaults considered before the `temperature` filter was added (see below), read
from the live catalog on 2026-10-12:

| Provider / model | Tools | Context | Output | In / Out | Released |
| --- | --- | --- | --- | --- | --- |
| openai/gpt-6-luna | yes | 1,050,000 | 128,000 | $0.10 / $0.50 | 2026-09-22 |
| openai/gpt-6-sol | yes | 1,050,000 | 128,000 | $2.00 / $10.00 | 2026-09-22 |
| anthropic/claude-sonnet-5-5 | yes | 1,000,000 | 128,000 | $2.00 / $10.00 | 2026-09-28 |
| anthropic/claude-haiku-5-5 | yes | 1,000,000 | 128,000 | $0.10 / $0.50 | 2026-10-07 |
| gemini/gemini-3.8-flash | yes | 1,048,576 | 65,536 | $0.75 / $3.75 | 2026-09-02 |
| gemini/gemini-3.5-flash-lite | yes | 1,048,576 | 65,536 | $0.30 / $2.50 | 2026-07-21 |

All four openai/anthropic rows above are reasoning-only (`gpt-6-luna`/`gpt-6-sol`) or are
treated as reasoning-only by the AI SDK regardless of models.dev's flag
(`claude-sonnet-5-5`/`claude-haiku-5-5` are genuinely reasoning-only at the vendor level;
see "The `temperature` finding" for the OpenAI-specific SDK override that ruled out an
initial `gpt-5.4-nano` pick too). None of the four rows above is the final pick. Final
chosen defaults and the reason for each:

- **openai: `gpt-4o-mini` → `gpt-4.1-mini`.** Current generation (2025-04 against
  2024-07), 8x the context window (1,047,576 against 128,000) and 2x the output limit, at a
  moderate price increase ($0.40 / $1.60 against $0.15 / $0.60). Confirmed to accept
  `temperature`: `gpt-4.x` predates the AI SDK's reasoning-model override entirely, so
  nothing strips it. `gpt-6-luna` and `gpt-5.4-nano` were both cheaper but fall under that
  override; see the finding below.
- **anthropic: `claude-3-5-sonnet-latest` → `claude-sonnet-4-6`.** Same price as the rate
  the old table claimed ($3 / $15, matching), current generation (2026-02 against an entry
  that does not exist upstream at all), 5x the context window, and confirmed to accept
  `temperature` (the AI SDK has no Anthropic equivalent of the OpenAI override).
  `claude-sonnet-5-5` was cheaper ($2 / $10) but is reasoning-only; see the finding below.
- **gemini: `gemini-2.5-flash` → `gemini-3.8-flash`.** Flash-tier successor, confirmed to
  accept `temperature`. Costs more; see open question 2 in the proposal.
- **ollama: unchanged.** No upstream source.

### Vendor listing endpoints

**Anthropic**, `GET https://api.anthropic.com/v1/models`:

- Headers `x-api-key` and `anthropic-version: 2023-06-01`.
- Query `limit` (default 20, max 1000) and `lifecycle`, an array of `active` / `deprecated`
  / `retired`. Omitting `lifecycle` returns active **and deprecated** models, so the request
  must pass `lifecycle=active` explicitly or the picker will offer models headed for
  retirement.
- Response `{ data: [{ type: "model", id, display_name, lifecycle, max_input_tokens,
  max_tokens, created_at, deprecated_at, retires_at, capabilities }], has_more, first_id,
  last_id }`. Newer models first.
- Paginate with `after_id=last_id` while `has_more`.

**Gemini**, `GET https://generativelanguage.googleapis.com/v1beta/models`:

- Key in the `x-goog-api-key` header. The `?key=` query form also works but puts the
  credential in a URL, which is the kind of thing that ends up in a log; header it is.
- Response `{ models: [{ name: "models/gemini-3.8-flash", baseModelId, version,
  displayName, description, inputTokenLimit, outputTokenLimit,
  supportedGenerationMethods, thinking, temperature, topP, topK }], nextPageToken }`.
- A model is usable for chat when `supportedGenerationMethods` contains `generateContent`.
  That filter alone removes embeddings and TTS entries.
- `name` carries a `models/` prefix; KODA needs the bare id.
- Paginate with `pageToken` while `nextPageToken` is present.

Both responses also carry per-model token limits. That is a live source for what
`context-window-limits` wants, but wiring it there is out of scope here.

### The `temperature` finding

An earlier draft of this design filtered candidates on `tool_call`, text output, and
non-deprecated status only, and picked `gpt-6-luna` (openai) and `claude-sonnet-5-5`
(anthropic) as defaults. Running the wire-parity suite (`test/provider-wire.test.ts`)
against those defaults failed: `temperature and maxTokens reach every provider` showed the
OpenAI request leaving without a `temperature` field at all, although KODA sent `0.25`.

**First layer of the cause, confirmed from models.dev:** `gpt-6-luna`, `gpt-6-sol`,
`gpt-5-mini`, and the entire Claude "5" generation (`sonnet-5`, `sonnet-5-5`, `opus-5`,
`opus-5-5`, `haiku-5-5`, `fable-5`, `fable-5-1`) are reasoning-only models that reject the
`temperature` parameter outright at the vendor API; this is documented independently by
other integrators hitting the same models
([maximhq/bifrost#7701](https://github.com/maximhq/bifrost/issues/7701),
[BerriAI/litellm#33171](https://github.com/BerriAI/litellm/issues/33171)). models.dev
records this per model as `temperature: boolean`, so the generator's usability filter now
excludes `temperature === false`.

**Second layer, found after re-running the suite with a `temperature: true` pick
(`gpt-5.4-nano`) and watching it fail the same way:** the AI SDK does not trust
models.dev's flag for OpenAI. Reading
`node_modules/@ai-sdk/openai/dist/internal/index.js`, `getOpenAILanguageModelCapabilities`
computes its own `isReasoningModel` from the model id string:

```js
const isReasoningModel = oSeriesVersion != null
  || (gptVersion != null && gptVersion.major >= 5 && !isGptChatModel);
```

Any `o`-series model, or any `gpt-5` or later whose variant does not literally start with
`chat` (so `gpt-5.2-chat-latest` is exempt but plain `gpt-5.4-nano` is not), is
`isReasoningModel = true` in the SDK's eyes regardless of what models.dev's `temperature`
field says for that exact id, and the request-building code (`getArgs`) omits `temperature`
whenever that flag is set. `@ai-sdk/anthropic` has no equivalent override — grepping its
bundle for `isReasoningModel` finds nothing, which is why `claude-sonnet-4-6` passed the
same test unchanged.

Encoding the SDK's exact id-pattern heuristic into KODA's own generator would duplicate
vendor-internal logic that is not part of any public contract and can change between SDK
releases. Instead, the OpenAI default was picked from the generation the SDK does not
subject to this override at all: `gpt-4.x`. KODA's own `CompletionOptions.temperature` is
not cosmetic either way — the agent loop (`src/core/agent/agent.ts`) forwards it, and custom
agent files (`src/agents/agent-file.ts`) let a user set `temperature:` in front matter per
agent — so a default that drops it silently defeats a documented, user-facing setting with
no error shown anywhere.

The filter excludes `temperature === false`, and the final defaults are:

| Provider / model | Temp reaches request | Tools | Context | Output | In / Out | Released |
| --- | --- | --- | --- | --- | --- | --- |
| openai/gpt-4.1-mini | yes (pre-gpt-5, no SDK override applies) | yes | 1,047,576 | 32,768 | $0.40 / $1.60 | 2025-04-14 |
| anthropic/claude-sonnet-4-6 | yes | yes | 1,000,000 | 128,000 | $3.00 / $15.00 | 2026-02-17 |
| gemini/gemini-3.8-flash | yes | yes | 1,048,576 | 65,536 | $0.75 / $3.75 | 2026-09-02 |

This is also now the staleness guard's job going forward, not just a one-time catch: adding
`temperature !== false` to `isUsable` catches vendor-confirmed reasoning-only models,
and `test/model-catalog.test.ts` separately pins the known OpenAI/Anthropic reasoning-only
ids by name so a future catalog refresh cannot reintroduce one of them as a default without
the test failing, even where models.dev's own flag would not have caught it (as with
`gpt-5.4-nano`). The honest limitation: this guards the ids known today, not a model the AI
SDK has not been taught about yet. Any new `gpt-5`/`gpt-6`-class non-chat model is unsafe as
an OpenAI default until confirmed against the installed SDK version, independent of what
models.dev reports for it.

## Architecture

### Revision: runtime fetch with a disk cache, not a build-time script

The first draft of this design generated a TypeScript module at build time via
`scripts/refresh-catalog.ts`, run by hand with `npm run catalog:refresh`. That is rejected
now, by explicit decision: the user wants the catalog refreshed as a normal consequence of
running KODA, with no separate command to remember, and no code that fetches models.dev
living outside `src/`. The alternative this design previously rejected — "fetch models.dev
at runtime with a disk cache" — is the one now adopted. See Alternatives for what the
original rejection said and why it no longer holds given this constraint.

This changes the shape of the catalog from a single generated artifact to three layers:

```
src/providers/catalog/
  model-catalog.generated.ts   (fallback snapshot, checked in, same shape as before)
  catalog-fetch.ts             (fetches + filters models.dev; was scripts/refresh-catalog.ts)
  catalog-cache.ts             (reads/writes the disk cache, checks TTL)
  model-catalog.ts             (synchronous lookup; owns the in-memory table)
  pricing.ts                   (estimateCost, unchanged signature)
  catalog.ts                   (defaultModel values updated)
  types.ts                     (ModelInfo added)
```

`model-catalog.generated.ts` does not go away. It becomes the **fallback** a fresh install
starts from before any cache exists, generated the same way (fetched once, committed,
reviewable diff) but no longer regenerated by a developer command — `catalog-fetch.ts` is
now the only thing that calls `fetch("https://models.dev/api.json")`, and it runs inside the
product, not before it.

### Load sequence, kept synchronous

The hard constraint carried through this revision: **`modelInfo()` stays synchronous.**
`estimateCost`, `renderHeader`, and `SessionController.pushSummaries` call it today without
`await`, and turning it `async` would force `await` onto `renderHeader()` and
`pushSummaries()` and everything that calls them — a change to the TUI's call shape to solve
a data-freshness problem, which is disproportionate to the gain.

So the catalog is loaded into memory once, synchronously, before any `modelInfo()` call can
happen, and refreshed in the background for the *next* load:

1. On CLI startup (`src/cli/index.ts`, next to where `globalKodaRoot` is already resolved),
   read `~/.config/koda/catalog-cache.json` synchronously (`readFileSync`, mirroring how
   `authFilePath` already resolves under `globalKodaRoot`).
   - Cache present and parses: that becomes the in-memory table for this process.
   - Cache absent, corrupt, or unparseable: fall back to `model-catalog.generated.ts`.
2. Compute the cache's age from a `fetchedAt` field inside the file. If the cache is
   missing or older than `CACHE_TTL_MS` (7 days), fire `refreshCatalogInBackground()` and do
   not await it. The call returns immediately; the session proceeds on whatever table step 1
   produced (cache or fallback).
3. `refreshCatalogInBackground()` runs `catalog-fetch.ts`'s fetch-and-filter, and on success
   writes the new table plus `fetchedAt` to `catalog-cache.json`. On any failure — network
   down, bad JSON, write permission — it is swallowed and logged at debug level only.
   Nothing about session behaviour changes when this fails; the session already started with
   the fallback or the old cache.
4. The *next* process start reads the updated cache from step 1.

One session's cost readout can therefore be up to one TTL window stale, and the very first
run on a machine with no network ever shows the fallback snapshot's prices. Both are the
honest trade-off of "never block, never go async" and are called out in Risks.

### Lookup layer

`model-catalog.ts` keeps the same public shape as the generated-only design:

- `modelInfo(provider, model)` returns `ModelInfo | undefined`, reading the in-memory table
  that was selected at startup (cache or fallback).
- Lookup is by exact id. No alias guessing: if a user types a `-latest` alias KODA cannot
  resolve, the answer is `undefined` and the UI honestly shows `N/A`.
- `ollama` returns a fixed zero-cost entry, same as before; it has no models.dev source
  whether fetched at build time or at runtime.

`pricing.ts` keeps its exported signature, `estimateCost(provider, model, usage)`, and the
same per-million-token arithmetic. No caller changes, and no caller becomes `async`.

### `catalog-fetch.ts`

This module is `scripts/refresh-catalog.ts` moved into `src/providers/catalog/` and split
from its file-writing concern:

- `fetchModelCatalog(fetchImpl?)` — does the HTTP GET, the per-provider mapping
  (`gemini` → upstream `google`), the usability filter (`tool_call === true`, text output,
  not deprecated), and returns the same `Record<ProviderName, Record<string, ModelInfo>>`
  shape `model-catalog.generated.ts` exports. Accepts an injected `fetch` so tests never hit
  the real network.
- No file writing, no prettier invocation. That concern moves to `catalog-cache.ts`.

### `catalog-cache.ts`

- `readCache(configRoot)` — synchronous read + `JSON.parse` of `catalog-cache.json`; returns
  `undefined` on any failure (missing file, bad JSON, schema mismatch).
- `writeCache(configRoot, table)` — serializes `{ fetchedAt, table }` and writes it;
  swallows write failures (e.g. read-only filesystem) rather than throwing.
- `isStale(cache, now)` — `now - cache.fetchedAt > CACHE_TTL_MS`.

### Model discovery

Unchanged from the generated-module draft: `list-models.ts` grows two readers alongside the
existing `listChatModels`, over a shared request helper that does status checking, JSON
parsing and `toProviderError` wrapping:

- `listAnthropicModels` — `x-api-key` plus `anthropic-version`, `lifecycle=active`,
  `limit=1000`, reads `data[].id`, follows `has_more` via `after_id`.
- `listGeminiModels` — `x-goog-api-key`, filters `supportedGenerationMethods` for
  `generateContent`, strips the `models/` prefix, follows `nextPageToken`.

Both loops are capped at a small number of pages so a misbehaving endpoint cannot spin
forever. `vendors.ts` adds `listModels()` to `AnthropicProvider` and `GeminiProvider`.
`ILLMProvider`, `application.ts` and `model-command.ts` are unchanged.

### Tests

- `test/model-catalog.test.ts` — the staleness guard, now exercising the fallback table
  (`model-catalog.generated.ts`) directly, since that is what ships and what a test run with
  no cache on disk resolves to. For each hosted provider (openai, anthropic, gemini), the
  `defaultModel` resolves to a `ModelInfo` with a price, a context limit, and
  `toolCall: true`. Ollama is checked separately for tool support and zero cost only, since
  it has no upstream catalog source to supply a limit. Also covers `undefined` for an
  unknown model and `estimateCost` end to end.
- `test/catalog-fetch.test.ts` — `fetchModelCatalog` against `test/helpers/fake-fetch.ts`:
  the usability filter, the `gemini`→`google` mapping, and a malformed-response path that
  returns an empty table rather than throwing.
- `test/catalog-cache.test.ts` — `readCache`/`writeCache`/`isStale` against a temporary
  directory: missing file, corrupt JSON, TTL boundary, and that a write failure does not
  throw.
- `test/catalog-startup.test.ts` — `initCatalog` with an injected `fetch`: a fresh cache is
  used with no request, a stale cache is used now and refreshed for next time, a missing
  cache triggers a refresh, and a failed refresh writes nothing. `initCatalog` returns a
  promise only so tests can wait for the refresh; the CLI does not await it. A refresh that
  yields an empty table (the fetch failed) does not overwrite an existing cache.
- `test/cli.test.ts` injects an offline `fetch` through `CliEnvironment.fetch`, so running
  the CLI under test never contacts models.dev.
- `test/list-models.test.ts` — Anthropic and Gemini listing against the existing
  `test/helpers/fake-fetch.ts`: header placement, the `lifecycle=active` query, the
  `generateContent` filter, `models/` prefix stripping, pagination, and the error path.
- `test/provider-wire.test.ts` stays untouched. It is the parity record for
  `migrate-to-ai-sdk` and adding new assertions to it would blur what it proves.

No test touches the real `models.dev` endpoint; `fetchModelCatalog` always takes an injected
`fetch` in tests, the same pattern `test/provider-wire.test.ts` already established.

### Build plumbing

None. `scripts/refresh-catalog.ts` and the `catalog:refresh` npm script are removed; nothing
new is added to `tsconfig.json` `include` or to the prettier globs, since everything lives
under `src/` and `test/`, which were already covered.

## Alternatives considered

- **Hand-retype the table with current numbers.** Cheapest option, zero new machinery, and
  it is exactly what produced the bug. The Anthropic row in the current table is not merely
  stale, it is wrong by 50%, and while researching this change I found secondary sources
  contradicting each other on current Claude prices. Rejected: it buys a few months and
  reintroduces the same failure.

- **Build-time generated module, refreshed by a developer-run script.** This was the
  original design: `scripts/refresh-catalog.ts`, run by hand with `npm run catalog:refresh`,
  writing a committed TypeScript module. It kept runtime fully offline and deterministic,
  and it is still the simpler design. Rejected on explicit user instruction: it requires a
  human to remember to run a command outside normal usage, and the fetch logic must live in
  `src/`, not in a separate `scripts/` tree. The risk this choice reopens — the fallback
  snapshot going stale between releases — is accepted and mitigated by the background
  refresh instead: once a user runs KODA with network access, the cache catches up on its
  own without anyone running a command.

- **Fetch models.dev at runtime with no disk cache, blocking on every start.** Always
  fresh, no stale window ever. Rejected: a mandatory network call before the CLI can show a
  prompt, and no way to work offline at all.

- **Fetch models.dev at runtime, exposing `modelInfo` as `async`.** Removes the staleness
  window on first use, at the cost of threading `await` through `estimateCost`,
  `renderHeader`, and `SessionController.pushSummaries`. Rejected: a TUI-wide shape change to
  solve a data-freshness problem. The chosen design gets the same runtime fetch without that
  cost, by doing the fetch for the *next* session rather than the current one.

- **Depend on a models.dev npm client.** Rejected: it does not remove the network question
  this design already answers directly, it only hides where the `fetch` happens.

- **Generate JSON instead of TypeScript for the fallback snapshot.** Rejected on toolchain
  grounds: it falls outside `tsc` and prettier and needs import-attribute or
  `resolveJsonModule` support for no benefit over a `.ts` module.

- **Resolve `-latest` aliases through a hand-maintained map.** Would let a user typing
  `claude-sonnet-latest` see a price. Rejected: a hand-maintained map is the thing this
  change is removing, and a wrong resolution bills at the wrong rate. `N/A` is the honest
  answer.

- **Put model listing behind the AI SDK.** The AI SDK has no cross-vendor model discovery,
  which is already why `listChatModels` is a plain `fetch`. Nothing to delegate to.

- **Add `listModels` to `ILLMProvider` as required.** Rejected: it is already optional, and
  a future provider without a listing endpoint should not be forced to throw.

## Risks

- **Every default model changes, and defaults are what unconfigured users get.** A model
  that reasons differently can break the agent loop in ways a unit test will not catch.
  Mitigation: the per-provider smoke test with real keys, listed as a task. This is the task
  that went unexecuted on `migrate-to-ai-sdk`; open question 3 in the proposal asks for a
  commitment before the work starts, with a narrower fallback of changing only the Anthropic
  default.

- **Cost goes up for Gemini users on defaults**, $0.30 / $2.50 to $0.75 / $3.75. Mitigation:
  `GEMINI_MODEL` still overrides, and the change is called out in the changelog. Open
  question 2 offers the price-neutral alternative.

- **models.dev can be wrong or unreachable at runtime.** Mitigation: a failed or malformed
  background fetch is swallowed and the process keeps whatever table (cache or fallback) it
  already loaded. The fallback snapshot itself still ships as a reviewable diff when it is
  regenerated for a release, so a bad fallback value is still caught in review; only the
  background refresh is unreviewed, and it only ever replaces data with newer data from the
  same source the fallback was generated from.

- **A session can read a stale cache for up to one TTL window (7 days), and the very first
  run on a machine with no network sees only the fallback snapshot's prices.** This is the
  direct cost of "never block, never go async." Mitigation: the fallback snapshot is
  refreshed at release time the same way it always was, so even the worst case (no network,
  ever) reflects prices current as of the last KODA release rather than a years-old table.

- **The fallback snapshot will go stale between releases**, same as the old generated
  module would. The guard test proves the fallback's defaults are priced and not deprecated;
  it cannot prove a newer model exists. Honest limitation shared with the rejected
  build-time-only design: staleness of the floor is still possible, only the ceiling
  (a user who has run KODA online recently) is fixed by the background refresh.

- **The cache file can be corrupted, truncated, or hold a schema from a future KODA
  version.** Mitigation: `readCache` treats any parse or shape failure as "no cache," never
  as a crash, falling back to the shipped snapshot.

- **A background fetch for one session could still be in flight when the process exits.**
  Mitigation: the write only happens after the fetch resolves; a process that exits first
  simply loses that one refresh attempt, with no partial or corrupt write, and the next
  session tries again if the cache is still stale.

- **Listing endpoints can change shape.** Mitigation: both readers parse defensively and
  funnel failures through `toProviderError`, and `model-command.ts` already degrades to a
  warning rather than crashing the session.

- **An API key could leak into a URL or a log.** Mitigation: both new readers send
  credentials in headers, never in query strings, and the error messages go through
  `describeFailure`, which reports status only.

## Sequencing

This should land before `context-window-limits`, which reverses the order in the current
priority list. `context-window-limits` declares `catalog-model-limits`, a requirement that
the catalog knows each model's context and output limits. The generated module supplies
exactly that data. Landing `catalog-refresh` first means that change consumes generated
limits; landing it second means hand-writing a second table and then deleting it.
