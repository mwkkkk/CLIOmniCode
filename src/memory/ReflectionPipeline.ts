import type { LLMProvider } from '../llm/types.js';
import { EpisodicStore } from './EpisodicStore.js';
import { SemanticStore } from './SemanticStore.js';
import type { MemoryCandidate } from './types.js';

export interface ReflectionInput {
  sessionId: string;
  projectHash: string;
  transcriptSummary: string;
}

export class ReflectionPipeline {
  constructor(
    private provider: LLMProvider,
    private model: string,
    private confidenceThreshold: number,
  ) {}

  async run(
    input: ReflectionInput,
    dataDir: string,
  ): Promise<{ episodeSummary: string; savedFacts: number }> {
    const candidates = await this.extractCandidates(input);
    const semantic = SemanticStore.forProject(dataDir, input.projectHash);

    let savedFacts = 0;
    for (const candidate of candidates) {
      const saved = await semantic.append(candidate, this.confidenceThreshold);
      if (saved) savedFacts += 1;
    }

    const episodeSummary =
      candidates.length > 0
        ? `Session reflected with ${candidates.length} memory candidates.`
        : input.transcriptSummary.slice(0, 500);

    await EpisodicStore.forProject(dataDir, input.projectHash).save({
      sessionId: input.sessionId,
      projectHash: input.projectHash,
      summary: episodeSummary,
    });

    return { episodeSummary, savedFacts };
  }

  private async extractCandidates(input: ReflectionInput): Promise<MemoryCandidate[]> {
    const prompt = [
      'Extract durable project memories from this coding session summary.',
      'Return JSON array: [{ "category": "preference|convention|architecture|pitfall|decision", "content": "...", "confidence": 0.0-1.0 }]',
      'Only include facts worth remembering across sessions. Max 5 items.',
      '',
      input.transcriptSummary,
    ].join('\n');

    const generator = this.provider.chat({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
    });

    let result = await generator.next();
    while (!result.done) {
      result = await generator.next();
    }

    const text = result.value.content ?? '[]';

    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      const parsed = JSON.parse(jsonMatch?.[0] ?? '[]') as Array<{
        category: MemoryCandidate['category'];
        content: string;
        confidence: number;
      }>;

      return parsed.map((item) => ({
        ...item,
        sourceSessionId: input.sessionId,
      }));
    } catch {
      return [];
    }
  }
}
