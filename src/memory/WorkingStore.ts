/**
 * L1 短期记忆（Working Memory）
 *
 * 维护当前 session 的完整 ChatMessage 列表（用户 / 助手 / 工具调用与结果）。
 * 进程内按 sessionId 缓存；持久化由 TranscriptStore 负责。
 * session 结束时 clear(sessionId) 释放。
 */
import type { ChatMessage } from '../llm/types.js';

export class WorkingStore {
  private sessions = new Map<string, ChatMessage[]>();

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  getMessages(sessionId: string): ChatMessage[] {
    const messages = this.sessions.get(sessionId);
    return messages ? [...messages] : [];
  }

  setMessages(sessionId: string, messages: ChatMessage[]): void {
    this.sessions.set(sessionId, [...messages]);
  }

  append(sessionId: string, ...messages: ChatMessage[]): void {
    const existing = this.sessions.get(sessionId) ?? [];
    this.sessions.set(sessionId, [...existing, ...messages]);
  }

  clear(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
