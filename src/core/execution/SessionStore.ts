import type { Message } from "../messages/Message.ts";
import { createId } from "../../lib/ids.ts";

export interface Session {
  id: string;
  kind: "agent" | "troupe";
  subject: string;
  messages: Message[];
}

export class SessionStore {
  readonly #sessions = new Map<string, Session>();

  createSession(kind: Session["kind"], subject: string): string {
    const id = createId("session");
    this.#sessions.set(id, {
      id,
      kind,
      subject,
      messages: [],
    });
    return id;
  }

  append(sessionId: string, message: Message): void {
    const session = this.#sessions.get(sessionId);
    if (!session) {
      return;
    }

    session.messages.push(message);
  }

  getMessages(sessionId: string): Message[] {
    return [...(this.#sessions.get(sessionId)?.messages ?? [])];
  }
}

export const sessionStore = new SessionStore();
