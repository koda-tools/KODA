import type { InteractiveIO } from "../shared/types.js";

const WAITING_STATUS = "Waiting for decision...";
const SELECT_HINT = "↑/↓ choose · Enter confirm · Esc reject";
/** Index 0 approves. */
const DECISION_OPTIONS = ["Accept", "Reject"] as const;

async function confirmByLine(
  io: InteractiveIO,
  question: string,
): Promise<boolean> {
  const answer = await io.question(question);
  return answer?.trim().toLowerCase() === "y";
}

/**
 * Ask the user to approve an action (file write, shell command). Uses the
 * selection widget when available, otherwise a `[y/N]` line prompt.
 */
export async function decide(
  io: InteractiveIO,
  title: string,
  fallbackPrompt: string,
): Promise<boolean> {
  io.setStatus?.(WAITING_STATUS);
  try {
    if (io.select === undefined) return await confirmByLine(io, fallbackPrompt);
    const choice = await io.select({
      title,
      options: [...DECISION_OPTIONS],
      hint: SELECT_HINT,
    });
    return choice === 0;
  } finally {
    io.setStatus?.(undefined);
  }
}
