/**
 * 元工具：ask_user / dispatch
 *
 * 不直接操作文件系统，而是扩展 Agent 的交互与编排能力。
 */
import { z } from 'zod';
import type { Tool } from './types.js';

/** 让 LLM 向用户提问并等待回答（需求澄清） */
export const askUserTool: Tool<{ question: string }> = {
  name: 'ask_user',
  description: 'Ask the user a clarifying question and wait for their answer.',
  parameters: {
    type: 'object',
    properties: {
      question: { type: 'string' },
    },
    required: ['question'],
  },
  schema: z.object({ question: z.string() }),
  isReadOnly: true,
  isDestructive: false,
  async execute(input, context) {
    const answer = await context.askUser(input.question);
    return { success: true, output: answer };
  },
};

/**
 * 派发给子 Agent（planner/explorer/coder/reviewer/verifier）
 *
 * 实际执行不在 meta-tools.execute 中，而是由 AgentLoop 拦截后
 * 交给 AgentRouter.dispatch() 启动独立的 AgentLoop。
 * 标记为 isDestructive 是因为会触发子 Agent 的写操作。
 */
export const dispatchTool: Tool<{
  agent: string;
  task: string;
  run_mode?: 'sync' | 'async';
}> = {
  name: 'dispatch',
  description:
    'Delegate a sub-task to a specialist agent (planner, explorer, coder, reviewer, verifier). Returns a structured handoff report.',
  parameters: {
    type: 'object',
    properties: {
      agent: {
        type: 'string',
        enum: ['planner', 'explorer', 'coder', 'reviewer', 'verifier'],
      },
      task: { type: 'string', description: 'Full task description for the sub-agent' },
      run_mode: { type: 'string', enum: ['sync', 'async'], description: 'sync (default) or async' },
    },
    required: ['agent', 'task'],
  },
  schema: z.object({
    agent: z.enum(['planner', 'explorer', 'coder', 'reviewer', 'verifier']),
    task: z.string(),
    run_mode: z.enum(['sync', 'async']).optional(),
  }),
  isReadOnly: false,
  isDestructive: true,
  async execute() {
    return {
      success: false,
      output: '',
      error: 'dispatch is handled by AgentRouter, not executed directly',
    };
  },
};
