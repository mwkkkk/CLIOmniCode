import type { ChatMessage } from '../llm/types.js';

export class WorkingStore {
  private messages: ChatMessage[] = [];

  getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  setMessages(messages: ChatMessage[]): void {
    this.messages = [...messages];
  }

  append(message: ChatMessage): void {
    this.messages.push(message);
  }

  clear(): void {
    this.messages = [];
  }
}
