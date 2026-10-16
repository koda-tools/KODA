import type { KodaEvent } from "../contracts.js";
export interface KodaStream { markdown(value: string): void; progress(value: string): void; }

export function writeKodaEvent(stream: KodaStream, event: KodaEvent): void {
  switch (event.type) {
    case "agent.started": stream.markdown(`*KODA ${event.mode} started*`); return;
    case "agent.message": stream.markdown(event.text); return;
    case "tool.started": stream.progress(`KODA: ${event.call.name}`); return;
    case "tool.completed":
      if (!event.observation.ok) stream.markdown(`*Tool failed: ${event.observation.content}*`);
      return;
    case "error": stream.markdown(`\n\nKODA error: ${event.message}`); return;
    case "agent.completed": return;
  }
}
