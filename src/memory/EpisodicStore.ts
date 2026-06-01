/**
 * L2 情节记忆（Episodic Memory）
 *
 * 每次 session 结束时，ReflectionPipeline 将完整任务经历写入：
 *   ~/.omni/episodes/{projectHash}/{sessionId}.json
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fallbackRecallHint, scoreByQuery } from './recall-utils.js';
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

  async recall(query: string, topK = 3): Promise<Episode[]> {
    const episodes = await this.list();

    const scored = episodes
      .map((episode) => ({
        episode,
        score: scoreByQuery(query, [
          episode.recallHint,
          episode.title,
          episode.narrative,
          episode.outcome,
          ...episode.tags,
        ]),
      }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, topK).map(({ episode }) => episode);
  }

  async list(): Promise<Episode[]> {
    try {
      const { readdir } = await import('node:fs/promises');
      const files = await readdir(this.baseDir);
      const episodes: Episode[] = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const raw = await readFile(join(this.baseDir, file), 'utf-8');
        const parsed = JSON.parse(raw) as Episode & { summary?: string };
        episodes.push(this.normalizeEpisode(parsed));
      }

      return episodes.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch {
      return [];
    }
  }

  private normalizeEpisode(raw: Episode & { summary?: string }): Episode {
    if (raw.title && raw.narrative) return raw;
    return {
      id: raw.id,
      sessionId: raw.sessionId,
      projectHash: raw.projectHash,
      title: raw.title ?? `Session ${raw.sessionId.slice(0, 8)}`,
      narrative: raw.narrative ?? raw.summary ?? '',
      outcome: raw.outcome ?? '',
      tags: raw.tags ?? [],
      createdAt: raw.createdAt,
    };
  }
}
