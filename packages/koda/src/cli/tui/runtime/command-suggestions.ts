import { createKeyEvent, type KeyEvent } from "@termuijs/core";
import { Autocomplete } from "@termuijs/ui";
import {
  completion,
  matchSuggestions,
  slashQuery,
  suggestionLabel,
} from "../commands/suggestions.js";
import type { CommandSuggestion } from "../shared/types.js";
import { LAYOUT } from "./constants.js";
import type { PromptEditor } from "./types.js";

const NO_SELECTION = -1;
const CYAN = { type: "named", name: "cyan" } as const;
const COLLAPSED = {
  height: 0,
  width: "100%" as const,
  flexGrow: 0,
  flexShrink: 0,
  border: "none" as const,
};

function key(name: string): KeyEvent {
  return createKeyEvent({
    key: name,
    raw: Buffer.alloc(0),
    ctrl: false,
    alt: false,
    shift: false,
  });
}

/**
 * Slash-command dropdown above the prompt, drawn by TermUI's `Autocomplete`
 * (https://www.termui.io/components/autocomplete). The prompt stays the
 * `TextArea`; this only shows matches. `Autocomplete` keeps its selection
 * private, so the index is mirrored here with the same wrap-around rules.
 * Rendered without a Box wrapper, so the collapsed state truly takes no
 * space: a bordered Autocomplete inside a `height: 0` Box reserved the
 * border rows and pushed the rest of the layout to the right.
 */
export class CommandSuggestions {
  public readonly widget = new Autocomplete(COLLAPSED, {
    items: [],
    filter: () => true, // `update` already filters.
    maxSuggestions: LAYOUT.suggestionMaxRows,
  });
  private items: readonly CommandSuggestion[] = [];
  private matches: readonly CommandSuggestion[] = [];
  private selectedIndex = NO_SELECTION;

  public get isOpen(): boolean {
    return this.matches.length > 0;
  }

  public setItems(items: readonly CommandSuggestion[]): void {
    this.items = items;
  }

  /** Re-filters for the current prompt text; collapses when nothing fits. */
  public update(text: string): void {
    const query = slashQuery(text);
    this.matches =
      query === undefined ? [] : matchSuggestions(this.items, query);
    this.selectedIndex = NO_SELECTION;
    if (!this.isOpen) return this.collapse();
    this.widget.setItems(this.matches.map(suggestionLabel));
    // Typing the last character is the only public way to open the list.
    this.widget.query = text.slice(0, -1);
    this.widget.handleKey(key(text.slice(-1)));
    this.widget.isFocused = true;
    const rows = 1 + Math.min(this.matches.length, LAYOUT.suggestionMaxRows);
    this.widget.setStyle({
      width: "100%",
      flexGrow: 0,
      flexShrink: 0,
      height: rows + LAYOUT.borderRows,
      border: "single",
      borderColor: CYAN,
    });
  }

  public selected(): CommandSuggestion | undefined {
    return this.matches[this.selectedIndex];
  }

  /** Moves the highlight by one row, wrapping like `Autocomplete` does. */
  public move(direction: 1 | -1): void {
    const count = this.matches.length;
    if (count === 0) return;
    this.widget.handleKey(key(direction === 1 ? "down" : "up"));
    this.selectedIndex =
      direction === 1
        ? (this.selectedIndex + 1) % count
        : this.selectedIndex <= 0
          ? count - 1
          : this.selectedIndex - 1;
  }

  public close(): void {
    this.matches = [];
    this.selectedIndex = NO_SELECTION;
    this.collapse();
  }

  /**
   * Handles a key while the list is open. Returns false when the key is not
   * for the list (e.g. Enter without a selection submits the prompt).
   */
  public handleKey(event: KeyEvent, prompt: PromptEditor): boolean {
    if (!this.isOpen || event.ctrl || event.alt || event.shift) return false;
    switch (event.key) {
      case "down":
        this.move(1);
        return true;
      case "up":
        this.move(-1);
        return true;
      case "escape":
        this.close();
        return true;
      case "tab":
        if (this.selectedIndex === NO_SELECTION) this.move(1);
        return this.complete(prompt);
      case "enter":
      case "return":
        return this.complete(prompt);
      default:
        return false;
    }
  }

  private complete(prompt: PromptEditor): boolean {
    const item = this.selected();
    if (item === undefined) return false;
    this.close();
    prompt.replace(completion(item));
    return true;
  }

  private collapse(): void {
    this.widget.setItems([]);
    this.widget.query = "";
    this.widget.isFocused = false;
    this.widget.setStyle(COLLAPSED);
  }
}
