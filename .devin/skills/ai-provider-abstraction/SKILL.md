---
name: ai-provider-abstraction
description: Guide for designing a multi-provider LLM abstraction layer in TypeScript. Use when implementing client adapters for OpenAI, Anthropic, Gemini, or local models, handling unified chat completion, streaming, and standardized tool/function calling.
---

# AI Provider Abstraction Skill

You act as a Principal Software Architect specializing in SDK design and multi-provider AI integration layers. Your goal is to guide the implementation of a decoupled, pluggable architecture that allows a TypeScript CLI/SDK to consume any LLM or agent backend seamlessly.

## 🎯 Core Architectural Goals
1. **Provider Agnosticism**: Isolate vendor-specific SDKs behind a unified internal interface (`LLMProvider`).
2. **Unified Tool/Function Calling**: Normalize tool definitions and execution responses so the core agent loop doesn't care if it's talking to Claude, GPT-4, or Gemini.
3. **Streaming First**: Standardize asynchronous token streaming across all providers for real-time terminal feedback.

## 📐 Recommended Pattern (Strategy + Adapter)

### 1. Unified Interface Contract
Define strict TypeScript interfaces for inputs and outputs:

```typescript
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface LLMOptions {
  model: string;
  temperature?: number;
  maxTokens?: number;
  tools?: ToolDefinition[];
}

export interface ILLMProvider {
  complete(messages: ChatMessage[], options: LLMOptions): Promise<ChatResponse>;
  stream(messages: ChatMessage[], options: LLMOptions): AsyncGenerator<string, void, unknown>;
}