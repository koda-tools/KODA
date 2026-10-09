import type { KeyEvent } from "@termuijs/core";
import { LAYOUT, PROMPT_PLACEHOLDER, PROMPT_TITLE } from "./constants.js";
import { TitledTextArea } from "./titled-text-area.js";

const SECRET_MASK = "•";
const PRINTABLE = /^[^\u0000-\u001f\u007f]+$/u;

/**
 * Multi-line prompt on TermUI's `TextArea`
 * (https://www.termui.io/components/text-area) that grows with its content,
 * labeled in its top border. `AppBuilder` only routes keys to List/TextInput,
 * so the runtime forwards keys here, and focus (which draws the cursor) is
 * managed manually.
 */
export class Prompt {
  public readonly widget = new TitledTextArea(
    PROMPT_TITLE,
    {
      flexGrow: 0,
      flexShrink: 0,
      border: "single",
      borderColor: { type: "named", name: "cyan" },
    },
    {
      rows: LAYOUT.promptMinRows,
      placeholder: PROMPT_PLACEHOLDER,
      onChange: () => this.changed(),
    },
  );
  private readonly listeners = new Set<(value: string) => void>();
  /** The real text while in secret mode; `undefined` otherwise. */
  private secret: string | undefined;

  public get value(): string {
    return this.widget.value;
  }

  /** Called after every edit, including `take()` and `replace()`. */
  public onChange(listener: (value: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Replaces the text and puts the cursor at its end (single line). */
  public replace(text: string): void {
    this.widget.value = "";
    for (const char of text) this.widget.insertChar(char);
  }

  /** Label in the top border, e.g. `Message · build`. */
  public setTitle(title: string): void {
    this.widget.setTitle(title);
  }

  public set focused(focused: boolean) {
    this.widget.isFocused = focused;
  }

  public get isSingleLine(): boolean {
    return !this.widget.value.includes("\n");
  }

  public get isEmpty(): boolean {
    return this.widget.value === "";
  }

  public handleKey(event: KeyEvent): void {
    if (this.secret === undefined) this.widget.handleKey(event);
    else this.handleSecretKey(event);
  }

  /** Mask what is typed (API keys): the widget shows `•`, we keep the text. */
  public beginSecret(): void {
    this.widget.value = "";
    this.secret = "";
    this.changed();
  }

  public endSecret(): void {
    this.secret = undefined;
    this.widget.value = "";
    this.changed();
  }

  private handleSecretKey(event: KeyEvent): void {
    if (this.secret === undefined) return;
    if (event.key === "backspace") {
      this.secret = this.secret.slice(0, -1);
      this.widget.handleKey(event);
      return;
    }
    // Typed or pasted printable text; named keys (arrows…) are ignored.
    const text = event.ctrl || event.alt ? "" : event.raw.toString("utf8");
    if (!PRINTABLE.test(text)) return;
    this.secret += text;
    for (const _char of text) this.widget.insertChar(SECRET_MASK);
  }

  public insertNewline(): void {
    this.widget.insertNewline();
  }

  /** Return the text and clear the field. */
  public take(): string {
    const value = this.secret ?? this.widget.value;
    if (this.secret !== undefined) this.secret = "";
    this.widget.value = "";
    this.changed();
    return value;
  }

  private changed(): void {
    this.resize();
    for (const listener of this.listeners) listener(this.widget.value);
  }

  private resize(): void {
    const lines = this.widget.value.split("\n").length;
    const rows = Math.min(
      LAYOUT.promptMaxRows,
      Math.max(LAYOUT.promptMinRows, lines),
    );
    this.widget.setStyle({ height: rows + LAYOUT.borderRows });
  }
}
