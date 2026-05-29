import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Episode } from './types.js';

export class EpisodicStore {
  constructor(private baseDir: string) {}

  static forProject(dataDir: string, projectHash: string): EpisodicStore {
    return new EpisodicStore(join(dataDir, 'episodes', projectHash));
  }

  async save(episode: Omit<Episode, 'id' | 'createdAt'>): Promise<Episode> {
    const record: Episode = {
      ...episode,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };

    await mkdir(this.baseDir, { recursive: true });
    const filePath = join(this.baseDir, `${record.sessionId}.json`);
    await writeFile(filePath, JSON.stringify(record, null, 2), 'utf-8');
    return record;
  }

  async list(): Promise<Episode[]> {
    try {
      const { readdir } = await import('node:fs/promises');
      const files = await readdir(this.baseDir);
      const episodes: Episode[] = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const raw = await readFile(join(this.baseDir, file), 'utf-8');
        episodes.push(JSON.parse(raw) as Episode);
      }

      return episodes.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch {
      return [];
    }
  }
}
