/**
 * Consolidation 记忆归纳流水线（Phase 2）
 *
 * 跨 episode 归纳 pending 候选，满足证据门槛后才写入 SemanticStore / ProceduralStore。
 */
import type { LLMProvider } from '../llm/types.js';
import type { ConsolidationConfig } from '../config/load-config.js';
import { CandidatePoolStore } from './CandidatePoolStore.js';
import { EpisodicStore } from './EpisodicStore.js';
import { ProceduralStore } from './ProceduralStore.js';
import { SemanticStore } from './SemanticStore.js';
import { fallbackRecallHint, RECALL_HINT_GUIDELINES } from './recall-utils.js';
import type {
  CandidateRecord,
  ConsolidationExtraction,
  ConsolidationResult,
  ProceduralCandidate,
  ProceduralPromotion,
  SemanticPromotion,
} from './types.js';

const TRIVIAL_PROCEDURE_PATTERNS = [
  /^read\b.*\bexplain/i,
  /^read\b.*\banalyze/i,
  /^use read tool/i,
  /^read file/i,
];

export interface ConsolidationInput {
  projectHash: string;
  force?: boolean;
}

export class ConsolidationPipeline {
  constructor(
    private provider: LLMProvider,
    private model: string,
    private config: ConsolidationConfig,
  ) {}

  shouldRun(state: {
    pendingSemanticCount: number;
    pendingProceduralCount: number;
    episodesSinceLastConsolidation: number;
  }): boolean {
    if (!this.config.auto) return false;

    return (
      state.pendingSemanticCount >= this.config.min_pending_semantic ||
      state.pendingProceduralCount >= this.config.min_pending_procedural ||
      state.episodesSinceLastConsolidation >= this.config.min_episodes_since_last
    );
  }

  async run(input: ConsolidationInput, dataDir: string): Promise<ConsolidationResult> {
    const candidatePool = CandidatePoolStore.forProject(dataDir, input.projectHash);
    const episodic = EpisodicStore.forProject(dataDir, input.projectHash);
    const semantic = SemanticStore.forProject(dataDir, input.projectHash);
    const procedural = ProceduralStore.forProject(dataDir, input.projectHash);

    const pendingSemantic = await candidatePool.listPending('semantic');
    const pendingProcedural = await candidatePool.listPending('procedural');

    if (!pendingSemantic.length && !pendingProcedural.length) {
      return { promotedSemantic: 0, promotedProcedural: 0, rejected: 0, kept: 0 };
    }

    const recentEpisodes = (await episodic.list()).slice(0, 10);
    const existingSemanticFacts = await semantic.list();
    const existingProcedures = await procedural.list();

    const extraction = await this.extract({
      pendingSemantic,
      pendingProcedural,
      recentEpisodes,
      existingSemanticFacts,
      existingProcedures,
    });

    let promotedSemantic = 0;
    let promotedProcedural = 0;
    let rejected = 0;
    let kept = 0;

    for (const promotion of extraction.semanticToPromote) {
      if (!this.validateSemanticPromotion(promotion)) {
        kept += promotion.sourceCandidateIds.length;
        continue;
      }

      const saved = await semantic.append(
        {
          category: promotion.category,
          content: promotion.content,
          recallHint: promotion.recallHint,
          confidence: promotion.confidence,
          sourceSessionId: promotion.sourceSessionIds[0] ?? 'consolidation',
        },
        this.config.semantic_confidence,
      );

      if (saved) {
        promotedSemantic += 1;
        await candidatePool.markResolved(
          promotion.sourceCandidateIds,
          'promoted',
          saved.id,
        );
      }
    }

    for (const promotion of extraction.proceduresToPromote) {
      if (!this.validateProceduralPromotion(promotion, pendingProcedural, recentEpisodes)) {
        kept += promotion.sourceCandidateIds.length;
        continue;
      }

      const saved = await procedural.append(
        {
          title: promotion.title,
          steps: promotion.steps,
          tags: promotion.tags,
          recallHint: promotion.recallHint,
          confidence: promotion.confidence,
          sourceSessionId:
            pendingProcedural.find((r) => promotion.sourceCandidateIds.includes(r.id))
              ?.sourceSessionId ?? 'consolidation',
        },
        this.config.procedural_confidence,
      );

      if (saved) {
        promotedProcedural += 1;
        await candidatePool.markResolved(
          promotion.sourceCandidateIds,
          'promoted',
          saved.id,
        );
      }
    }

    for (const item of extraction.candidatesToReject) {
      const resolution = this.mapRejectReason(item.reason);
      await candidatePool.markResolved([item.id], resolution);
      rejected += 1;
    }

    kept += extraction.candidatesToKeep.length;

    await candidatePool.resetAfterConsolidation();

    return { promotedSemantic, promotedProcedural, rejected, kept };
  }

  private validateSemanticPromotion(promotion: SemanticPromotion): boolean {
    if (!promotion.content.trim()) return false;
    if (promotion.confidence < this.config.semantic_confidence) return false;

    const uniqueSessions = new Set(promotion.sourceSessionIds);
    if (promotion.evidenceStrength === 'strong' && promotion.confidence >= 0.9) {
      return true;
    }

    return uniqueSessions.size >= 2 || promotion.sourceCandidateIds.length >= 2;
  }

