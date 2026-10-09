import { List } from "@termuijs/widgets";
import { LAYOUT } from "./constants.js";
import type { ChoiceListHooks } from "./types.js";

/**
 * The one TermUI `List` (https://www.termui.io/components/list) used for
 * every choice: `/model` and Accept/Reject. Being the only List in the
 * tree, the `AppBuilder` keeps it focused and routes ↑/↓/Enter to it.
 */
export class ChoiceList {
  public readonly widget = new List(
    { items: [], emptyMessage: "" },
    {
      height: 0,
      border: "single",
      borderColor: { type: "named", name: "yellow" },
    },
    (_item, index) => this.select(index),
  );
  private resolve: ((index: number | undefined) => void) | undefined;
  // Enter that confirms the list also reaches the app key handler right
  // after; this flag stops it from submitting the prompt too.
  private confirmedThisKey = false;

  public constructor(private readonly hooks: ChoiceListHooks) {}

  public get isOpen(): boolean {
    return this.resolve !== undefined;
  }

  /** True once, right after Enter confirmed a choice. */
  public consumeConfirmKey(): boolean {
    const confirmed = this.confirmedThisKey;
    this.confirmedThisKey = false;
    return confirmed;
  }

  /** Resolves with the chosen index, or `undefined` if cancelled. */
  public open(labels: readonly string[]): Promise<number | undefined> {
    this.close(undefined);
    if (labels.length === 0) return Promise.resolve(undefined);
    this.widget.setItems(
      labels.map((label, index) => ({ label, value: String(index) })),
    );
    const rows = Math.min(LAYOUT.choiceMaxRows, labels.length);
    this.widget.setStyle({ height: rows + LAYOUT.borderRows });
    this.hooks.onFocusChange(true);
    this.hooks.requestRender();
    return new Promise((resolve) => {
      this.resolve = resolve;
    });
  }

  public close(index: number | undefined): void {
    const resolve = this.resolve;
    if (resolve === undefined) return;
    this.resolve = undefined;
    this.widget.setItems([]);
    this.widget.setStyle({ height: 0 });
    this.hooks.onFocusChange(false);
    resolve(index);
  }

  private select(index: number): void {
    if (!this.isOpen) return;
    this.confirmedThisKey = true;
    this.close(index);
  }
}
