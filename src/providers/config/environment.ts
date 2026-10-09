import { ProviderError } from "../../utils/errors.js";
import {
  DEFAULT_PROVIDER,
  isProviderName,
  providerSpec,
} from "../catalog/catalog.js";
import type { ProviderName } from "../catalog/types.js";
import { optional } from "../shared/request.js";
import type { ProviderConfig, ProviderIdentity } from "./types.js";

/** Trims an environment value, treating blank strings as unset. */
export function optionalEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** Raw provider name chosen by the environment (may be unsupported). */
export function selectedProvider(env: NodeJS.ProcessEnv): string {
  return (
    optionalEnv(env.KODA_PROVIDER) ??
    optionalEnv(env.OPENCODE_PROVIDER) ??
    DEFAULT_PROVIDER
  );
}

export function providerFromEnvironment(env: NodeJS.ProcessEnv): ProviderName {
  const provider = selectedProvider(env);
  if (!isProviderName(provider))
    throw new ProviderError(`Unsupported provider '${provider}'.`);
  return provider;
}

function modelFromEnvironment(
  env: NodeJS.ProcessEnv,
  provider: ProviderName,
): string | undefined {
  return optionalEnv(env[providerSpec(provider).modelEnv]);
}

export function resolveProviderIdentity(
  env: NodeJS.ProcessEnv,
): ProviderIdentity {
  const provider = providerFromEnvironment(env);
  const model =
    modelFromEnvironment(env, provider) ?? providerSpec(provider).defaultModel;
  return { provider, model };
}

function requiredEnv(env: NodeJS.ProcessEnv, variable: string): string {
  const value = optionalEnv(env[variable]);
  if (value === undefined)
    throw new ProviderError(
      `Missing required environment variable ${variable}.`,
    );
  return value;
}

function variable(env: NodeJS.ProcessEnv, name: string | undefined) {
  return name === undefined ? undefined : optionalEnv(env[name]);
}

function toolSupport(value: string | undefined): boolean | undefined {
  return value === undefined ? undefined : value.toLowerCase() === "true";
}

/**
 * Builds a ProviderConfig from environment variables declared in the catalog.
 * `provider` picks a specific provider (e.g. an agent's `model`) instead of
 * the one selected by KODA_PROVIDER; its key still comes from the environment.
 */
export function configFromEnvironment(
  env: NodeJS.ProcessEnv,
  provider: ProviderName = providerFromEnvironment(env),
): ProviderConfig {
  const spec = providerSpec(provider);
  const model = optional("model", modelFromEnvironment(env, provider));
  if (provider === "ollama")
    return {
      provider,
      ...model,
      ...optional("apiKey", variable(env, spec.apiKeyEnv)),
      ...optional("baseURL", variable(env, spec.baseURLEnv)),
      ...optional(
        "toolSupport",
        toolSupport(variable(env, spec.toolSupportEnv)),
      ),
    };
  return { provider, apiKey: requiredEnv(env, spec.apiKeyEnv), ...model };
}
