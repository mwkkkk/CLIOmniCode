import type { z } from 'zod';

export interface ToolContext {
  cwd: string;
  sessionId: string;
  agentId: string;
  askUser: (question: string) => Promise<string>;
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}

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
