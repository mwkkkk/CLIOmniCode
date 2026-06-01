/**
 * L2 程序记忆（Procedural Memory）
 *
 * 跨 session 持久化的操作流程（SOP），JSONL 格式：
 *   ~/.omni/procedures/{projectHash}/procedures.jsonl
 *
 * 召回策略：关键词匹配 title / tags / steps。
 */
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fallbackRecallHint, scoreByQuery } from './recall-utils.js';
import type { ProceduralCandidate, Procedure } from './types.js';

export class ProceduralStore {
  constructor(private filePath: string) {}

  static forProject(dataDir: string, projectHash: string): ProceduralStore {
    return new ProceduralStore(join(dataDir, 'procedures', projectHash, 'procedures.jsonl'));
  }

  async append(candidate: ProceduralCandidate, threshold: number): Promise<Procedure | null> {
    if (candidate.confidence < threshold || candidate.steps.length === 0) return null;

    const existing = await this.list();
    const duplicate = existing.find(
      (proc) => proc.title.toLowerCase() === candidate.title.toLowerCase(),
    );
    if (duplicate) return duplicate;

    const record: Procedure = {
      id: randomUUID(),
      title: candidate.title,
      steps: candidate.steps,
      tags: candidate.tags,
      recallHint:
        candidate.recallHint ||
        fallbackRecallHint([candidate.title, ...candidate.tags]),
      confidence: candidate.confidence,
      sourceSessionId: candidate.sourceSessionId,
      createdAt: new Date().toISOString(),
    };

    await mkdir(join(this.filePath, '..'), { recursive: true });
    await appendFile(this.filePath, `${JSON.stringify(record)}\n`, 'utf-8');
    return record;
  }

  async recall(query: string, topK = 3): Promise<Procedure[]> {
    const procedures = await this.list();

    const scored = procedures
      .map((proc) => ({
        proc,
        score: scoreByQuery(query, [
          proc.recallHint,
          proc.title,
          ...proc.tags,
          ...proc.steps,
        ]),
      }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, topK).map(({ proc }) => proc);
  }

  async list(): Promise<Procedure[]> {
    try {
      const raw = await readFile(this.filePath, 'utf-8');
      return raw
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Procedure);
    } catch {
      return [];
    }
  }
}
