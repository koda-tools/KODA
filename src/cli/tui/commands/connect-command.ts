import { runConnect } from "../../connect/flow.js";
import type { ConnectionSettings, ConnectUI } from "../../connect/types.js";
import type { InteractiveIO } from "../shared/types.js";

async function selectByNumber(
  io: InteractiveIO,
  options: readonly string[],
): Promise<number | undefined> {
  io.write(`${options.map((o, i) => `  ${i + 1}. ${o}`).join("\n")}\n`);
  const index = Number((await io.question("Choose a number: "))?.trim()) - 1;
  return Number.isInteger(index) && index >= 0 && index < options.length
    ? index
    : undefined;
}

/** The connect flow on the TUI: list widget and a masked key prompt. */
export function createConnectUI(
  io: InteractiveIO,
  write: (text: string) => void,
): ConnectUI {
  return {
    write,
    select: (title, options) =>
      io.select === undefined
        ? selectByNumber(io, options)
        : io.select({ title, options }),
    secret: (prompt) =>
      io.askSecret === undefined ? io.question(prompt) : io.askSecret(prompt),
  };
}

/** `/connect [provider]`. */
export async function runConnectCommand(
  io: InteractiveIO,
  write: (text: string) => void,
  connection: ConnectionSettings | undefined,
  provider: string | undefined,
): Promise<void> {
  if (connection === undefined) {
    write("Connecting providers is not available in this session.\n");
    return;
  }
  await runConnect(createConnectUI(io, write), connection, provider);
}
