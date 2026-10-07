import type { KeyName } from "./key-parser.js";

export interface VisibleWindow {
  readonly text: string;
  readonly cursorOffset: number;
}

export class LineEditor {
  private chars: string[] = [];
  private position = 0;

  public get text(): string {
    return this.chars.join("");
  }

  public get isEmpty(): boolean {
    return this.chars.length === 0;
  }

  public reset(): void {
    this.chars = [];
    this.position = 0;
  }

  public insert(symbol: string): void {
    this.chars.splice(this.position, 0, symbol);
    this.position += 1;
  }

  public apply(name: KeyName): void {
    switch (name) {
      case "left":
        this.position = Math.max(0, this.position - 1);
        break;
      case "right":
        this.position = Math.min(this.chars.length, this.position + 1);
        break;
      case "home":
        this.position = 0;
        break;
      case "end":
        this.position = this.chars.length;
        break;
      case "delete":
        this.chars.splice(this.position, 1);
        break;
      case "backspace":
        this.removeBeforeCursor();
        break;
      case "clear-line":
        this.reset();
        break;
      case "kill-line":
        this.chars.splice(this.position);
        break;
      default:
        break;
    }
  }

  public visibleWindow(available: number): VisibleWindow {
    const width = Math.max(1, available);
    const start = Math.max(0, this.position - width + 1);
    return {
      text: this.chars.slice(start, start + width).join(""),
      cursorOffset: this.position - start,
    };
  }

  private removeBeforeCursor(): void {
    if (this.position === 0) return;
    this.chars.splice(this.position - 1, 1);
    this.position -= 1;
  }
}
