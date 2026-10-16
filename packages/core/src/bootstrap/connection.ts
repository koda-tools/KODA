import {
  authFilePath,
  readAuth,
  withStoredCredentials,
} from "../providers/index.js";
import { globalRoots } from "./roots.js";

/** Where credentials are saved and the environment they take effect in. */
export interface Connection {
  readonly authFile: string;
  /** Updated in place so a running session sees a newly saved key. */
  readonly env: NodeJS.ProcessEnv;
  /** Whether the host explicitly selected a provider before stored defaults were merged. */
  readonly providerFromEnvironment?: boolean;
}

export interface ConnectionOptions {
  readonly env: NodeJS.ProcessEnv;
  readonly configRoot?: string | undefined;
}

/** `env` plus the credentials saved in the global config; real variables win. */
export async function loadConnection(
  options: ConnectionOptions,
): Promise<Connection> {
  const authFile = authFilePath(globalRoots(options.configRoot).globalKodaRoot);
  const auth = await readAuth(authFile);
  return {
    authFile,
    env: withStoredCredentials(options.env, auth),
    providerFromEnvironment: Boolean(
      options.env.KODA_PROVIDER?.trim() ||
        options.env.OPENCODE_PROVIDER?.trim(),
    ),
  };
}
