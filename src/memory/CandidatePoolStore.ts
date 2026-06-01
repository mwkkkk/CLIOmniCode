/**
 * 语义 / 程序记忆候选池
 *
 * session 结束时 Reflection 将 semantic / procedural 候选写入此池；
 * Consolidation 阶段跨 episode 归纳后才 promote 到正式 Store。
 *
 * 存储：~/.omni/candidates/{projectHash}/pool.jsonl + state.json
 */
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  CandidateRecord,
  CandidateResolution,
  CandidateType,
  ConsolidationState,
  ProceduralCandidate,
  SemanticCandidate,
} from './types.js';

const DEFAULT_STATE: ConsolidationState = {
  lastConsolidatedAt: null,
  episodesSinceLastConsolidation: 0,
  pendingSemanticCount: 0,
  pendingProceduralCount: 0,
};

export class CandidatePoolStore {
  constructor(
    private poolPath: string,
    private statePath: string,
  ) {}

  static forProject(dataDir: string, projectHash: string): CandidatePoolStore {
    const base = join(dataDir, 'candidates', projectHash);
    return new CandidatePoolStore(join(base, 'pool.jsonl'), join(base, 'state.json'));
  }

  async appendSemantic(candidate: SemanticCandidate): Promise<CandidateRecord | null> {
    const pending = await this.listPending('semantic');
    const duplicate = pending.find(
      (r) =>
        (r.payload as SemanticCandidate).content.toLowerCase() ===
        candidate.content.toLowerCase(),
    );
    if (duplicate) return null;

    return this.appendRecord('semantic', candidate, candidate.sourceSessionId);
  }

  async appendProcedural(candidate: ProceduralCandidate): Promise<CandidateRecord | null> {
    const pending = await this.listPending('procedural');
    const existing = pending.find(
      (r) =>
        (r.payload as ProceduralCandidate).title.toLowerCase() === candidate.title.toLowerCase(),
    );

    if (existing) {
      const existingPayload = existing.payload as ProceduralCandidate;
      if (candidate.steps.length <= existingPayload.steps.length) return null;

      await this.markResolved([existing.id], 'merged');
      return this.appendRecord('procedural', candidate, candidate.sourceSessionId);
    }

    return this.appendRecord('procedural', candidate, candidate.sourceSessionId);
  }

  async listPending(type?: CandidateType): Promise<CandidateRecord[]> {
    const all = await this.readAll();
    return all.filter(
      (r) => r.status === 'pending' && (type === undefined || r.type === type),
    );
  }

  async markResolved(
    ids: string[],
    resolution: CandidateResolution,
    promotedToId?: string,
  ): Promise<void> {
    if (!ids.length) return;

    const all = await this.readAll();
    const idSet = new Set(ids);
    const now = new Date().toISOString();

    for (const record of all) {
      if (!idSet.has(record.id)) continue;
      record.status = resolution.startsWith('rejected') ? 'rejected' : 'consolidated';
      record.resolvedAt = now;
      record.resolution = resolution;
      if (promotedToId) record.promotedToId = promotedToId;
    }

    await this.writeAll(all);
    await this.refreshPendingCounts();
  }

  async getState(): Promise<ConsolidationState> {
    try {
      const raw = await readFile(this.statePath, 'utf-8');
      return { ...DEFAULT_STATE, ...(JSON.parse(raw) as ConsolidationState) };
    } catch {
      return { ...DEFAULT_STATE };
    }
  }

  async updateState(partial: Partial<ConsolidationState>): Promise<ConsolidationState> {
    const state = { ...(await this.getState()), ...partial };
    await mkdir(join(this.statePath, '..'), { recursive: true });
    await writeFile(this.statePath, JSON.stringify(state, null, 2), 'utf-8');
    return state;
  }

  async incrementEpisodeCount(): Promise<void> {
    const state = await this.getState();
    await this.updateState({
      episodesSinceLastConsolidation: state.episodesSinceLastConsolidation + 1,
    });
  }

  async resetAfterConsolidation(): Promise<void> {
    await this.updateState({
      lastConsolidatedAt: new Date().toISOString(),
      episodesSinceLastConsolidation: 0,
    });
    await this.refreshPendingCounts();
  }

  private async appendRecord(
    type: CandidateType,
    payload: SemanticCandidate | ProceduralCandidate,
    sourceSessionId: string,
  ): Promise<CandidateRecord> {
    const record: CandidateRecord = {
      id: randomUUID(),
      type,
      status: 'pending',
      payload,
      sourceSessionId,
      createdAt: new Date().toISOString(),
    };

    await mkdir(join(this.poolPath, '..'), { recursive: true });
    await appendFile(this.poolPath, `${JSON.stringify(record)}\n`, 'utf-8');
    await this.refreshPendingCounts();
    return record;
  }

  private async refreshPendingCounts(): Promise<void> {
    const pending = await this.listPending();
    await this.updateState({
      pendingSemanticCount: pending.filter((r) => r.type === 'semantic').length,
      pendingProceduralCount: pending.filter((r) => r.type === 'procedural').length,
    });
  }

  private async readAll(): Promise<CandidateRecord[]> {
    try {
      const raw = await readFile(this.poolPath, 'utf-8');
      return raw
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as CandidateRecord);
    } catch {
      return [];
    }
  }

  private async writeAll(records: CandidateRecord[]): Promise<void> {
    await mkdir(join(this.poolPath, '..'), { recursive: true });
    const content = records.map((r) => JSON.stringify(r)).join('\n');
    await writeFile(this.poolPath, content ? `${content}\n` : '', 'utf-8');
  }
}
