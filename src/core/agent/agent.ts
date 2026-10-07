import type {
  ChatMessage,
  ChatResponse,
  CompletionOptions,
  ILLMProvider,
  Usage,
} from "../../providers/index.js";
import { AgentError } from "../../utils/errors.js";
import { resolveModel } from "../model/model-ref.js";
import { EMPTY_USAGE, sumUsage } from "../usage/usage.js";
import {
  DEFAULT_MAX_ITERATIONS,
  DEFAULT_SYSTEM_PROMPT,
  THINKING_STATUS,
} from "./constants.js";
import { requestResponse } from "./response.js";
import { runToolCalls } from "./tool-runner.js";
import type {
  AgentIdentity,
  AgentObserver,
  AgentRunOptions,
  AgentRunResult,
  CodeAgentOptions,
  ToolExecutor,
} from "./types.js";

function toAssistantMessage(response: ChatResponse): ChatMessage {
  return response.toolCalls.length === 0
    ? { role: "assistant", content: response.content }
    : {
        role: "assistant",
        content: response.content,
        toolCalls: response.toolCalls,
      };
}

export class CodeAgent {
  private readonly identity: AgentIdentity;
  private readonly maxIterations: number;
  private readonly systemPrompt: string;

  public constructor(
    private readonly provider: ILLMProvider,
    private readonly tools: ToolExecutor,
    options: CodeAgentOptions,
  ) {
    this.identity = options.identity;
    this.maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    this.systemPrompt = options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    if (!Number.isInteger(this.maxIterations) || this.maxIterations < 1)
      throw new AgentError("maxIterations must be a positive integer.");
  }

  public async listModels(): Promise<readonly string[] | undefined> {
    return this.provider.listModels?.();
  }

  public async run(prompt: string): Promise<string> {
    return (await this.runDetailed(prompt)).content;
  }

  public async runDetailed(
    prompt: string,
    options: AgentRunOptions = {},
  ): Promise<AgentRunResult> {
    if (prompt.trim() === "")
      throw new AgentError("A non-empty prompt is required.");
    const model = resolveModel(options.model, this.identity);
    const observer = options.observer ?? {};
    const messages: ChatMessage[] = [
      { role: "system", content: this.systemPrompt },
      ...(options.history ?? []),
    ];
    const turnStart = messages.length;
    messages.push({ role: "user", content: prompt });
    try {
      return await this.loop(messages, turnStart, model, options, observer);
    } finally {
      observer.onStatus?.(undefined);
    }
  }

  private async loop(
    messages: ChatMessage[],
    turnStart: number,
    model: string,
    options: AgentRunOptions,
    observer: AgentObserver,
  ): Promise<AgentRunResult> {
    const completion = this.completionOptions(model, options.signal);
    let usage: Usage = EMPTY_USAGE;
    for (let iteration = 0; iteration < this.maxIterations; iteration += 1) {
      observer.onStatus?.(THINKING_STATUS);
      const response = await requestResponse(
        this.provider,
        messages,
        completion,
        observer.onTextDelta?.bind(observer),
      );
      usage = sumUsage(usage, response.usage);
      messages.push(toAssistantMessage(response));
      if (response.toolCalls.length === 0)
        return this.result(response, usage, model, messages.slice(turnStart));
      messages.push(
        ...(await runToolCalls(response.toolCalls, this.tools, observer)),
      );
    }
    throw new AgentError(
      `Agent stopped after reaching the ${this.maxIterations} iteration limit.`,
    );
  }

  private completionOptions(
    model: string,
    signal: AbortSignal | undefined,
  ): CompletionOptions {
    return {
      model,
      ...(this.provider.supportsTools()
        ? { tools: this.tools.definitions }
        : {}),
      ...(signal === undefined ? {} : { signal }),
    };
  }

  private result(
    response: ChatResponse,
    usage: Usage,
    model: string,
    messages: readonly ChatMessage[],
  ): AgentRunResult {
    if (response.content.trim() === "")
      throw new AgentError("The provider returned an empty final response.");
    return {
      content: response.content,
      usage,
      provider: this.identity.provider,
      model,
      messages,
    };
  }
}
