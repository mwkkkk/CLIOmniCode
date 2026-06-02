/**
 * Agent 核心循环（Agentic Loop）
 *
 * 这是 OmniCode 的心脏：while 循环驱动 LLM 与工具之间的往返。
 *
 * 每一轮 (turn)：
 * 1. 将 messages + tools 发送给 LLM（流式）
 * 2. 若 LLM 返回 tool_calls → 执行工具 → 将 tool_result 追加到 messages
 * 3. 若无 tool_calls → 循环结束
 *
 * 参考 Claude Code 的 query.ts，但实现更精简。
 */
import type { LLMProvider, ChatMessage, ToolCall } from '../llm/types.js';
import { AgentRouter } from '../orchestrator/AgentRouter.js';
import { toolsToDefinitions } from '../tools/registry.js';
import type { ToolContext, ToolRegistry } from '../tools/types.js';

/** 创建 AgentLoop 时的静态配置 */
export interface AgentLoopOptions {
  provider: LLMProvider;
  model: string;
  tools: ToolRegistry;
  maxTurns: number;
  agentId: string;
  systemPrompt: string;
  agentRouter?: AgentRouter; // 仅 Conductor 需要，用于处理 dispatch 工具
  permissionMode?: 'ask' | 'auto'; // ask = 危险操作前询问用户
}

/** 单次 run 的动态参数 */
export interface RunOptions {
  userMessage: string;
  cwd: string;
  sessionId: string;
  /** L1 短期记忆：本 session 内此前轮次的完整 messages（不含 system） */
  historyMessages?: ChatMessage[];
  askUser: ToolContext['askUser'];
  onText?: (text: string) => void; // 流式文本回调
  signal?: AbortSignal;
}

export interface RunResult {
  success: boolean; // false 表示达到 maxTurns 上限
  finalMessage: string | null;
  turns: number;
  usage: { input: number; output: number };
  /** 本次 run 新增的 messages（user + assistant + tool），用于写回 L1 */
  newMessages: ChatMessage[];
}

export class AgentLoop {
  constructor(private options: AgentLoopOptions) {}

  async run(runOptions: RunOptions): Promise<RunResult> {
    const history = runOptions.historyMessages ?? [];
    const userMessage: ChatMessage = { role: 'user', content: runOptions.userMessage };
    const messages: ChatMessage[] = [
      { role: 'system', content: this.options.systemPrompt },
      ...history,
      userMessage,
    ];
    const historyLength = messages.length;

    const toolDefs = toolsToDefinitions(this.options.tools);
    let turns = 0;
    let totalInput = 0;
    let totalOutput = 0;
    let finalMessage: string | null = null;

    while (turns < this.options.maxTurns) {
      turns += 1;

      // --- 阶段 1：调用 LLM，消费流式事件 ---
      const generator = this.options.provider.chat({
        model: this.options.model,
        messages,
        tools: toolDefs,
        signal: runOptions.signal,
      });

      let event = await generator.next();
      while (!event.done) {
        if (event.value.type === 'text_delta') {
          runOptions.onText?.(event.value.content);
        }
        event = await generator.next();
      }

      const completion = event.value;
      if (completion.usage) {
        totalInput += completion.usage.promptTokens;
        totalOutput += completion.usage.completionTokens;
      }

      // --- 阶段 2：将 assistant 回复（含 tool_calls）追加到对话 ---
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: completion.content,
        tool_calls: completion.toolCalls.length ? completion.toolCalls : undefined,
      };
      messages.push(assistantMessage);

      if (completion.content) {
        finalMessage = completion.content;
      }

      // 无工具调用 → Agent 认为任务完成，退出循环
      if (!completion.toolCalls.length) {
        break;
      }

      // --- 阶段 3：逐个执行工具，结果作为 role:tool 消息回传 ---
      for (const call of completion.toolCalls) {
        const toolResult = await this.executeToolCall(call, runOptions);
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: toolResult,
        });
      }
    }

    return {
      success: turns < this.options.maxTurns,
      finalMessage,
      turns,
      usage: { input: totalInput, output: totalOutput },
      newMessages: messages.slice(historyLength),
    };
  }

  /** 危险操作（write/edit/bash/dispatch）在 ask 模式下需用户确认 */
  private async confirmDestructiveTool(
    name: string,
    input: unknown,
    runOptions: RunOptions,
  ): Promise<boolean> {
    if (this.options.permissionMode !== 'ask') return true;

    const tool = this.options.tools.get(name);
    if (!tool || tool.isReadOnly || !tool.isDestructive) return true;

    const approved = await runOptions.askUser(
      `Allow ${name} with input: ${JSON.stringify(input).slice(0, 200)}? (y/n)`,
    );
    return /^y(es)?$/i.test(approved.trim());
  }

  /**
   * 执行单个 tool_call
   * dispatch 走 AgentRouter 特殊路径；其余走 ToolRegistry
   */
  private async executeToolCall(call: ToolCall, runOptions: RunOptions): Promise<string> {
    const name = call.function.name;
    let input: unknown;

    try {
      input = JSON.parse(call.function.arguments || '{}');
    } catch {
      return JSON.stringify({ success: false, error: 'Invalid tool arguments JSON' });
    }

    const tool = this.options.tools.get(name);
    if (!tool) {
      return JSON.stringify({ success: false, error: `Unknown tool: ${name}` });
    }

    const parsed = tool.schema.safeParse(input);
    if (!parsed.success) {
      return JSON.stringify({ success: false, error: parsed.error.message });
    }

    if (!(await this.confirmDestructiveTool(name, parsed.data, runOptions))) {
      return JSON.stringify({ success: false, error: 'User denied permission' });
    }

    // dispatch 不由 meta-tools.execute 处理，而是启动子 Agent
    if (name === 'dispatch' && this.options.agentRouter) {
      const args = parsed.data as { agent: string; task: string; run_mode?: 'sync' | 'async' };
      const report = await this.options.agentRouter.dispatch({
        agent: args.agent,
        task: args.task,
        runMode: args.run_mode,
        parentSessionId: runOptions.sessionId,
        cwd: runOptions.cwd,
        askUser: runOptions.askUser,
        onText: runOptions.onText,
      });
      return this.options.agentRouter.formatHandoff(report);
    }

    const context: ToolContext = {
      cwd: runOptions.cwd,
      sessionId: runOptions.sessionId,
      agentId: this.options.agentId,
      askUser: runOptions.askUser,
    };

    const result = await tool.execute(parsed.data, context);
    return JSON.stringify(result);
  }
}
