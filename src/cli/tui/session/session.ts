import {
  estimateTokens,
  modelLimit,
  type ChatMessage,
  type Usage,
} from "../../../providers/index.js";
import { sumUsage } from "../../../core/index.js";
import type { InteractiveIO, LineWriter } from "../shared/types.js";
import { renderHeader } from "./header.js";
import type { SessionIdentity, SessionStatus } from "./types.js";

/**
 * Share of the context window kept free for what the history does not
 * carry: the system prompt, the tool definitions and the next prompt.
 */
const RESERVE_RATIO = 0.1;
const MIN_RESERVE_TOKENS = 1_024;

/** Tokens the history may use: the window minus the reply and the reserve. */
function historyBudget(provider: string, model: string): number {
  const { context, output } = modelLimit(provider, model);
  const reserve = Math.max(
    MIN_RESERVE_TOKENS,
    Math.ceil(context * RESERVE_RATIO),
  );
  return Math.max(0, context - output - reserve);
}

function nextUserTurn(history: readonly ChatMessage[], from: number): number {
  let index = from;
  while (index < history.length && history[index]?.role !== "user") index += 1;
  return index;
}

/**
 * Drops whole turns, oldest first, until the history fits the budget. The
 * kept history always starts at a user message, so no tool reply is left
 * without its call. The newest turn is kept even when it alone is over the
 * budget: without summarization, cutting it would lose the current question.
 */
function trimHistory(
  history: readonly ChatMessage[],
  budget: number,
): ChatMessage[] {
  const sizes = history.map((message) => estimateTokens([message]));
  let total = sizes.reduce((sum, size) => sum + size, 0);
  let start = 0;
  const dropUntil = (end: number): void => {
    for (let index = start; index < end; index += 1) total -= sizes[index] ?? 0;
    start = end;
  };
  dropUntil(nextUserTurn(history, 0));
  while (total > budget) {
    const next = nextUserTurn(history, start + 1);
    if (next >= history.length) break;
    dropUntil(next);
  }
  return history.slice(start);
}

/** Conversation state for one interactive run: model, usage, history, abort. */
export class Session {
  private usage: Usage = {};
  private selectedModel: string;
  private active: AbortController | undefined;
  private history: ChatMessage[] = [];
  private agentName: string | undefined;

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

  /** The session's primary agent (a child session: its subagent). */
  public get agent(): string | undefined {
    return this.agentName;
  }

  /** Snapshot for the sidebar/summary: provider, model and running usage. */
  public status(): SessionStatus {
    return {
      provider: this.identity.provider,
      model: this.selectedModel,
      usage: this.usage,
      ...(this.agentName === undefined ? {} : { agent: this.agentName }),
    };
  }

  public selectAgent(name: string): void {
    this.agentName = name;
  }

  /** Usage spent on this session's behalf elsewhere (its subagents). */
  public addUsage(used: Usage): void {
    this.usage = sumUsage(this.usage, used);
  }

  public selectModel(model: string): void {
    this.selectedModel = model;
    // A smaller window must not receive the old model's history.
    this.compact(this.history);
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

  /** Adds a turn and compacts; `dropped` counts the messages that left. */
  public appendTurn(messages: readonly ChatMessage[]): {
    readonly dropped: number;
  } {
    return this.compact([...this.history, ...messages]);
  }

  /** Fits the history to the selected model and reports what was dropped. */
  private compact(history: readonly ChatMessage[]): {
    readonly dropped: number;
  } {
    this.history = trimHistory(
      history,
      historyBudget(this.identity.provider, this.selectedModel),
    );
    const dropped = history.length - this.history.length;
    if (dropped > 0) {
      this.writer.ensureNewLine();
      this.writer.write(
        `Context trimmed: ${dropped} older ${dropped === 1 ? "message" : "messages"} dropped to fit the model window.\n`,
      );
    }
    return { dropped };
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
