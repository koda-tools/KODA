import assert from "node:assert/strict";
import { test } from "node:test";
import { CodeAgent } from "../src/core/index.js";
import type {
  ChatMessage,
  ChatResponse,
  ILLMProvider,
  ProviderCapabilities,
  StreamEvent,
} from "../src/providers/index.js";
import { contentToText } from "../src/providers/index.js";
import { ToolRegistry } from "../src/tools/registry.js";

class PackageProvider implements ILLMProvider {
  private turn = 0;
  public observed = "";
  public async complete(
    messages: readonly ChatMessage[],
  ): Promise<ChatResponse> {
    this.turn += 1;
    if (this.turn === 1)
      return {
        content: "",
        toolCalls: [
          {
            id: "package",
            name: "readFile",
            arguments: '{"filePath":"package.json"}',
          },
        ],
      };
    this.observed = contentToText(messages.at(-1)?.content ?? "");
    return {
      content: this.observed.includes("@koda-tools/koda")
        ? "The project is @koda-tools/koda."
        : "Name not found.",
      toolCalls: [],
    };
  }
  public async *stream(): AsyncGenerator<StreamEvent, void, unknown> {}
  public supportsTools(): boolean {
    return true;
  }
  public capabilities(): ProviderCapabilities {
    return { tools: true, streaming: true, images: false };
  }
}

test("grounds a package name answer in a readFile observation", async () => {
  const provider = new PackageProvider();
  const answer = await new CodeAgent(
    provider,
    new ToolRegistry({ workspaceRoot: process.cwd() }),
    { identity: { provider: "openai", model: "test-model" } },
  ).run("Read package.json and report the project name.");
  assert.match(provider.observed, /"name": "@koda-tools\/koda"/);
  assert.equal(answer, "The project is @koda-tools/koda.");
});
