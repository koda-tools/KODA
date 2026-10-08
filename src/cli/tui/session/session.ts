import type { ChatMessage, Usage } from "../../../providers/index.js";
import { sumUsage } from "../../../core/index.js";
import type { InteractiveIO, LineWriter } from "../shared/types.js";
import { renderHeader } from "./header.js";
import type { SessionIdentity, SessionStatus } from "./types.js";

const MAX_HISTORY_MESSAGES = 40;

/** Keep the newest messages, starting at a user turn (no orphan tool replies). */
function trimHistory(history: readonly ChatMessage[]): ChatMessage[] {
  let start = Math.max(0, history.length - MAX_HISTORY_MESSAGES);
  while (start < history.length && history[start]?.role !== "user") start += 1;
  return history.slice(start);
}

/** Conversation state for one interactive run: model, usage, history, abort. */
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

  public get provider(): string {
    return this.identity.provider;
  }

  /** Snapshot for the sidebar/summary: provider, model and running usage. */
  public status(): SessionStatus {
    return {
      provider: this.identity.provider,
      model: this.selectedModel,
      usage: this.usage,
    };
  }

  public selectModel(model: string): void {
    this.selectedModel = model;
    this.showHeader();
  }

  /** `provider/model` to send when the user switched away from the default. */
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

  /** Ends the request; returns whether it had been cancelled. */
  public finishRequest(): boolean {
    const cancelled = this.active?.signal.aborted === true;
    this.active = undefined;
    return cancelled;
  }

  public completeRequest(used: Usage, modelOverride?: string): void {
    this.active = undefined;
    this.usage = sumUsage(this.usage, used);
    this.writer.ensureNewLine();
    this.showHeader(modelOverride);
  }

  public conversation(): readonly ChatMessage[] {
    return this.history;
  }

  public appendTurn(messages: readonly ChatMessage[]): void {
    this.history = trimHistory([...this.history, ...messages]);
  }

  /**
   * Drops the history and the usage totals: both describe the context that
   * is being discarded, so the header would otherwise report tokens the
   * model no longer receives.
   */
  public clearConversation(): void {
    this.history = [];
    this.usage = {};
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
