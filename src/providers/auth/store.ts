import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { ProviderError } from "../../utils/errors.js";
import {
  PROVIDER_NAMES,
  isProviderName,
  providerSpec,
} from "../catalog/catalog.js";
import type { ProviderName } from "../catalog/types.js";
import { optionalEnv } from "../config/environment.js";
import type { CredentialSource, StoredAuth, StoredApiKey } from "./types.js";

const AUTH_FILE = "auth.json";
const PROVIDER_ENV = "KODA_PROVIDER";
const FILE_MODE = 0o600;
const DIRECTORY_MODE = 0o700;

const EMPTY_AUTH: StoredAuth = { providers: {} };

/** Providers that need an API key (everything but local servers). */
export const CONNECTABLE_PROVIDERS: readonly ProviderName[] =
  PROVIDER_NAMES.filter((name) => providerSpec(name).apiKeyRequired);

export function authFilePath(configRoot: string): string {
  return path.join(configRoot, AUTH_FILE);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseApiKey(value: unknown): StoredApiKey | undefined {
  if (!isRecord(value) || value.type !== "api") return undefined;
  const key = typeof value.key === "string" ? value.key.trim() : "";
  return key === "" ? undefined : { type: "api", key };
}

function parseAuth(raw: string, file: string): StoredAuth {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new ProviderError(`${file} is not valid JSON.`);
  }
  if (!isRecord(data)) throw new ProviderError(`${file} is not an object.`);
  const providers: Partial<Record<ProviderName, StoredApiKey>> = {};
  if (isRecord(data.providers))
    for (const [name, value] of Object.entries(data.providers)) {
      const entry = parseApiKey(value);
      if (isProviderName(name) && entry !== undefined) providers[name] = entry;
    }
  const preferred = data.default;
  return typeof preferred === "string" && isProviderName(preferred)
    ? { default: preferred, providers }
    : { providers };
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/** Reads the stored credentials; a missing file means none. */
export async function readAuth(file: string): Promise<StoredAuth> {
  try {
    return parseAuth(await readFile(file, "utf8"), file);
  } catch (error: unknown) {
    if (isMissingFile(error)) return EMPTY_AUTH;
    throw error;
  }
}

async function writeAuth(file: string, auth: StoredAuth): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true, mode: DIRECTORY_MODE });
  await writeFile(file, `${JSON.stringify(auth, null, 2)}\n`, {
    mode: FILE_MODE,
  });
  // `mode` only applies when the file is created.
  await chmod(file, FILE_MODE).catch(() => undefined);
}

/**
 * Saves an API key. The first connected provider also becomes the default
 * one, so a plain `koda` works right after connecting.
 */
export async function saveApiKey(
  file: string,
  provider: ProviderName,
  key: string,
): Promise<StoredAuth> {
  const trimmed = key.trim();
  if (trimmed === "") throw new ProviderError("The API key is empty.");
  const current = await readAuth(file);
  const updated: StoredAuth = {
    default: current.default ?? provider,
    providers: {
      ...current.providers,
      [provider]: { type: "api", key: trimmed },
    },
  };
  await writeAuth(file, updated);
  return updated;
}

/** Removes a stored key; the default provider falls away with it. */
export async function removeApiKey(
  file: string,
  provider: ProviderName,
): Promise<StoredAuth> {
  const current = await readAuth(file);
  const { [provider]: _removed, ...providers } = current.providers;
  const updated: StoredAuth =
    current.default === undefined || current.default === provider
      ? { providers }
      : { default: current.default, providers };
  await writeAuth(file, updated);
  return updated;
}

/**
 * `env` plus the stored credentials. Real environment variables always win,
 * so exporting a key still overrides what `koda connect` saved.
 */
export function withStoredCredentials(
  env: NodeJS.ProcessEnv,
  auth: StoredAuth,
): NodeJS.ProcessEnv {
  const merged: NodeJS.ProcessEnv = { ...env };
  const fill = (name: string, value: string): void => {
    if (optionalEnv(merged[name]) === undefined) merged[name] = value;
  };
  for (const name of PROVIDER_NAMES) {
    const stored = auth.providers[name];
    if (stored !== undefined) fill(providerSpec(name).apiKeyEnv, stored.key);
  }
  if (auth.default !== undefined) fill(PROVIDER_ENV, auth.default);
  return merged;
}

/** `env` is the merged environment from `withStoredCredentials`. */
export function credentialSource(
  provider: ProviderName,
  env: NodeJS.ProcessEnv,
  auth: StoredAuth,
): CredentialSource {
  const value = optionalEnv(env[providerSpec(provider).apiKeyEnv]);
  if (value === undefined) return "none";
  return auth.providers[provider]?.key === value ? "saved" : "environment";
}
