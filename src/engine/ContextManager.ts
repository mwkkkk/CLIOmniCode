import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from '../config/load-config.js';
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
    const parts: string[] = [
      'You are OmniCode, a terminal-native agentic coding assistant.',
      `Working directory: ${options.cwd}`,
      `Active agent: ${options.agentId}`,
      '',
      'Use tools to read, search, and modify code. Think step by step.',
      'Prefer small, verifiable changes. Run tests when appropriate.',
    ];

    const omniMd = await this.readProjectFile(options.cwd, 'OMNI.md');
    if (omniMd) {
      parts.push('', '## Project Memory (OMNI.md)', omniMd);
    }

    const config = await loadConfig();
    const semantic = SemanticStore.forProject(options.dataDir, options.projectHash);
    const facts = await semantic.recall(
      options.userQuery ?? 'project conventions',
      config.memory.semantic_recall_top_k,
    );

    if (facts.length > 0) {
      parts.push('', '## Recalled Memories');
      for (const fact of facts) {
        parts.push(`- [${fact.category}] ${fact.content}`);
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
