/** Layout sizes in terminal rows. Collapsed slots take no space. */
export const LAYOUT = {
  // renderHeader() emits 8 lines; the box adds border (2) and padding (2).
  headerHeight: 12,
  // Fixed sidebar column width in terminal columns.
  sidebarWidth: 28,
  diffExpandedHeight: 16,
  toolSlotExpandedHeight: 6,
  choiceMaxRows: 8,
  suggestionMaxRows: 6,
  borderRows: 2,
  promptMinRows: 1,
  promptMaxRows: 8,
  // Rows the message box adds around its text, inside the border: one
  // above the text and three below it (spacing, blank, footer).
  promptChromeRows: 4,
  // Bottom rows of the box without the accent bar: blank + footer.
  promptFooterRows: 2,
  // Output box chrome: border (2) + padding (2).
  transcriptChromeRows: 4,
  // Used until the first layout pass reports the real output height.
  fallbackViewportLines: 20,
} as const;

/** How often to re-check the output height (terminal resize). */
export const SCROLL_SYNC_INTERVAL_MS = 200;
export const REFRESH_INTERVAL = "80ms";

export const PROMPT_PLACEHOLDER = "Digite sua mensagem...";
/** Hint drawn at the right of the message box footer. */
export const PROMPT_SEND_HINT = "Enter ↵ enviar";
export const PROMPT_HINT =
  "Tab Agent · Alt+S Sessions · Ctrl+N New session · Ctrl+B Sidebar · Ctrl+Y Copy · Esc cancel";
export const MODEL_PICKER_TITLE =
  "Swtich Model (↑/↓, Enter confirm, Esc cancel):";
export const SESSION_PICKER_TITLE =
  "Switch session (↑/↓, Enter confirm, Esc cancel):";
