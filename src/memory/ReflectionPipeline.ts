/**
 * Reflection 记忆提炼流水线
 *
 * 在 session 结束（/exit、/new）时运行：
 * 1. 用便宜模型（qwen-flash）分析 L1 transcript 摘要
 * 2. 提取 L2：情节 / 语义 / 程序记忆
 * 3. 提取 L3：实体记忆（结构化事实）
 * 4. 高 confidence 的写入对应 Store
 */
import type { LLMProvider } from '../llm/types.js';
import { EntityStore } from './EntityStore.js';
import { EpisodicStore } from './EpisodicStore.js';
import { ProceduralStore } from './ProceduralStore.js';
import { SemanticStore } from './SemanticStore.js';
import type { ReflectionExtraction } from './types.js';

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
  ): Promise<{
    episodeSaved: boolean;
    savedSemanticFacts: number;
    savedProcedures: number;
    savedEntities: number;
  }> {
    const extraction = await this.extract(input);

    const semantic = SemanticStore.forProject(dataDir, input.projectHash);
    const procedural = ProceduralStore.forProject(dataDir, input.projectHash);
    const entity = EntityStore.forProject(dataDir, input.projectHash);
    const episodic = EpisodicStore.forProject(dataDir, input.projectHash);

    let savedSemanticFacts = 0;
    for (const candidate of extraction.semanticFacts) {
      const saved = await semantic.append(
        { ...candidate, sourceSessionId: input.sessionId },
        this.confidenceThreshold,
      );
      if (saved) savedSemanticFacts += 1;
    }

    let savedProcedures = 0;
    for (const candidate of extraction.procedures) {
      const saved = await procedural.append(
        { ...candidate, sourceSessionId: input.sessionId },
        this.confidenceThreshold,
      );
      if (saved) savedProcedures += 1;
    }

    let savedEntities = 0;
    for (const candidate of extraction.entities) {
      const saved = await entity.upsert(
        { ...candidate, sourceSessionId: input.sessionId },
        this.confidenceThreshold,
      );
      if (saved) savedEntities += 1;
    }

    let episodeSaved = false;
    if (extraction.episode) {
      await episodic.save({
        sessionId: input.sessionId,
        projectHash: input.projectHash,
        title: extraction.episode.title,
        narrative: extraction.episode.narrative,
        outcome: extraction.episode.outcome,
        tags: extraction.episode.tags,
      });
      episodeSaved = true;
    }

    return { episodeSaved, savedSemanticFacts, savedProcedures, savedEntities };
  }

  private async extract(input: ReflectionInput): Promise<ReflectionExtraction> {
    const prompt = [
      'Analyze this coding session transcript and extract durable memories.',
      'Return a single JSON object with this shape:',
      '{',
      '  "episode": { "title": "...", "narrative": "...", "outcome": "...", "tags": ["..."] } | null,',
      '  "semanticFacts": [{ "category": "preference|convention|architecture|pitfall|decision|pattern", "content": "...", "confidence": 0.0-1.0 }],',
      '  "procedures": [{ "title": "...", "steps": ["..."], "tags": ["..."], "confidence": 0.0-1.0 }],',
      '  "entities": [{ "entity": "user|project|client|...", "attribute": "...", "value": "...", "confidence": 0.0-1.0 }]',
      '}',
      '',
      'Guidelines:',
      '- episode: one complete task narrative with time, context, process, and result',
      '- semanticFacts: abstract knowledge distilled from this session (max 5)',
      '- procedures: reusable SOPs with ordered steps (max 3)',
      '- entities: structured facts like user.preferred_language = Python (max 10)',
      '- Only include items worth remembering across sessions',
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

    const text = result.value.content ?? '{}';

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch?.[0] ?? '{}') as {
        episode?: {
          title: string;
          narrative: string;
          outcome: string;
          tags?: string[];
        } | null;
        semanticFacts?: Array<{
          category: ReflectionExtraction['semanticFacts'][0]['category'];
          content: string;
          confidence: number;
        }>;
        procedures?: Array<{
          title: string;
          steps: string[];
          tags?: string[];
          confidence: number;
        }>;
        entities?: Array<{
          entity: string;
          attribute: string;
          value: string;
          confidence: number;
        }>;
      };

      return {
        episode: parsed.episode
          ? {
              title: parsed.episode.title,
              narrative: parsed.episode.narrative,
              outcome: parsed.episode.outcome,
              tags: parsed.episode.tags ?? [],
              sourceSessionId: input.sessionId,
            }
          : null,
        semanticFacts: (parsed.semanticFacts ?? []).map((item) => ({
          ...item,
          sourceSessionId: input.sessionId,
        })),
        procedures: (parsed.procedures ?? []).map((item) => ({
          title: item.title,
          steps: item.steps,
          tags: item.tags ?? [],
          confidence: item.confidence,
          sourceSessionId: input.sessionId,
        })),
        entities: (parsed.entities ?? []).map((item) => ({
          ...item,
          sourceSessionId: input.sessionId,
        })),
      };
    } catch {
      return {
        episode: null,
        semanticFacts: [],
        procedures: [],
        entities: [],
      };
    }
  }
}
