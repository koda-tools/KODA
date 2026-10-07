import type { ChatMessage, Usage } from "../../providers/base.provider.js";
import { accumulateUsage } from "../commands/router.js";
import { renderHeader } from "./header.js";
import type { InteractiveIO } from "./io.js";
import type { LineWriter } from "./output.js";

export interface SessionIdentity {
  readonly provider: string;
  readonly model: string;
}

const MAX_HISTORY_MESSAGES = 40;

function trimHistory(history: readonly ChatMessage[]): ChatMessage[] {
  let start = Math.max(0, history.length - MAX_HISTORY_MESSAGES);
  while (start < history.length && history[start]?.role !== "user") start += 1;
  return history.slice(start);
}

export class Session {
  private usage: Usage = {};
  private selectedModel: string;
  private active: AbortController | undefined;
  private history: ChatMessage[] = [];

  public constructor(
    private readonly identity: SessionIdentity,
    private readonly io: InteractiveIO,
    private readonly writer: LineWriter,
  ) {
    this.selectedModel = identity.model;
  }

  public get model(): string {
    return this.selectedModel;
  }

  public selectModel(model: string): void {
    this.selectedModel = model;
    this.showHeader();
  }

  public modelOverride(commandModel: string | undefined): string | undefined {
    if (commandModel !== undefined) return commandModel;
    return this.selectedModel === this.identity.model
      ? undefined
      : `${this.identity.provider}/${this.selectedModel}`;
  }

  public startRequest(): AbortSignal {
    this.active = new AbortController();
    return this.active.signal;
  }

  public abortRequest(): boolean {
    if (this.active === undefined) return false;
    this.active.abort();
    return true;
  }

  public finishRequest(): boolean {
    const cancelled = this.active?.signal.aborted === true;
    this.active = undefined;
    return cancelled;
  }

  public completeRequest(used: Usage, modelOverride?: string): void {
    this.active = undefined;
    this.usage = accumulateUsage(this.usage, used);
    this.writer.ensureNewLine();
    this.showHeader(modelOverride);
  }

  public conversation(): readonly ChatMessage[] {
    return this.history;
  }

  public appendTurn(messages: readonly ChatMessage[]): void {
    this.history.push(...messages);
    this.history = trimHistory(this.history);
  }

  public clearConversation(): void {
    this.history = [];
    this.showHeader();
  }

  public showHeader(model: string = this.selectedModel): void {
    const text = renderHeader({
      provider: this.identity.provider,
      model,
      usage: this.usage,
    });
    if (this.io.setHeader === undefined) this.writer.write(`${text}\n`);
    else this.io.setHeader(text);
  }
}
