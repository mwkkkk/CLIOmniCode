import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
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

  async writeAll(entries: TranscriptEntry[]): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const content = entries.map((e) => JSON.stringify(e)).join('\n');
    await writeFile(this.filePath, content ? `${content}\n` : '', 'utf-8');
  }
}
