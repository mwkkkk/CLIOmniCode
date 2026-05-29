export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

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

export interface LLMProvider {
  chat(params: ChatParams): AsyncGenerator<StreamEvent, CompletedChat>;
}

export interface CompletedChat {
  content: string | null;
  toolCalls: ToolCall[];
  usage?: TokenUsage;
  finishReason?: string | null;
}

export type AgentRole =
  | 'conductor'
  | 'planner'
  | 'explorer'
  | 'coder'
  | 'reviewer'
  | 'verifier'
  | 'reflection';
