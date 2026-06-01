/**
 * 智能记忆召回（对齐 CCB findRelevantMemories）
 *
 * 从全库轻量 manifest（id + recallHint + summary）中，
 * 用轻量模型侧查询选出与当前 query 最相关的 ≤N 条记忆。
 */
import type { LLMProvider } from '../llm/types.js';
import { rankManifestIdsByQuery } from './recall-utils.js';

export type RecallMemoryType = 'entity' | 'semantic' | 'procedural' | 'episodic';

export interface RecallManifestItem {
  id: string;
  type: RecallMemoryType;
  recallHint: string;
  summary: string;
}

const SELECT_SYSTEM_PROMPT = [
  'You select the most relevant project memories for the current user query.',
  'Return JSON: { "selectedIds": ["id1", "id2"] }',
  'Rules:',
  '- Pick at most the requested max count',
  '- Use recallHint as the PRIMARY relevance signal (it lists future search keywords)',
  '- Match intent even when the query is vague or uses pronouns ("that issue", "last time")',
  '- Prefer memories that directly help answer or execute the current task',
  '- Skip tangentially related items',
].join('\n');

export class MemoryRecallSelector {
  constructor(
    private provider: LLMProvider,
    private model: string,
  ) {}

  /**
   * 从全量 manifest 中选出最相关的记忆 id。
   * LLM 失败时回退到 keyword 软排序（不丢弃 score=0 的项）。
   */
  async selectRelevant(
    query: string,
    items: RecallManifestItem[],
    maxSelect: number,
  ): Promise<string[]> {
    if (!items.length) return [];
    if (items.length <= maxSelect) return items.map((i) => i.id);

    const manifest = items
      .map(
        (item) =>
          `- id: ${item.id} | type: ${item.type} | recallHint: ${item.recallHint}`,
      )
      .join('\n');

    const userContent = [
      `Query: ${query}`,
      `Max selections: ${maxSelect}`,
      '',
      'Available memories (full catalog — select by recallHint relevance):',
      manifest,
    ].join('\n');

    try {
      const generator = this.provider.chat({
        model: this.model,
        messages: [
          { role: 'system', content: SELECT_SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
      });

      let result = await generator.next();
      while (!result.done) {
        result = await generator.next();
      }

      const text = result.value.content ?? '{}';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch?.[0] ?? '{}') as { selectedIds?: string[] };
      const validIds = new Set(items.map((i) => i.id));
      const selected = (parsed.selectedIds ?? []).filter((id) => validIds.has(id));

      if (selected.length > 0) {
        return selected.slice(0, maxSelect);
      }
    } catch {
      // fall through to soft keyword ranking
    }

    return rankManifestIdsByQuery(query, items, maxSelect);
  }
}
