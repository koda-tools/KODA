export interface CommandSource {
  readonly path: string;
  readonly level: number;
  readonly kind: "markdown" | "json" | "jsonc";
}

export interface CustomCommand {
  readonly name: string;
  readonly template: string;
  readonly description?: string;
  readonly agent?: string;
  readonly model?: string;
  readonly subagent: boolean;
  readonly source: CommandSource;
}

export interface CommandDiagnostic {
  readonly path: string;
  readonly message: string;
}

export interface ShellPolicy {
  readonly allowNonInteractive?: boolean;
  readonly timeoutMs?: number;
  readonly maxOutputBytes?: number;
  readonly environment?: Readonly<Record<string, string>>;
  readonly approve?: (
    command: string,
    source: CommandSource,
  ) => Promise<boolean>;
}

export function assertCommandName(name: string): void {
  if (
    name === "" ||
    name
      .split("/")
      .some(
        (part) =>
          part === "" ||
          part === "." ||
          part === ".." ||
          /[\\\x00-\x1f]/.test(part),
      )
  )
    throw new Error(`Invalid command name '${name}'.`);
}

export function assertModel(model: string): void {
  if (
    !/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*(?:#[a-z0-9][a-z0-9._-]*)?$/i.test(
      model,
    )
  )
    throw new Error(`Invalid model identifier '${model}'.`);
}
