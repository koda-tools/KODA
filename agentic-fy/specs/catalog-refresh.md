# catalog-refresh

## Purpose
Keep model facts — price, limits, tool support — sourced from a maintained catalog instead of hand-typed, refreshed at runtime without ever blocking a session, so a stale default model fails the build instead of silently showing no cost.

## Requirements

### Requirement: Model facts come from a refreshed catalog, never blocking the session {#runtime-model-catalog}
The provider catalog SHALL resolve model price, context limit, output limit and tool support synchronously from a disk cache when one is present and valid, and otherwise from a snapshot shipped with KODA; when the cache is missing or older than its time-to-live it SHALL refresh it in the background for the next session, without delaying the current one and without failing when the network is unavailable.
> verify: `node --test --import tsx test/catalog-startup.test.ts test/catalog-cache.test.ts`

#### Scenario:
- WHEN a valid cache younger than its time-to-live exists
- THEN its facts are used and no network request is made

#### Scenario:
- WHEN the cache is missing or stale
- THEN the session starts on the facts it already has and a refreshed cache is written for the next session

#### Scenario:
- WHEN the refresh fails or the network is unavailable
- THEN the session continues unchanged and no cache is written

#### Scenario:
- WHEN the cache file is corrupt or has an unknown shape
- THEN it is ignored and the shipped snapshot is used

### Requirement: Only models a coding agent can drive enter the catalog {#catalog-usability-filter}
The catalog SHALL keep only models that support tool calling, produce text, accept a temperature parameter and are not deprecated, mapping each KODA provider to its upstream catalog entry.
> verify: `node --test --import tsx test/catalog-fetch.test.ts`

#### Scenario:
- WHEN an upstream model lacks tool calling, rejects temperature, is deprecated or outputs no text
- THEN it is absent from the catalog

#### Scenario:
- WHEN an upstream model has no price or no limits
- THEN it is kept without those facts rather than with invented ones

#### Scenario:
- WHEN the upstream response is an error or not the expected shape
- THEN the result is an empty catalog rather than a crash

### Requirement: Cost resolves for every catalogued model {#priced-models-from-catalog}
Cost estimation SHALL resolve a price for any model present in the catalog by exact identifier, keeping its existing provider-neutral signature and per-million-token arithmetic, SHALL report zero cost for the local provider, and SHALL report no estimate for models it cannot price.
> verify: `node --test --import tsx test/model-catalog.test.ts test/tui.test.ts`

#### Scenario:
- WHEN a user switches to any catalogued model and completes a turn
- THEN the session reports an estimated cost instead of a blank value

#### Scenario:
- WHEN the selected model is not in the catalog
- THEN the session reports no estimate rather than an incorrect one

#### Scenario:
- WHEN the local provider is used
- THEN the session reports zero cost, because local inference has no API spend

### Requirement: Default models are current, tool-capable and honour temperature {#current-default-models}
Each hosted provider's default model SHALL be an identifier the vendor currently serves, SHALL support tool calling, SHALL NOT be marked deprecated, and SHALL receive the temperature the agent sends rather than having it dropped by the vendor or by the transport.
> verify: `node --test --import tsx test/model-catalog.test.ts test/provider-wire.test.ts`

#### Scenario:
- WHEN a user runs KODA without setting a model environment variable
- THEN the selected default is a currently served, tool-capable model

#### Scenario:
- WHEN an agent sends a temperature on a default model
- THEN the temperature reaches the outgoing request

### Requirement: A stale default fails the build {#default-model-staleness-guard}
An automated test SHALL fail when any hosted provider's default model has no price, has no context limit, does not support tool calling, or belongs to a known family that drops temperature, so that catalog rot surfaces as a build failure instead of as a blank cost readout.
> verify: `node --test --import tsx test/model-catalog.test.ts`

#### Scenario:
- WHEN a default model is changed to an identifier missing from the shipped snapshot
- THEN the test suite fails and names the offending provider and model

#### Scenario:
- WHEN a default model is changed to a model known to drop temperature
- THEN the test suite fails and names the offending provider and model
