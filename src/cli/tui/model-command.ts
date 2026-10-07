export interface ModelCommandInput {
  readonly name: string | undefined;
  readonly current: string;
  readonly provider: string;
  readonly listModels: () => Promise<readonly string[] | undefined>;
}

export interface ModelCommandResult {
  readonly text: string;
  readonly selected?: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

function formatListing(
  available: readonly string[] | undefined,
  current: string,
): string {
  const header = `Current model: ${current}\n`;
  if (available === undefined) return `${header}Use /model <name> to switch.\n`;
  const rows = available.map(
    (name, index) => `${name === current ? "*" : " "} ${index + 1}. ${name}`,
  );
  return `${header}${rows.join("\n")}\nUse /model <name|number> to switch.\n`;
}

function chooseModel(
  name: string,
  provider: string,
  available: readonly string[] | undefined,
): string | undefined {
  const index = /^\d+$/.test(name) ? Number(name) : 0;
  if (available !== undefined && index > 0) return available[index - 1];
  const prefix = `${provider}/`;
  return name.startsWith(prefix) ? name.slice(prefix.length) : name;
}

function isKnown(
  model: string,
  available: readonly string[] | undefined,
): boolean {
  return (
    available === undefined ||
    available.length === 0 ||
    available.includes(model)
  );
}

export async function runModelCommand(
  input: ModelCommandInput,
): Promise<ModelCommandResult> {
  let warning = "";
  const available = await input.listModels().catch((error: unknown) => {
    warning = `Could not list models: ${errorMessage(error)}\n`;
    return undefined;
  });
  if (input.name === undefined)
    return { text: `${warning}${formatListing(available, input.current)}` };
  const chosen = chooseModel(input.name, input.provider, available);
  if (chosen === undefined || !isKnown(chosen, available))
    return {
      text: `${warning}Unknown model '${input.name}'. Run /model to list available models.\n`,
    };
  return { text: `${warning}Model set to ${chosen}.\n`, selected: chosen };
}
