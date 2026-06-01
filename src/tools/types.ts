/**
 * 工具系统类型定义
 *
 * 每个 Tool 是 AI 的「手」：LLM 通过 function calling 发起 tool_use，
 * AgentLoop 解析后调用 Tool.execute() 执行实际操作。
 */
import type { z } from 'zod';

/** 工具执行时的上下文，由 AgentLoop 注入 */
export interface ToolContext {
  cwd: string; // 当前工作目录，文件/命令操作的边界
  sessionId: string;
  agentId: string;
  askUser: (question: string) => Promise<string>; // 权限确认 & ask_user 工具共用
}

/** 工具执行结果，序列化为 JSON 回传给 LLM */
export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}

/**
 * 统一工具接口
 * - parameters: JSON Schema，传给 LLM 做 function calling
 * - schema: Zod 校验，execute 前验证 LLM 传入的参数
 * - isReadOnly / isDestructive: 权限系统标记
 */
export interface Tool<TInput = unknown> {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  schema: z.ZodType<TInput>;
  isReadOnly: boolean;
  isDestructive: boolean;
  execute(input: TInput, context: ToolContext): Promise<ToolResult>;
}

export type ToolRegistry = Map<string, Tool>;
