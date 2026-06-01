/**
 * LLM 层类型定义
 *
 * 抽象了与具体模型供应商无关的消息、工具、流式事件类型。
 * QwenProvider 实现 LLMProvider 接口，未来可扩展其他 Provider。
 */

/** LLM 返回的工具调用请求（OpenAI function calling 格式） */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON 字符串，需 parse 后使用
  };
}

/** 传给 LLM 的工具 schema 定义 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** 对话消息，兼容 OpenAI Chat Completions 格式 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[]; // assistant 消息携带
  tool_call_id?: string; // tool 消息携带，关联对应的 tool_call
  name?: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** 流式 API 返回的事件类型 */
export type StreamEvent =
  | { type: 'text_delta'; content: string }
  | { type: 'tool_call_delta'; index: number }
  | { type: 'done'; usage?: TokenUsage; finishReason?: string | null };

export interface ChatParams {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  signal?: AbortSignal;
}

/** LLM 供应商抽象接口 */
export interface LLMProvider {
  chat(params: ChatParams): AsyncGenerator<StreamEvent, CompletedChat>;
}

/** 一次完整 chat 调用的最终结果（generator 的 return value） */
export interface CompletedChat {
  content: string | null;
  toolCalls: ToolCall[];
  usage?: TokenUsage;
  finishReason?: string | null;
}

/** Agent 角色，对应 omni.config.yaml 中的 models 键 */
export type AgentRole =
  | 'conductor'
  | 'planner'
  | 'explorer'
  | 'coder'
  | 'reviewer'
  | 'verifier'
  | 'reflection';
