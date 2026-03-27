import type { Message, MessageScope } from "../../core/messages/Message.ts";

export interface ProviderToolDefinition {
  name: string;
  description: string;
  parameters?: unknown;
}

export interface ProviderToolCall {
  toolName: string;
  input: unknown;
  id?: string;
}

export interface ProviderRequest {
  agentName: string;
  personality?: string;
  systemPrompt?: string;
  input: string;
  scope: MessageScope;
  messages: Message[];
  tools: ProviderToolDefinition[];
  subagentNames: string[];
  longTermMemory: unknown;
  responseSchema?: {
    name: string;
    schema: Record<string, unknown>;
    strict?: boolean;
  };
}

export interface ProviderResponse {
  content?: string;
  shouldReply?: boolean;
  toolCalls?: ProviderToolCall[];
  parsed?: unknown;
  metadata?: Record<string, unknown>;
}

export abstract class BaseProvider {
  supportsToolResponses(): boolean {
    return true;
  }

  abstract generate(request: ProviderRequest): Promise<ProviderResponse>;
}
