import { app, text, type AppBuilder } from "@termuijs/quick";
import { Box } from "@termuijs/widgets";
import { PROMPT_HINT, REFRESH_INTERVAL } from "./constants.js";
import type { LayoutParts } from "./types.js";

/**
 * The chat column: output area (fills the rest), tool call, diff, choice
 * list, spinner, command suggestions, prompt. Empty slots collapse to 0
 * rows, so the output sits flush with the top and the prompt sits right
 * under it. Model/provider/usage live in the sidebar's CURRENT block.
 * Built as a vertical Box so it can sit beside the sidebar in a row.
 */
function createChatColumn(parts: LayoutParts): Box {
  const column = new Box({
    flexDirection: "column",
    flexGrow: 1,
    flexShrink: 1,
    height: "100%",
  });
  column.addChild(parts.transcript.createRow());
  column.addChild(parts.toolSlot.widget);
  column.addChild(parts.diffPanel.widget);
  column.addChild(parts.choices.widget);
  column.addChild(parts.spinner);
  column.addChild(parts.suggestions.widget);
  column.addChild(parts.prompt.widget);
  return column;
}

/**
 * The body: sidebar (fixed width, collapses to 0 when hidden) beside the
 * chat column. Not built with quick's `row()`, which forces `flexGrow: 1`
 * on fixed-width children and would split the width evenly.
 */
function createBody(parts: LayoutParts): Box {
  const body = new Box({
    flexDirection: "row",
    alignItems: "stretch",
    flexGrow: 1,
    flexShrink: 1,
    width: "100%",
  });
  body.addChild(parts.sidebar.widget);
  body.addChild(createChatColumn(parts));
  return body;
}

/**
 * Top to bottom: the two-column body (sidebar + chat) that fills the screen,
 * then the key-hints footer.
 */
export function buildApp(parts: LayoutParts): AppBuilder {
  // No title: the KODA logo already lives in the sidebar, and `AppBuilder`
  // always reserves a title bar row even when the title is empty.
  return app("")
    .rows(createBody(parts), text(PROMPT_HINT, { dim: true }))
    .refresh(REFRESH_INTERVAL);
}
