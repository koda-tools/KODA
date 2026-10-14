/** What the connect flow needs from a terminal, TUI or plain. */
export interface ConnectUI {
  /** Index of the chosen option, or `undefined` when cancelled. */
  readonly select: (
    title: string,
    options: readonly string[],
  ) => Promise<number | undefined>;
  /** Reads a secret without echoing it; `undefined` when cancelled. */
  readonly secret: (prompt: string) => Promise<string | undefined>;
  readonly write: (text: string) => void;
}

/** Where credentials are saved and the environment they take effect in. */
export interface ConnectionSettings {
  readonly authFile: string;
  /** Updated in place so the running session sees a new key. */
  readonly env: NodeJS.ProcessEnv;
}
