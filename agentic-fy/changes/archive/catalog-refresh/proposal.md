# Proposal — catalog-refresh

## Why

The provider catalog is hand-written and has gone stale. Three separate symptoms, one cause.

**1. The default models are old, and one of them no longer exists in any public catalog.**

| Provider | KODA default | Released | Context | Price in/out |
| --- | --- | --- | --- | --- |
| openai | `gpt-4o-mini` | 2024-07-18 | 128,000 | $0.15 / $0.60 |
| anthropic | `claude-3-5-sonnet-latest` | — | — | — |
| gemini | `gemini-2.5-flash` | 2025-06-17 | 1,048,576 | $0.30 / $2.50 |
| ollama | `llama3.2` | — | — | — |

`claude-3-5-sonnet-latest` has no entry in the models.dev catalog at all. KODA's Anthropic
default points at an alias of a model two generations behind the current Sonnet line, and
nothing in the build notices.

**2. The price table covers three models.** `src/providers/catalog/pricing.ts` prices
exactly `openai/gpt-4o-mini`, `anthropic/claude-3-5-sonnet-latest` and
`gemini/gemini-2.5-flash`. Every other model returns `undefined`, and `formatCost`
renders `N/A`. So the moment a user runs `/model` and picks anything else, the cost
readout in the header and the sidebar goes blank and stays blank for the session.

Worse, the one Anthropic price it does carry ($3 / $15) is the old Sonnet 3.5 rate. Current
Sonnet 5.5 is $2 / $10. A hand-typed table does not just go missing, it goes wrong.

**3. `/model` is empty for Anthropic and Gemini.** `listModels` is implemented only on the
OpenAI-shaped providers, which share `GET {baseURL}/models`. `AnthropicProvider` and
`GeminiProvider` inherit nothing, so `application.ts` bails out of the picker when the list
comes back empty. Both vendors do publish a model-listing endpoint; KODA just never calls it.

These are the same problem wearing three hats: catalog facts live as literals that a human
has to remember to update, and no test fails when they rot.

## What

Stop hand-typing catalog facts. Source them from models.dev, refreshed at runtime.

- KODA ships a snapshot of `https://models.dev/api.json` with the fields it actually uses:
  price, context limit, output limit, tool support, release date. At startup it reads a disk
  cache (`~/.config/koda/catalog-cache.json`) synchronously; when the cache is missing or
  older than 7 days it refreshes it in the background for the next session. The session
  never waits on the network. (Revised during apply: the first draft used a build-time
  script; see design.md.)
- `estimateCost` reads that catalog instead of a three-entry literal, so cost shows up for
  every priced model rather than three.
- Default models move to current, tool-capable, non-deprecated ids that keep the
  `temperature` KODA sends.
- `listModels` gets Anthropic and Gemini implementations, so `/model` lists real models on
  all four providers with no TUI change.
- A test fails the build when a default model has no price, has no limits, or is marked
  deprecated. That is the part that keeps this from happening again.

Picking models.dev is deliberate. While researching this I found secondary sources
disagreeing with each other on current Claude prices. Transcribing numbers from blog posts
into a literal is how the table got wrong in the first place.

## Scope

- In scope:
  - Shipped catalog snapshot, runtime fetch and disk cache under `src/providers/catalog/`.
  - `estimateCost` sourcing price from the catalog; zero cost for the local provider.
  - New default models for openai, anthropic, gemini.
  - `listModels` for Anthropic (`GET /v1/models`) and Gemini (`GET /v1beta/models`).
  - Staleness guard test over the defaults.

- Out of scope:
  - Using the generated context and output limits to cap requests or compact history.
    The module will carry `limit.context` and `limit.output` because
    `context-window-limits` needs them, but consuming them belongs to that change.
  - Cached-token pricing. models.dev exposes `cache_read` and `cache_write`; KODA's `Usage`
    has nowhere to put them. That is `prompt-caching`.
  - New providers or widening `ProviderName`. That is `add-providers`.
  - A new default model for ollama. models.dev has no `ollama` provider entry, so there is
    no source to generate from and I will not guess. Open question below.

## Open questions

All three were answered before apply: keep `llama3.2`, accept the Gemini price increase,
and the user runs the smoke test.

1. **Ollama default.** `llama3.2` is the current default and models.dev does not carry the
   provider, so the generator cannot supply a replacement. Keep `llama3.2`, or do you have a
   local model you actually run?
2. **Gemini default costs more.** The flash-tier successor `gemini-3.8-flash` is
   $0.75 / $3.75 against the current $0.30 / $2.50. Staying at that price point means
   `gemini-3.5-flash-lite`, a weaker lite-tier model. I lean toward `gemini-3.8-flash` and
   documenting the increase, since a coding agent that reasons badly costs more in retries
   than it saves per token.
3. **Will you run the smoke test?** `migrate-to-ai-sdk` was archived with its
   real-key smoke test never executed. Changing every default model is exactly the kind of
   change that test exists to catch. If you will not run it, I would rather know now and
   narrow the default changes to Anthropic alone, where the current default is provably
   broken.
