export const PROVIDER_NAMES = [
  "openai",
  "anthropic",
  "gemini",
  "ollama",
] as const;

export type ProviderName = (typeof PROVIDER_NAMES)[number];

export const DEFAULT_PROVIDER: ProviderName = "openai";

export const DEFAULT_MODELS: Readonly<Record<ProviderName, string>> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-sonnet-latest",
  gemini: "gemini-2.5-flash",
  ollama: "llama3.2",
};

export const MODEL_ENV_VARIABLES: Readonly<Record<ProviderName, string>> = {
  openai: "OPENAI_MODEL",
  anthropic: "ANTHROPIC_MODEL",
  gemini: "GEMINI_MODEL",
  ollama: "OLLAMA_MODEL",
};

export interface ProviderIdentity {
  readonly provider: string;
  readonly model: string;
}

export function isProviderName(value: string): value is ProviderName {
  return (PROVIDER_NAMES as readonly string[]).includes(value);
}

export function optionalEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function selectedProvider(env: NodeJS.ProcessEnv): string {
  return env.KODA_PROVIDER ?? env.OPENCODE_PROVIDER ?? DEFAULT_PROVIDER;
}

export function resolveProviderIdentity(
  env: NodeJS.ProcessEnv,
): ProviderIdentity {
  const provider = selectedProvider(env);
  const known = isProviderName(provider) ? provider : DEFAULT_PROVIDER;
  const model =
    optionalEnv(env[MODEL_ENV_VARIABLES[known]]) ?? DEFAULT_MODELS[known];
  return { provider, model };
}
