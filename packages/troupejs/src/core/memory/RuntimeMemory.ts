import type { Message } from "../messages/Message.ts";

export class RuntimeMemory {
  #messages: Message[];

  constructor(initialMessages: Message[] = []) {
    this.#messages = [...initialMessages];
  }

  append(message: Message): void {
    this.#messages.push(message);
  }

  getChat(): Message[] {
    return [...this.#messages];
  }

  clear(): void {
    this.#messages = [];
  }
}
