/**
 * 流式 Tool Call 聚合器
 *
 * 千问/DashScope 在 SSE 流式模式下，tool_calls 的参数是分块返回的：
 *   chunk1: { name: "read" }
 *   chunk2: { arguments: "{\"path\":" }
 *   chunk3: { arguments: "\"src/main.ts\"}" }
 *
 * 必须等所有 chunk 聚合完毕才能 JSON.parse arguments，否则会得到截断的 JSON。
 */
import type { ToolCall } from './types.js';

interface PartialToolCall {
  id?: string;
  type?: 'function';
  function?: {
    name?: string;
    arguments?: string;
  };
}

export class ToolCallAccumulator {
  /** 按 index 索引，支持 parallel_tool_calls 多个并发工具 */
  private calls = new Map<number, ToolCall>();

  /** 追加一个 SSE chunk 中的 tool_call 增量 */
  append(partials: PartialToolCall[]): void {
    for (let i = 0; i < partials.length; i++) {
      const partial = partials[i];
      const index = (partial as PartialToolCall & { index?: number }).index ?? i;
      const existing = this.calls.get(index) ?? {
        id: '',
        type: 'function' as const,
        function: { name: '', arguments: '' },
      };

      if (partial.id) {
        existing.id = partial.id;
      }
      if (partial.function?.name) {
        existing.function.name += partial.function.name;
      }
      if (partial.function?.arguments) {
        existing.function.arguments += partial.function.arguments;
      }

      this.calls.set(index, existing);
    }
  }

  /** 返回完整、可执行的 ToolCall 列表 */
  finalize(): ToolCall[] {
    return [...this.calls.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, call]) => call)
      .filter((call) => call.id && call.function.name);
  }

  reset(): void {
    this.calls.clear();
  }
}
