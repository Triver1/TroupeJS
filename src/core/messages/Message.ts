import { createId } from "../../lib/ids.ts";

export type MessageRole = "system" | "user" | "agent" | "tool";
export type MessageScope = "directed" | "troupe";

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  sender?: string;
  target?: string;
  scope?: MessageScope;
  parentId?: string;
  createdAt: number;
  metadata?: Record<string, unknown>;
}

export interface CreateMessageInput {
  role: MessageRole;
  content: string;
  sender?: string;
  target?: string;
  scope?: MessageScope;
  parentId?: string;
  metadata?: Record<string, unknown>;
}

export function createMessage(input: CreateMessageInput): Message {
  return {
    id: createId("msg"),
    createdAt: Date.now(),
    ...input,
  };
}
