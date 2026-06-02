/**
 * Agent 路由器（AgentRouter）
 *
 * 处理 Conductor 的 dispatch 工具调用：
 * 1. 根据 agent 名称查找配置（工具集、模型、max_turns）
 * 2. 启动独立的 AgentLoop 运行子 Agent
 * 3. 将结果包装为 HandoffReport 返回
 *
 * 与 Claude Code 的 AgentTool 类似，但用显式 HandoffReport 替代纯文本 tool_result。
 */
import { randomUUID } from 'node:crypto';
import { loadConfig } from '../config/load-config.js';
import { AgentLoop } from '../engine/AgentLoop.js';
import type { ModelRouter } from '../llm/model-router.js';
import { QwenProvider } from '../llm/qwen-provider.js';
import type { AgentRole } from '../llm/types.js';
import { handoffToToolResult, type HandoffReport } from './types.js';
import { buildAgentToolRegistry } from '../mcp/build-agent-registry.js';
import type { McpManager } from '../mcp/McpManager.js';
import type { ToolContext } from '../tools/types.js';

/** dispatch 工具中的 agent 名 → ModelRouter 角色 */
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
    private mcpManager: McpManager | null = null,
  ) {}

  /** 同步派发：阻塞等待子 Agent 完成，返回 HandoffReport */
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

    const registry = await buildAgentToolRegistry(params.agent, this.mcpManager);
    const loop = new AgentLoop({
      provider: this.provider,
      model: this.modelRouter.resolve(role),
      tools: registry,
      maxTurns: profile.max_turns,
      agentId: params.agent,
      systemPrompt: buildSubAgentPrompt(params.agent, params.task),
      permissionMode: 'ask', // 子 Agent 的 write/bash 也需用户确认
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

function buildSubAgentPrompt(agentId: string, _task: string): string {
  const lines = [
    `You are the ${agentId} specialist agent in OmniCode.`,
    'Complete the assigned task using only your allowed tools.',
    'When finished, provide a concise summary of what you found or changed.',
  ];

  if (agentId === 'verifier' || agentId === 'coder') {
    lines.push(
      'For shell commands you must call the bash tool and return its real output.',
      'Never invent or simulate terminal output.',
    );
  }

  return lines.join('\n');
}
