/** Layout sizes in terminal rows. Collapsed slots take no space. */
export const LAYOUT = {
  // renderHeader() emits 8 lines; the box adds border (2) and padding (2).
  headerHeight: 12,
  diffExpandedHeight: 16,
  toolSlotExpandedHeight: 6,
  choiceMaxRows: 8,
  suggestionMaxRows: 6,
  borderRows: 2,
  promptMinRows: 1,
  promptMaxRows: 8,
  // Output box chrome: border (2) + padding (2).
  transcriptChromeRows: 4,
  // Used until the first layout pass reports the real output height.
  fallbackViewportLines: 20,
} as const;

/** How often to re-check the output height (terminal resize). */
export const SCROLL_SYNC_INTERVAL_MS = 200;
export const REFRESH_INTERVAL = "80ms";

export const PROMPT_PLACEHOLDER = "Write prompt here";
export const PROMPT_HINT =
  "Enter to send · Alt+Enter to new line · PgUp/PgDn scroll · Esc to cancel";
export const MODEL_PICKER_TITLE =
  "Swtich Model (↑/↓, Enter confirm, Esc cancel):";
