/**
 * 上下文管理器（ContextManager）
 *
 * 动态组装 System Prompt，注入：
 * - 基础角色指令 + 记忆漂移防御
 * - 项目 OMNI.md
 * - L2/L3 记忆（全库 manifest + flash 侧查询精选，对齐 CCB findRelevantMemories）
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  getRecallMaxTotal,
  isSmartRecallEnabled,
  loadConfig,
} from '../config/load-config.js';
import type { LLMProvider } from '../llm/types.js';
import { EntityStore } from '../memory/EntityStore.js';
import { EpisodicStore } from '../memory/EpisodicStore.js';
import {
  MemoryRecallSelector,
  type RecallManifestItem,
} from '../memory/MemoryRecallSelector.js';
import { ProceduralStore } from '../memory/ProceduralStore.js';
import {
  MEMORY_DRIFT_DEFENSE,
  fallbackRecallHint,
  rankManifestIdsByQuery,
} from '../memory/recall-utils.js';
import { SemanticStore } from '../memory/SemanticStore.js';
import type { EntityFact, Episode, Procedure, SemanticFact } from '../memory/types.js';

export class ContextManager {
  constructor(private provider?: LLMProvider) {}

  async buildSystemPrompt(options: {
    cwd: string;
    agentId: string;
    projectHash: string;
    dataDir: string;
    userQuery?: string;
    reflectionModel?: string;
    extra?: string;
  }): Promise<string> {
    const config = await loadConfig();
    const query = options.userQuery ?? 'project conventions';

    const parts: string[] = [
      'You are OmniCode, a terminal-native agentic coding assistant.',
      `Working directory: ${options.cwd}`,
      `Active agent: ${options.agentId}`,
      '',
      'Use tools to read, search, and modify code. Think step by step.',
      'Prefer small, verifiable changes. Run tests when appropriate.',
      'Always respond in the same language the user uses (e.g. Chinese if they write in Chinese).',
      'Do not paste full file contents in chat when you can use write/edit tools instead.',
      '',
      MEMORY_DRIFT_DEFENSE,
    ];

    const omniMd = await this.readProjectFile(options.cwd, 'OMNI.md');
    if (omniMd) {
      parts.push('', '## Project Memory (OMNI.md)', omniMd);
    }

    const entityStore = EntityStore.forProject(options.dataDir, options.projectHash);
    const semanticStore = SemanticStore.forProject(options.dataDir, options.projectHash);
    const proceduralStore = ProceduralStore.forProject(options.dataDir, options.projectHash);
    const episodicStore = EpisodicStore.forProject(options.dataDir, options.projectHash);

    const [entities, semantics, procedures, episodes] = await Promise.all([
      entityStore.list(),
      semanticStore.list(),
      proceduralStore.list(),
      episodicStore.list(),
    ]);

    const manifest = this.buildManifest(entities, semantics, procedures, episodes);
    const maxTotal = getRecallMaxTotal(config);

    let selectedIds: Set<string>;
    const useSideQuery =
      isSmartRecallEnabled(config) &&
      this.provider &&
      options.reflectionModel &&
      manifest.length > maxTotal;

    if (useSideQuery && this.provider && options.reflectionModel) {
      const selector = new MemoryRecallSelector(this.provider, options.reflectionModel);
      const ids = await selector.selectRelevant(query, manifest, maxTotal);
      selectedIds = new Set(ids);
    } else if (manifest.length > maxTotal) {
      const ids = rankManifestIdsByQuery(query, manifest, maxTotal);
      selectedIds = new Set(ids);
    } else {
      selectedIds = new Set(manifest.map((m) => m.id));
    }

    const selectedEntities = entities.filter((e) => selectedIds.has(e.id));
    const selectedSemantics = semantics.filter((s) => selectedIds.has(s.id));
    const selectedProcedures = procedures.filter((p) => selectedIds.has(p.id));
    const selectedEpisodes = episodes.filter((e) => selectedIds.has(e.id));

    if (selectedEntities.length > 0) {
      parts.push('', '## Entity Memory (structured facts)');
      for (const fact of selectedEntities) {
        parts.push(`- ${fact.entity}.${fact.attribute} = ${fact.value}`);
      }
    }

    if (selectedSemantics.length > 0) {
      parts.push('', '## Semantic Memory (general knowledge)');
      for (const fact of selectedSemantics) {
        parts.push(`- [${fact.category}] ${fact.content}`);
      }
    }

    if (selectedProcedures.length > 0) {
      parts.push('', '## Procedural Memory (reusable SOPs)');
      for (const proc of selectedProcedures) {
        parts.push(`- ${proc.title}:`);
        for (const [index, step] of proc.steps.entries()) {
          parts.push(`  ${index + 1}. ${step}`);
        }
      }
    }

    if (selectedEpisodes.length > 0) {
      parts.push('', '## Episodic Memory (past experiences)');
      for (const episode of selectedEpisodes) {
        parts.push(
          `- [${episode.createdAt.slice(0, 10)}] ${episode.title}: ${episode.narrative}`,
        );
        if (episode.outcome) {
          parts.push(`  Outcome: ${episode.outcome}`);
        }
      }
    }

    if (options.extra) {
      parts.push('', options.extra);
    }

    return parts.join('\n');
  }

  private buildManifest(
    entities: EntityFact[],
    semantics: SemanticFact[],
    procedures: Procedure[],
    episodes: Episode[],
  ): RecallManifestItem[] {
    const items: RecallManifestItem[] = [];

    for (const fact of entities) {
      items.push({
        id: fact.id,
        type: 'entity',
        recallHint:
          fact.recallHint ||
          fallbackRecallHint([fact.entity, fact.attribute, fact.value]),
        summary: `${fact.entity}.${fact.attribute} = ${fact.value}`,
      });
    }

    for (const fact of semantics) {
      items.push({
        id: fact.id,
        type: 'semantic',
        recallHint:
          fact.recallHint || fallbackRecallHint([fact.category, fact.content]),
        summary: `[${fact.category}] ${fact.content.slice(0, 80)}`,
      });
    }

    for (const proc of procedures) {
      items.push({
        id: proc.id,
        type: 'procedural',
        recallHint:
          proc.recallHint || fallbackRecallHint([proc.title, ...proc.tags]),
        summary: `${proc.title} (${proc.steps.length} steps)`,
      });
    }

    for (const episode of episodes) {
      items.push({
        id: episode.id,
        type: 'episodic',
        recallHint:
          episode.recallHint ||
          fallbackRecallHint([episode.title, ...episode.tags]),
        summary: `${episode.title}: ${episode.narrative.slice(0, 80)}`,
      });
    }

    return items;
  }

  private async readProjectFile(cwd: string, name: string): Promise<string | null> {
    try {
      return await readFile(join(cwd, name), 'utf-8');
    } catch {
      return null;
    }
  }
}
