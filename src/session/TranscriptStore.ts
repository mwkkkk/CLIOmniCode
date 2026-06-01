/**
 * 对话记录存储（TranscriptStore）
 *
 * 每个 session 的对话以 JSONL 格式持久化：
 *   ~/.omni/sessions/{sessionId}/transcript.jsonl
 *
 * L1 短期记忆的磁盘镜像：完整 ChatMessage 序列（含 tool_calls / tool_result）。
 */
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ChatMessage } from '../llm/types.js';
import type { TranscriptEntry } from './types.js';

export class TranscriptStore {
  constructor(private filePath: string) {}

  static forSession(dataDir: string, sessionId: string): TranscriptStore {
    return new TranscriptStore(join(dataDir, 'sessions', sessionId, 'transcript.jsonl'));
  }

  async append(entry: TranscriptEntry): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await appendFile(this.filePath, `${JSON.stringify(entry)}\n`, 'utf-8');
  }

  async appendChatMessage(message: ChatMessage): Promise<void> {
    await this.append({
      type: 'chat_message',
      timestamp: new Date().toISOString(),
      payload: message,
    });
  }

  async appendChatMessages(messages: ChatMessage[]): Promise<void> {
    for (const message of messages) {
      await this.appendChatMessage(message);
    }
  }

  async readAll(): Promise<TranscriptEntry[]> {
    try {
      const raw = await readFile(this.filePath, 'utf-8');
      return raw
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as TranscriptEntry);
    } catch {
      return [];
    }
  }

  /** 从 transcript 重建 L1 messages 列表（兼容旧格式） */
  async readChatMessages(): Promise<ChatMessage[]> {
    const entries = await this.readAll();
    const messages: ChatMessage[] = [];

    for (const entry of entries) {
      if (entry.type === 'chat_message') {
        messages.push(entry.payload as ChatMessage);
        continue;
      }

      if (entry.type === 'message') {
        const payload = entry.payload as {
          role: ChatMessage['role'];
          content: string | null;
          tool_calls?: ChatMessage['tool_calls'];
          tool_call_id?: string;
          name?: string;
        };
        messages.push({
          role: payload.role,
          content: payload.content,
          tool_calls: payload.tool_calls,
          tool_call_id: payload.tool_call_id,
          name: payload.name,
        });
      }
    }

    return messages;
  }

  async writeAll(entries: TranscriptEntry[]): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const content = entries.map((e) => JSON.stringify(e)).join('\n');
    await writeFile(this.filePath, content ? `${content}\n` : '', 'utf-8');
  }
}
