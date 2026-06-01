/**
 * L2 语义记忆（Semantic Memory）
 *
 * 跨 session 持久化的通用知识与规律，JSONL 格式：
 *   ~/.omni/semantic/{projectHash}/facts.jsonl
 *
 * 召回策略：关键词匹配（非向量检索）。
 * 写入门槛：confidence >= reflection_confidence_threshold，且去重。
 */
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fallbackRecallHint, scoreByQuery } from './recall-utils.js';
import type { SemanticCandidate, SemanticFact } from './types.js';

export class SemanticStore {
  constructor(private filePath: string) {}

  static forProject(dataDir: string, projectHash: string): SemanticStore {
    return new SemanticStore(join(dataDir, 'semantic', projectHash, 'facts.jsonl'));
  }

  /**
   * 写入候选记忆，低于 threshold 或重复内容则跳过
   * @returns 写入的 fact，或已存在的 duplicate
   */
  async append(candidate: SemanticCandidate, threshold: number): Promise<SemanticFact | null> {
    if (candidate.confidence < threshold) return null;

    const existing = await this.list();
    const duplicate = existing.find(
      (fact) => fact.content.toLowerCase() === candidate.content.toLowerCase(),
    );
    if (duplicate) return duplicate;

    const fact: SemanticFact = {
      id: randomUUID(),
      category: candidate.category,
      content: candidate.content,
      recallHint:
        candidate.recallHint ||
        fallbackRecallHint([candidate.category, candidate.content]),
      confidence: candidate.confidence,
      sourceSessionId: candidate.sourceSessionId,
      createdAt: new Date().toISOString(),
      expiresAt: candidate.expiresAt,
    };

    await mkdir(join(this.filePath, '..'), { recursive: true });
    await appendFile(this.filePath, `${JSON.stringify(fact)}\n`, 'utf-8');
    return fact;
  }

  /**
   * 根据 query 关键词召回 top-K 相关事实
   * 供 ContextManager 注入 System Prompt
   */
  async recall(query: string, topK = 5): Promise<SemanticFact[]> {
    const facts = await this.list();

    const scored = facts
      .map((fact) => ({
        fact,
        score: scoreByQuery(query, [fact.recallHint, fact.content, fact.category]),
      }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, topK).map(({ fact }) => fact);
  }

  async list(): Promise<SemanticFact[]> {
    try {
      const raw = await readFile(this.filePath, 'utf-8');
      return raw
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as SemanticFact)
        .filter((fact) => !fact.expiresAt || fact.expiresAt > new Date().toISOString());
    } catch {
      return [];
    }
  }
}
