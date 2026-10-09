import { createInterface } from "node:readline";
import { Writable } from "node:stream";

import type { ConnectUI } from "./types.js";

export interface ReadlineConnectUI {
  readonly ui: ConnectUI;
  readonly close: () => void;
}

/**
 * Plain-terminal version of the connect UI for `koda connect`, which runs
 * before (and without) the TUI. Secrets are typed with echo turned off.
 */
export function createReadlineUI(
  input: NodeJS.ReadableStream,
  output: Pick<NodeJS.WriteStream, "write">,
): ReadlineConnectUI {
  let echo = true;
  const sink = new Writable({
    write(chunk: Buffer | string, _encoding, done) {
      if (echo) output.write(chunk.toString());
      done();
    },
  });
  const lines = createInterface({ input, output: sink, terminal: true });
  const closed = new Promise<undefined>((resolve) =>
    lines.once("close", () => resolve(undefined)),
  );
  const ask = (prompt: string): Promise<string | undefined> =>
    Promise.race([
      new Promise<string>((resolve) => lines.question(prompt, resolve)),
      closed,
    ]);
  const ui: ConnectUI = {
    write: (text) => {
      output.write(text);
    },
    select: async (title, options) => {
      output.write(`${title.replace(/\s*\(.*\):$/, ":")}\n`);
      options.forEach((option, index) =>
        output.write(`  ${index + 1}. ${option}\n`),
      );
      const answer = await ask(`Choose [1-${options.length}]: `);
      const index = Number(answer?.trim()) - 1;
      return Number.isInteger(index) && index >= 0 && index < options.length
        ? index
        : undefined;
    },
    secret: async (prompt) => {
      output.write(prompt);
      echo = false;
      try {
        return await ask("");
      } finally {
        echo = true;
        output.write("\n");
      }
    },
  };
  return { ui, close: () => lines.close() };
}
