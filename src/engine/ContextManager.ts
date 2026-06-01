/**
 * 上下文管理器（ContextManager）
 *
 * 动态组装 System Prompt，注入：
 * - 基础角色指令
 * - 项目 OMNI.md（项目级记忆）
 * - L3 实体记忆（结构化事实）
 * - L2 语义记忆（通用知识与规律）
 * - L2 程序记忆（可复用 SOP）
 * - L2 情节记忆（相似历史经历）
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from '../config/load-config.js';
import { EntityStore } from '../memory/EntityStore.js';
import { EpisodicStore } from '../memory/EpisodicStore.js';
import { ProceduralStore } from '../memory/ProceduralStore.js';
import { SemanticStore } from '../memory/SemanticStore.js';

export class ContextManager {
  async buildSystemPrompt(options: {
    cwd: string;
    agentId: string;
    projectHash: string;
    dataDir: string;
    userQuery?: string;
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
    ];

    const omniMd = await this.readProjectFile(options.cwd, 'OMNI.md');
    if (omniMd) {
      parts.push('', '## Project Memory (OMNI.md)', omniMd);
    }

    const entityStore = EntityStore.forProject(options.dataDir, options.projectHash);
    const entities = await entityStore.recall(query, config.memory.entity_recall_top_k ?? 10);
    if (entities.length > 0) {
      parts.push('', '## Entity Memory (structured facts)');
      for (const fact of entities) {
        parts.push(`- ${fact.entity}.${fact.attribute} = ${fact.value}`);
      }
    }

    const semantic = SemanticStore.forProject(options.dataDir, options.projectHash);
    const facts = await semantic.recall(query, config.memory.semantic_recall_top_k ?? 5);
    if (facts.length > 0) {
      parts.push('', '## Semantic Memory (general knowledge)');
      for (const fact of facts) {
        parts.push(`- [${fact.category}] ${fact.content}`);
      }
    }

    const procedural = ProceduralStore.forProject(options.dataDir, options.projectHash);
    const procedures = await procedural.recall(query, config.memory.procedural_recall_top_k ?? 3);
    if (procedures.length > 0) {
      parts.push('', '## Procedural Memory (reusable SOPs)');
      for (const proc of procedures) {
        parts.push(`- ${proc.title}:`);
        for (const [index, step] of proc.steps.entries()) {
          parts.push(`  ${index + 1}. ${step}`);
        }
      }
    }

    const episodic = EpisodicStore.forProject(options.dataDir, options.projectHash);
    const episodes = await episodic.recall(query, config.memory.episodic_recall_top_k ?? 3);
    if (episodes.length > 0) {
      parts.push('', '## Episodic Memory (past experiences)');
      for (const episode of episodes) {
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

  private async readProjectFile(cwd: string, name: string): Promise<string | null> {
    try {
      return await readFile(join(cwd, name), 'utf-8');
    } catch {
      return null;
    }
  }
}
