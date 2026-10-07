import type { InteractiveIO } from "./io.js";

const WAITING_STATUS = "Waiting for decision...";
const SELECT_HINT = "←↑↓→ select · enter confirm";
const DECISION_OPTIONS = ["Allow", "Reject"] as const;

async function confirmByLine(
  io: InteractiveIO,
  fallbackPrompt: string,
): Promise<boolean> {
  const answer = await io.question(fallbackPrompt);
  return answer?.trim().toLowerCase() === "y";
}

export async function decide(
  io: InteractiveIO,
  title: string,
  fallbackPrompt: string,
): Promise<boolean> {
  if (io.holdStatus !== undefined) io.holdStatus(WAITING_STATUS);
  else io.setStatus?.(WAITING_STATUS);
  try {
    if (io.select === undefined) return await confirmByLine(io, fallbackPrompt);
    const choice = await io.select({
      title,
      options: [...DECISION_OPTIONS],
      hint: SELECT_HINT,
    });
    return choice === 0;
  } finally {
    if (io.releaseStatus !== undefined) io.releaseStatus();
    else io.setStatus?.(undefined);
  }
}
