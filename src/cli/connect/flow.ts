import {
  CONNECTABLE_PROVIDERS,
  PROVIDERS,
  credentialSource,
  isProviderName,
  readAuth,
  saveApiKey,
  type CredentialSource,
  type ProviderName,
  type StoredAuth,
} from "../../providers/index.js";
import type { ConnectionSettings, ConnectUI } from "./types.js";

const SELECT_TITLE = "Connect a provider (↑/↓, Enter confirm, Esc cancel):";

const SOURCE_LABEL: Readonly<Record<CredentialSource, string>> = {
  saved: "✓ connected",
  environment: "✓ from environment",
  none: "not connected",
};

function providerLabel(
  provider: ProviderName,
  settings: ConnectionSettings,
  auth: StoredAuth,
): string {
  const source = credentialSource(provider, settings.env, auth);
  return `${provider.padEnd(10)} ${SOURCE_LABEL[source]}`;
}

async function chooseProvider(
  ui: ConnectUI,
  settings: ConnectionSettings,
  auth: StoredAuth,
  requested: string | undefined,
): Promise<ProviderName | undefined> {
  if (requested !== undefined) {
    const name = requested.toLowerCase();
    if (isProviderName(name) && CONNECTABLE_PROVIDERS.includes(name))
      return name;
    ui.write(
      `Unknown provider '${requested}'. Choose one of: ${CONNECTABLE_PROVIDERS.join(", ")}.\n`,
    );
    return undefined;
  }
  const labels = CONNECTABLE_PROVIDERS.map((name) =>
    providerLabel(name, settings, auth),
  );
  const index = await ui.select(SELECT_TITLE, labels);
  return index === undefined ? undefined : CONNECTABLE_PROVIDERS[index];
}

function followUp(provider: ProviderName, auth: StoredAuth): string {
  return auth.default === provider
    ? `${provider} is the default provider. Restart KODA to use it.\n`
    : `Restart KODA with KODA_PROVIDER=${provider} to use it.\n`;
}

/**
 * Pick a provider, read its API key and save it. The key is also put into
 * `settings.env`, so agents pinned to that provider work right away.
 * Returns true when a key was saved.
 */
export async function runConnect(
  ui: ConnectUI,
  settings: ConnectionSettings,
  requested?: string,
): Promise<boolean> {
  const before = await readAuth(settings.authFile);
  const provider = await chooseProvider(ui, settings, before, requested);
  if (provider === undefined) return false;
  const apiKeyEnv = PROVIDERS[provider].apiKeyEnv;
  const key = (
    await ui.secret(`Enter the ${provider} API key (${apiKeyEnv}): `)
  )?.trim();
  if (key === undefined || key === "") {
    ui.write("Nothing saved.\n");
    return false;
  }
  const saved = await saveApiKey(settings.authFile, provider, key);
  settings.env[apiKeyEnv] = key;
  ui.write(`Saved the ${provider} key to ${settings.authFile}.\n`);
  ui.write(followUp(provider, saved));
  return true;
}
