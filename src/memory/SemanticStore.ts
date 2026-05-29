import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { MemoryCandidate, SemanticFact } from './types.js';

export class SemanticStore {
  constructor(private filePath: string) {}

  static forProject(dataDir: string, projectHash: string): SemanticStore {
    return new SemanticStore(join(dataDir, 'semantic', projectHash, 'facts.jsonl'));
  }

  async append(candidate: MemoryCandidate, threshold: number): Promise<SemanticFact | null> {
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
      confidence: candidate.confidence,
      sourceSessionId: candidate.sourceSessionId,
      createdAt: new Date().toISOString(),
      expiresAt: candidate.expiresAt,
    };

    await mkdir(join(this.filePath, '..'), { recursive: true });
    await appendFile(this.filePath, `${JSON.stringify(fact)}\n`, 'utf-8');
    return fact;
  }

  async recall(query: string, topK = 5): Promise<SemanticFact[]> {
    const facts = await this.list();
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

    const scored = facts
      .map((fact) => {
        const text = fact.content.toLowerCase();
        const score = terms.reduce((acc, term) => (text.includes(term) ? acc + 1 : acc), 0);
        return { fact, score };
      })
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
