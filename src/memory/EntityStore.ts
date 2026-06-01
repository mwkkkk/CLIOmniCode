/**
 * L3 实体记忆（Entity Memory）
 *
 * 从对话中提炼的结构化事实，JSONL 格式：
 *   ~/.omni/entities/{projectHash}/facts.jsonl
 *
 * 存储「实体.属性 = 值」，而非原始对话原文。
 * 召回策略：关键词匹配 entity / attribute / value。
 */
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { EntityCandidate, EntityFact } from './types.js';

export class EntityStore {
  constructor(private filePath: string) {}

  static forProject(dataDir: string, projectHash: string): EntityStore {
    return new EntityStore(join(dataDir, 'entities', projectHash, 'facts.jsonl'));
  }

  async upsert(candidate: EntityCandidate, threshold: number): Promise<EntityFact | null> {
    if (candidate.confidence < threshold) return null;

    const existing = await this.list();
    const duplicate = existing.find(
      (fact) =>
        fact.entity.toLowerCase() === candidate.entity.toLowerCase() &&
        fact.attribute.toLowerCase() === candidate.attribute.toLowerCase(),
    );

    if (duplicate) {
      duplicate.value = candidate.value;
      duplicate.confidence = candidate.confidence;
      duplicate.sourceSessionId = candidate.sourceSessionId;
      duplicate.createdAt = new Date().toISOString();
      duplicate.expiresAt = candidate.expiresAt;
      await this.writeAll(existing);
      return duplicate;
    }

    const fact: EntityFact = {
      id: randomUUID(),
      entity: candidate.entity,
      attribute: candidate.attribute,
      value: candidate.value,
      confidence: candidate.confidence,
      sourceSessionId: candidate.sourceSessionId,
      createdAt: new Date().toISOString(),
      expiresAt: candidate.expiresAt,
    };

    await mkdir(join(this.filePath, '..'), { recursive: true });
    await appendFile(this.filePath, `${JSON.stringify(fact)}\n`, 'utf-8');
    return fact;
  }

  async recall(query: string, topK = 10): Promise<EntityFact[]> {
    const facts = await this.list();
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

    const scored = facts
      .map((fact) => {
        const text = `${fact.entity} ${fact.attribute} ${fact.value}`.toLowerCase();
        const score = terms.reduce((acc, term) => (text.includes(term) ? acc + 1 : acc), 0);
        return { fact, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, topK).map(({ fact }) => fact);
  }

  async list(): Promise<EntityFact[]> {
    try {
      const raw = await readFile(this.filePath, 'utf-8');
      return raw
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as EntityFact)
        .filter((fact) => !fact.expiresAt || fact.expiresAt > new Date().toISOString());
    } catch {
      return [];
    }
  }

  private async writeAll(facts: EntityFact[]): Promise<void> {
    const { writeFile } = await import('node:fs/promises');
    await mkdir(join(this.filePath, '..'), { recursive: true });
    const content = facts.map((f) => JSON.stringify(f)).join('\n');
    await writeFile(this.filePath, content ? `${content}\n` : '', 'utf-8');
  }
}
