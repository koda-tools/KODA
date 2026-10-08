import { writeClipboard } from "@termuijs/core";
import { Spinner } from "@termuijs/widgets";
import type { InteractiveRuntime } from "../application/types.js";
import { sanitize, sanitizeStyled } from "../shared/sanitize.js";
import type {
  DiffViewRequest,
  InteractiveIO,
  ModelPickerRequest,
  SelectRequest,
} from "../shared/types.js";
import { ChoiceList } from "./choice-list.js";
import { CommandSuggestions } from "./command-suggestions.js";
import { MODEL_PICKER_TITLE } from "./constants.js";
import {
  appendToTranscript,
  createConversationStore,
} from "./conversation-store.js";
import { DiffPanel } from "./diff-panel.js";
import { createKeyHandler } from "./keyboard.js";
import { buildApp } from "./layout.js";
import { Prompt } from "./prompt.js";
import { ToolSlot } from "./tool-slot.js";
import { Transcript } from "./transcript.js";
import type { AppInternals, MountedApp, PendingAnswer } from "./types.js";

/** The TermUI front end: owns the widgets and implements `InteractiveIO`. */
export class TermUIRuntime implements InteractiveRuntime {
  private readonly store = createConversationStore();
  private readonly transcript = new Transcript(this.store);
  private readonly toolSlot = new ToolSlot();
  private readonly diffPanel = new DiffPanel();
  private readonly prompt = new Prompt();
  private readonly suggestions = new CommandSuggestions();
  private readonly choices = new ChoiceList({
    onFocusChange: (listFocused) => {
      this.prompt.focused = !listFocused;
    },
    requestRender: () => this.mounted?.requestRender(),
  });
  // https://www.termui.io/components/spinner — `arc` is visibly distinct
  // from the braille frames the old hand-rolled spinner used.
  private readonly spinner = new Spinner(
    { height: 1 },
    { preset: "arc", color: { type: "named", name: "cyan" }, active: false },
  );
  private mounted: MountedApp | undefined;
  private pendingAnswer: PendingAnswer | undefined;
  private readonly cancelHandlers = new Set<() => void>();
  private closed = false;
  /** Text of the most recent code block, copied by Ctrl+Y. */
  private lastCodeBlock: string | undefined;

  public readonly io: InteractiveIO = {
    question: (prompt) => this.question(prompt),
    // Untrusted text loses every escape; styled output keeps SGR colors.
    write: (value) => this.write(sanitize(value)),
    writeStyled: (value) => this.write(sanitizeStyled(value)),
    close: () => this.close(),
    onCancel: (handler) => {
      this.cancelHandlers.add(handler);
      return () => this.cancelHandlers.delete(handler);
    },
    isTTY: true,
    onCodeBlock: (code) => {
      this.lastCodeBlock = code;
    },
    setHeader: (header) => this.store.setState({ header }),
    setStatus: (status) => this.setStatus(status),
    clearTranscript: () => this.clearTranscript(),
    select: (request) => this.select(request),
    showDiff: (request) => this.showDiff(request),
    showModelPicker: (request) => this.showModelPicker(request),
    showToolCall: (call) => (this.closed ? undefined : this.toolSlot.show(call)),
    setCommandSuggestions: (items) => this.suggestions.setItems(items),
  };

