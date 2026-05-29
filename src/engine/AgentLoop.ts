import type { LLMProvider, ChatMessage, ToolCall } from '../llm/types.js';
import { AgentRouter } from '../orchestrator/AgentRouter.js';
import { toolsToDefinitions } from '../tools/registry.js';
import type { ToolContext, ToolRegistry } from '../tools/types.js';

export interface AgentLoopOptions {
  provider: LLMProvider;
  model: string;
  tools: ToolRegistry;
  maxTurns: number;
  agentId: string;
  systemPrompt: string;
  agentRouter?: AgentRouter;
  permissionMode?: 'ask' | 'auto';
}

export interface RunOptions {
  userMessage: string;
  cwd: string;
  sessionId: string;
  askUser: ToolContext['askUser'];
  onText?: (text: string) => void;
  signal?: AbortSignal;
}

export interface RunResult {
  success: boolean;
  finalMessage: string | null;
  turns: number;
  usage: { input: number; output: number };
}

export class AgentLoop {
  constructor(private options: AgentLoopOptions) {}

  async run(runOptions: RunOptions): Promise<RunResult> {
    const messages: ChatMessage[] = [
      { role: 'system', content: this.options.systemPrompt },
      { role: 'user', content: runOptions.userMessage },
    ];

    const toolDefs = toolsToDefinitions(this.options.tools);
    let turns = 0;
    let totalInput = 0;
    let totalOutput = 0;
    let finalMessage: string | null = null;

    while (turns < this.options.maxTurns) {
      turns += 1;

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

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: completion.content,
        tool_calls: completion.toolCalls.length ? completion.toolCalls : undefined,
      };
      messages.push(assistantMessage);

      if (completion.content) {
        finalMessage = completion.content;
      }

      if (!completion.toolCalls.length) {
        break;
      }

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
    };
  }

  private async executeToolCall(call: ToolCall, runOptions: RunOptions): Promise<string> {
    const name = call.function.name;
    let input: unknown;

    try {
      input = JSON.parse(call.function.arguments || '{}');
    } catch {
      return JSON.stringify({ success: false, error: 'Invalid tool arguments JSON' });
    }

    if (name === 'dispatch' && this.options.agentRouter) {
      const args = input as { agent: string; task: string; run_mode?: 'sync' | 'async' };
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

    const tool = this.options.tools.get(name);
    if (!tool) {
      return JSON.stringify({ success: false, error: `Unknown tool: ${name}` });
    }

    const parsed = tool.schema.safeParse(input);
    if (!parsed.success) {
      return JSON.stringify({ success: false, error: parsed.error.message });
    }

    if (
      this.options.permissionMode === 'ask' &&
      !tool.isReadOnly &&
      tool.isDestructive
    ) {
      const approved = await runOptions.askUser(
        `Allow ${name} with input: ${JSON.stringify(parsed.data).slice(0, 200)}? (y/n)`,
      );
      if (!/^y(es)?$/i.test(approved.trim())) {
        return JSON.stringify({ success: false, error: 'User denied permission' });
      }
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
