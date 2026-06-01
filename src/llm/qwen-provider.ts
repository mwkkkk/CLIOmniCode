/**
 * 千问（DashScope）LLM Provider
 *
 * 通过 OpenAI 兼容接口调用阿里云百炼：
 * - Base URL: https://dashscope.aliyuncs.com/compatible-mode/v1
 * - 支持流式输出 + Function Calling
 * - 流式 tool_calls 需经 ToolCallAccumulator 聚合后才能执行
 */
import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions.js';
import { ToolCallAccumulator } from './tool-call-accumulator.js';
import type {
  ChatParams,
  CompletedChat,
  LLMProvider,
  StreamEvent,
  ToolDefinition,
} from './types.js';

/** 内部 ToolDefinition → OpenAI tools 参数格式 */
function toOpenAITools(tools: ToolDefinition[]): ChatCompletionTool[] {
  return tools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

/** 内部 ChatMessage → OpenAI messages 格式（含 tool / tool_calls 角色） */
function toOpenAIMessages(messages: ChatParams['messages']): ChatCompletionMessageParam[] {
  return messages.map((message) => {
    if (message.role === 'tool') {
      return {
        role: 'tool',
        tool_call_id: message.tool_call_id!,
        content: message.content ?? '',
      };
    }

    if (message.role === 'assistant') {
      return {
        role: 'assistant',
        content: message.content,
        tool_calls: message.tool_calls?.map((call) => ({
          id: call.id,
          type: 'function' as const,
          function: {
            name: call.function.name,
            arguments: call.function.arguments,
          },
        })),
      };
    }

    return {
      role: message.role,
      content: message.content ?? '',
    };
  });
}

export class QwenProvider implements LLMProvider {
  private client: OpenAI;

  constructor(apiKey?: string, baseURL?: string) {
    const key = apiKey ?? process.env.DASHSCOPE_API_KEY;
    const url =
      baseURL ??
      process.env.DASHSCOPE_BASE_URL ??
      'https://dashscope.aliyuncs.com/compatible-mode/v1';

    if (!key) {
      throw new Error(
        'DASHSCOPE_API_KEY is required. Set it in your shell environment or .env file.',
      );
    }

    this.client = new OpenAI({ apiKey: key, baseURL: url });
  }

  /**
   * 流式 chat 调用
   * yield StreamEvent 供 UI 实时渲染；return CompletedChat 供 AgentLoop 决策
   */
  async *chat(params: ChatParams): AsyncGenerator<StreamEvent, CompletedChat> {
    const accumulator = new ToolCallAccumulator();
    let content = '';
    let finishReason: string | null | undefined;
    let usage: CompletedChat['usage'];

    const stream = await this.client.chat.completions.create(
      {
        model: params.model,
        messages: toOpenAIMessages(params.messages),
        tools: params.tools?.length ? toOpenAITools(params.tools) : undefined,
        stream: true,
        stream_options: { include_usage: true },
        parallel_tool_calls: true, // 允许模型一次返回多个 tool_call
      },
      { signal: params.signal },
    );

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      const delta = choice?.delta;

      if (delta?.content) {
        content += delta.content;
        yield { type: 'text_delta', content: delta.content };
      }

      if (delta?.tool_calls?.length) {
        accumulator.append(delta.tool_calls);
        for (const call of delta.tool_calls) {
          yield { type: 'tool_call_delta', index: call.index ?? 0 };
        }
      }

      if (choice?.finish_reason) {
        finishReason = choice.finish_reason;
      }

      if (chunk.usage) {
        usage = {
          promptTokens: chunk.usage.prompt_tokens,
          completionTokens: chunk.usage.completion_tokens,
          totalTokens: chunk.usage.total_tokens,
        };
      }
    }

    const toolCalls = accumulator.finalize();

    return {
      content: content || null,
      toolCalls,
      usage,
      finishReason,
    };
  }
}