  public async run(task: () => Promise<void>): Promise<void> {
    const builder = buildApp({
      store: this.store,
      transcript: this.transcript,
      toolSlot: this.toolSlot,
      diffPanel: this.diffPanel,
      choices: this.choices,
      suggestions: this.suggestions,
      spinner: this.spinner,
      prompt: this.prompt,
    });
    this.prompt.onChange((value) => this.suggestions.update(value));
    const application = builder.run();
    await Promise.resolve();
    this.mounted = (builder as unknown as AppInternals)._app ?? undefined;
    this.mounted?.events.on(
      "key",
      createKeyHandler({
        choices: this.choices,
        suggestions: this.suggestions,
        prompt: this.prompt,
        transcript: this.transcript,
        isBusy: () => this.store.getState().status !== undefined,
        cancel: () => this.cancel(),
        clearTranscript: () => this.clearTranscript(),
        copyLastCodeBlock: () => this.copyLastCodeBlock(),
        submit: (value) => this.submit(value),
        requestRender: () => this.mounted?.requestRender(),
      }),
    );
    this.prompt.focused = true;
    this.transcript.start();
    try {
      await Promise.race([application, task()]);
    } finally {
      this.close();
      await application.catch(() => undefined);
    }
  }

  /** The prompt box already shows "❯"; any other question is echoed. */
  private question(prompt: string): Promise<string | undefined> {
    if (this.closed) return Promise.resolve(undefined);
    if (prompt.trim() !== "❯") this.write(prompt);
    return new Promise((resolve) => {
      this.pendingAnswer = { resolve };
    });
  }

  private submit(value: string): void {
    const answer = this.pendingAnswer;
    if (answer === undefined) return;
    this.pendingAnswer = undefined;
    this.write(`${value}\n`);
    answer.resolve(value);
  }

  private write(text: string): void {
    const { transcript } = this.store.getState();
    this.store.setState({ transcript: appendToTranscript(transcript, text) });
  }

  /** Used by both Ctrl+L and `/clear`. */
  private clearTranscript(): void {
    this.store.setState({ transcript: [""] });
  }

  /** Copy the most recent code block to the clipboard (Ctrl+Y, OSC 52). */
  private copyLastCodeBlock(): void {
    const code = this.lastCodeBlock;
    if (code === undefined || code === "") {
      this.write("Nenhum bloco de código para copiar.\n");
      return;
    }
    try {
      writeClipboard(code);
      const lines = code.split("\n").length;
      this.write(`Bloco de código copiado (${lines} linhas).\n`);
    } catch {
      this.write("Não foi possível copiar o bloco de código.\n");
    }
  }

  private setStatus(status: string | undefined): void {
    this.store.setState({ status });
    this.spinner.setLabel(status ?? "");
    this.spinner.setActive(status !== undefined);
  }

  private showDiff(request: DiffViewRequest): boolean {
    if (this.closed) return false;
    this.diffPanel.show(request.lines);
    if (request.title !== "") this.write(`${request.title}\n`);
    return true;
  }

  private async choose(
    title: string,
    labels: readonly string[],
  ): Promise<number | undefined> {
    if (this.closed) return undefined;
    this.write(`${title}\n`);
    return this.choices.open(labels);
  }

  /** Approval prompts (write file, run shell). */
  private async select(request: SelectRequest): Promise<number | undefined> {
    const title =
      request.hint === undefined
        ? request.title
        : `${request.title}  (${request.hint})`;
    const choice = await this.choose(title, request.options);
    this.diffPanel.hide();
    if (choice !== undefined) this.write(`→ ${request.options[choice] ?? ""}\n`);
    return choice;
  }

  private async showModelPicker(
    request: ModelPickerRequest,
  ): Promise<string | undefined> {
    const labels = request.items.map(
      (item) => `${item.current ? "●" : " "} ${item.label}`,
    );
    const index = await this.choose(MODEL_PICKER_TITLE, labels);
    return index === undefined ? undefined : request.items[index]?.value;
  }

  private resolvePending(): void {
    const answer = this.pendingAnswer;
    this.pendingAnswer = undefined;
    answer?.resolve(undefined);
    this.choices.close(undefined);
  }

  private cancel(): void {
    this.resolvePending();
    for (const handler of [...this.cancelHandlers]) handler();
  }

  private close(): void {
    if (this.closed) return;
    this.closed = true;
    this.transcript.stop();
    this.resolvePending();
    this.mounted?.exit();
    this.cancelHandlers.clear();
  }
}
