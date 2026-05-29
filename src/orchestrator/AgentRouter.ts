import { randomUUID } from 'node:crypto';
import { loadConfig } from '../config/load-config.js';
import { AgentLoop } from '../engine/AgentLoop.js';
import type { ModelRouter } from '../llm/model-router.js';
import { QwenProvider } from '../llm/qwen-provider.js';
import type { AgentRole } from '../llm/types.js';
import { handoffToToolResult, type HandoffReport } from './types.js';
import { createToolRegistry } from '../tools/registry.js';
import type { ToolContext } from '../tools/types.js';

const AGENT_ROLE_MAP: Record<string, AgentRole> = {
  planner: 'planner',
  explorer: 'explorer',
  coder: 'coder',
  reviewer: 'reviewer',
  verifier: 'verifier',
};

export interface DispatchParams {
  agent: string;
  task: string;
  runMode?: 'sync' | 'async';
  parentSessionId: string;
  cwd: string;
  askUser: ToolContext['askUser'];
  onText?: (text: string) => void;
}

export class AgentRouter {
  constructor(
    private provider: QwenProvider,
    private modelRouter: ModelRouter,
  ) {}

  async dispatch(params: DispatchParams): Promise<HandoffReport> {
    const role = AGENT_ROLE_MAP[params.agent];
    if (!role) {
      throw new Error(`Unknown agent: ${params.agent}`);
    }

    if (params.runMode === 'async') {
      return {
        agentId: params.agent,
        taskId: randomUUID(),
        status: 'blocked',
        summary: 'Async dispatch is not implemented yet. Use run_mode: sync.',
        artifacts: [],
        openQuestions: [],
        memoryCandidates: [],
      };
    }

    const config = await loadConfig();
    const profile = config.agents[params.agent];
    if (!profile) {
      throw new Error(`No profile for agent: ${params.agent}`);
    }

    const registry = createToolRegistry(profile.tools);
    const loop = new AgentLoop({
      provider: this.provider,
      model: this.modelRouter.resolve(role),
      tools: registry,
      maxTurns: profile.max_turns,
      agentId: params.agent,
      systemPrompt: buildSubAgentPrompt(params.agent, params.task),
    });

    const result = await loop.run({
      userMessage: params.task,
      cwd: params.cwd,
      sessionId: params.parentSessionId,
      askUser: params.askUser,
      onText: params.onText,
    });

    return {
      agentId: params.agent,
      taskId: randomUUID(),
      status: result.success ? 'success' : 'partial',
      summary: result.finalMessage ?? 'Sub-agent completed without text response.',
      artifacts: [],
      openQuestions: [],
      memoryCandidates: [],
    };
  }

  formatHandoff(report: HandoffReport): string {
    return handoffToToolResult(report);
  }
}

function buildSubAgentPrompt(agentId: string, task: string): string {
  return [
    `You are the ${agentId} specialist agent in OmniCode.`,
    'Complete the assigned task using only your allowed tools.',
    'When finished, provide a concise summary of what you found or changed.',
  ].join('\n');
}
