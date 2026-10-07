import { app, logView, text, type AppBuilder } from "@termuijs/quick";
import { LAYOUT, PROMPT_HINT, REFRESH_INTERVAL } from "./constants.js";
import type { ConversationStore, LayoutParts } from "./types.js";

/** Header pinned at a fixed height: quick's `logView()` sets `flexGrow: 1`. */
function createHeader(store: ConversationStore): ReturnType<typeof logView> {
  const header = logView((): string[] => {
    const value = store.getState().header;
    return value === "" ? [] : value.split("\n");
  });
  header.setStyle({ flexGrow: 0, flexShrink: 0, height: LAYOUT.headerHeight });
  return header;
}

/**
 * Top to bottom: header, output (fills the rest), tool call, diff, choice
 * list, spinner, command suggestions, prompt, key hints. Slots collapse to
 * 0 rows when empty.
 */
export function buildApp(parts: LayoutParts): AppBuilder {
  return app("KODA")
    .rows(
      createHeader(parts.store),
      parts.transcript.createRow(),
      parts.toolSlot.widget,
      parts.diffPanel.widget,
      parts.choices.widget,
      parts.spinner,
      parts.suggestions.widget,
      parts.prompt.widget,
      text(PROMPT_HINT, { dim: true }),
    )
    .refresh(REFRESH_INTERVAL);
}
