import type { Message, MessageScope } from "../../core/messages/Message.ts";

export interface ProviderToolDefinition {
  name: string;
  description: string;
}

export interface ProviderToolCall {
  toolName: string;
  input: unknown;
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
}

export interface ProviderResponse {
  content?: string;
  shouldReply?: boolean;
  toolCalls?: ProviderToolCall[];
  metadata?: Record<string, unknown>;
}

export abstract class BaseProvider {
  abstract generate(request: ProviderRequest): Promise<ProviderResponse>;
}
