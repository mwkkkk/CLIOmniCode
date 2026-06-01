/**
 * Reflection 记忆提炼流水线（Phase 1）
 *
 * 在 session 结束（/exit、/new）时运行：
 * 1. 用便宜模型分析 L1 transcript 摘要
 * 2. 直接写入 Episode + Entity
 * 3. semantic / procedural 写入候选池（不直接入库）
 */
import type { LLMProvider } from '../llm/types.js';
import { CandidatePoolStore } from './CandidatePoolStore.js';
import { EntityStore } from './EntityStore.js';
import { EpisodicStore } from './EpisodicStore.js';
import { fallbackRecallHint, RECALL_HINT_GUIDELINES } from './recall-utils.js';
import type { ReflectionExtraction, ReflectionResult } from './types.js';

export interface ReflectionInput {
  sessionId: string;
  projectHash: string;
  transcriptSummary: string;
}

export class ReflectionPipeline {
  constructor(
    private provider: LLMProvider,
    private model: string,
    private entityConfidenceThreshold: number,
    private proceduralMinSteps: number,
  ) {}

  async run(input: ReflectionInput, dataDir: string): Promise<ReflectionResult> {
    const extraction = await this.extract(input);

    const entity = EntityStore.forProject(dataDir, input.projectHash);
    const episodic = EpisodicStore.forProject(dataDir, input.projectHash);
    const candidatePool = CandidatePoolStore.forProject(dataDir, input.projectHash);

    let savedEntities = 0;
    for (const candidate of extraction.entities) {
      const saved = await entity.upsert(
        { ...candidate, sourceSessionId: input.sessionId },
        this.entityConfidenceThreshold,
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
        recallHint:
          extraction.episode.recallHint ||
          fallbackRecallHint([
            extraction.episode.title,
            ...extraction.episode.tags,
          ]),
      });
      await candidatePool.incrementEpisodeCount();
      episodeSaved = true;
    }

    let savedSemanticCandidates = 0;
    for (const candidate of extraction.semanticFacts) {
      const saved = await candidatePool.appendSemantic({
        ...candidate,
        sourceSessionId: input.sessionId,
      });
      if (saved) savedSemanticCandidates += 1;
    }

    let savedProceduralCandidates = 0;
    for (const candidate of extraction.procedures) {
      if (candidate.steps.length < this.proceduralMinSteps) continue;

      const saved = await candidatePool.appendProcedural({
        ...candidate,
        sourceSessionId: input.sessionId,
      });
      if (saved) savedProceduralCandidates += 1;
    }

    return {
      episodeSaved,
      savedEntities,
      savedSemanticCandidates,
      savedProceduralCandidates,
      skipped: false,
    };
  }

  private async extract(input: ReflectionInput): Promise<ReflectionExtraction> {
    const prompt = [
      'Analyze this coding session transcript and extract durable memories.',
      'Return a single JSON object with this shape:',
      '{',
      '  "episode": { "title": "...", "narrative": "...", "outcome": "...", "tags": ["..."], "recallHint": "..." } | null,',
      '  "semanticFacts": [{ "category": "...", "content": "...", "recallHint": "...", "confidence": 0.0-1.0 }],',
      '  "procedures": [{ "title": "...", "steps": ["..."], "tags": ["..."], "recallHint": "...", "confidence": 0.0-1.0 }],',
      '  "entities": [{ "entity": "...", "attribute": "...", "value": "...", "recallHint": "...", "confidence": 0.0-1.0 }]',
      '}',
      '',
      'Global rule — only store what CANNOT be derived from the current codebase:',
      '- DO NOT save file paths, function names, line numbers, or repo structure (use tools at runtime)',
      '- DO NOT save git history or current code layout',
      '- DO save decisions, constraints, pitfalls, preferences, and process lessons',
      '',
      RECALL_HINT_GUIDELINES,
      '',
      'Guidelines:',
      '- episode: task narrative (context, process, result)',
      '- semanticFacts (max 5): cross-session patterns ONLY',
      '  - NOT event descriptions ("we did X today") — that is episode',
      '  - NOT user preferences — that is entity',
      '- procedures (max 3): domain-specific reusable SOPs',
      `  - MUST have >= ${this.proceduralMinSteps} steps; NOT trivial ("read file then explain")`,
      '- entities (max 10): stable facts (user.preferred_language = Python)',
      '- Also capture validated approaches: if user confirmed "yes, do it this way", save as entity or semantic',
      '- Every item MUST include a non-empty recallHint following the rules above',
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
          recallHint?: string;
        } | null;
        semanticFacts?: Array<{
          category: ReflectionExtraction['semanticFacts'][0]['category'];
          content: string;
          recallHint?: string;
          confidence: number;
        }>;
        procedures?: Array<{
          title: string;
          steps: string[];
          tags?: string[];
          recallHint?: string;
          confidence: number;
        }>;
        entities?: Array<{
          entity: string;
          attribute: string;
          value: string;
          recallHint?: string;
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
              recallHint: parsed.episode.recallHint ?? '',
              sourceSessionId: input.sessionId,
            }
          : null,
        semanticFacts: (parsed.semanticFacts ?? []).map((item) => ({
          category: item.category,
          content: item.content,
          recallHint:
            item.recallHint || fallbackRecallHint([item.category, item.content]),
          confidence: item.confidence,
          sourceSessionId: input.sessionId,
        })),
        procedures: (parsed.procedures ?? [])
          .filter((item) => item.steps.length >= this.proceduralMinSteps)
          .map((item) => ({
            title: item.title,
            steps: item.steps,
            tags: item.tags ?? [],
            recallHint:
              item.recallHint || fallbackRecallHint([item.title, ...(item.tags ?? [])]),
            confidence: item.confidence,
            sourceSessionId: input.sessionId,
          })),
        entities: (parsed.entities ?? []).map((item) => ({
          entity: item.entity,
          attribute: item.attribute,
          value: item.value,
          recallHint:
            item.recallHint ||
            fallbackRecallHint([item.entity, item.attribute, item.value]),
          confidence: item.confidence,
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