  private validateProceduralPromotion(
    promotion: ProceduralPromotion,
    pendingProcedural: CandidateRecord[],
    recentEpisodes: Array<{ outcome: string; tags: string[]; title: string }>,
  ): boolean {
    if (promotion.confidence < this.config.procedural_confidence) return false;
    if (promotion.steps.length < this.config.procedural_min_steps) return false;
    if (this.isTrivialProcedure(promotion.title)) return false;

    if (promotion.sourceCandidateIds.length >= 2) return true;

    const candidate = pendingProcedural.find((r) =>
      promotion.sourceCandidateIds.includes(r.id),
    );
    if (!candidate) return false;

    const payload = candidate.payload as ProceduralCandidate;
    const hasMatchingEpisode = recentEpisodes.some((ep) => {
      const epText = [ep.title, ep.outcome, ...ep.tags].join(' ').toLowerCase();
      return (
        ep.outcome.length > 0 &&
        (payload.tags.some((tag) => epText.includes(tag.toLowerCase())) ||
          epText.includes(payload.title.toLowerCase().slice(0, 20)))
      );
    });

    return hasMatchingEpisode && promotion.sourceCandidateIds.length >= 1;
  }

  private isTrivialProcedure(title: string): boolean {
    return TRIVIAL_PROCEDURE_PATTERNS.some((pattern) => pattern.test(title));
  }

  private mapRejectReason(
    reason: string,
  ): 'rejected_noise' | 'rejected_insufficient_evidence' {
    if (reason === 'insufficient_evidence' || reason === 'needs_more_evidence') {
      return 'rejected_insufficient_evidence';
    }
    return 'rejected_noise';
  }

  private async extract(context: {
    pendingSemantic: CandidateRecord[];
    pendingProcedural: CandidateRecord[];
    recentEpisodes: Array<{
      sessionId: string;
      title: string;
      narrative: string;
      outcome: string;
      tags: string[];
    }>;
    existingSemanticFacts: Array<{ category: string; content: string }>;
    existingProcedures: Array<{ title: string; steps: string[] }>;
  }): Promise<ConsolidationExtraction> {
    const inputPayload = {
      pendingSemanticCandidates: context.pendingSemantic.map((r) => ({
        id: r.id,
        ...r.payload,
        sourceSessionId: r.sourceSessionId,
      })),
      pendingProceduralCandidates: context.pendingProcedural.map((r) => ({
        id: r.id,
        ...r.payload,
        sourceSessionId: r.sourceSessionId,
      })),
      recentEpisodes: context.recentEpisodes.map((ep) => ({
        sessionId: ep.sessionId,
        title: ep.title,
        narrative: ep.narrative,
        outcome: ep.outcome,
        tags: ep.tags,
      })),
      existingSemanticFacts: context.existingSemanticFacts.map((f) => ({
        category: f.category,
        content: f.content,
      })),
      existingProcedures: context.existingProcedures.map((p) => ({
        title: p.title,
        steps: p.steps,
      })),
    };

    const prompt = [
      'Consolidate pending memory candidates into durable long-term memories.',
      'Input JSON:',
      JSON.stringify(inputPayload, null, 2),
      '',
      'Return JSON:',
      '{',
      '  "semanticToPromote": [{ "category", "content", "recallHint", "confidence", "evidenceStrength": "normal|strong", "sourceCandidateIds": [], "sourceSessionIds": [] }],',
      '  "proceduresToPromote": [{ "title", "steps", "tags", "recallHint", "confidence", "sourceCandidateIds": [] }],',
      '  "candidatesToReject": [{ "id", "reason": "noise|single_event|trivial|duplicate|derivable_from_code" }],',
      '  "candidatesToKeep": [{ "id", "reason": "needs_more_evidence" }]',
      '}',
      '',
      'Global rule — reject anything derivable from reading the current codebase:',
      '- No file paths, symbol names, or repo layout as semantic facts',
      '- No single-session event narratives promoted as patterns',
      '',
      RECALL_HINT_GUIDELINES,
      '',
      'Rules:',
      '- semanticToPromote: cross-session patterns; each MUST have a strong recallHint',
      '- proceduresToPromote: validated domain SOPs only; recallHint = task-type search keywords',
      '- reject noise, single-event mislabels, trivial workflows, code-derivable facts',
      '- keep candidates needing more episodes',
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
      const parsed = JSON.parse(jsonMatch?.[0] ?? '{}') as ConsolidationExtraction;
      return {
        semanticToPromote: (parsed.semanticToPromote ?? []).map((p) => ({
          ...p,
          recallHint:
            p.recallHint || fallbackRecallHint([p.category, p.content]),
        })),
        proceduresToPromote: (parsed.proceduresToPromote ?? []).map((p) => ({
          ...p,
          recallHint:
            p.recallHint || fallbackRecallHint([p.title, ...p.tags]),
        })),
        candidatesToReject: parsed.candidatesToReject ?? [],
        candidatesToKeep: parsed.candidatesToKeep ?? [],
      };
    } catch {
      return {
        semanticToPromote: [],
        proceduresToPromote: [],
        candidatesToReject: [],
        candidatesToKeep: context.pendingSemantic
          .concat(context.pendingProcedural)
          .map((r) => ({ id: r.id, reason: 'needs_more_evidence' })),
      };
    }
  }
}
