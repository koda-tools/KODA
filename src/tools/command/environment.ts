/** Variables always forwarded to the child, when present in the parent. */
const SAFE_NAMES: readonly string[] = [
  "PATH",
  "Path",
  "HOME",
  "USERPROFILE",
  "NODE_ENV",
  "LANG",
  "LC_ALL",
  "TZ",
  "TEMP",
  "TMP",
  "TMPDIR",
  "SystemRoot",
  "ComSpec",
  "PATHEXT",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "no_proxy",
];

/** Names that look like secrets are dropped even when explicitly provided. */
const SECRET_NAME = /(?:_|^)(?:API_?KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|PRIVATE_?KEY)S?(?:_|$)/i;

function assign(
  target: Record<string, string>,
  name: string,
  value: string | undefined,
): void {
  if (value !== undefined && !SECRET_NAME.test(name)) target[name] = value;
}

/**
 * Builds the child environment from an allowlist of the parent plus
 * operator extras, never forwarding credential-looking variables.
 */
export function buildEnv(
  parent: NodeJS.ProcessEnv,
  extra: Readonly<Record<string, string>> = {},
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of SAFE_NAMES) assign(env, name, parent[name]);
  for (const [name, value] of Object.entries(extra)) assign(env, name, value);
  return env;
}
