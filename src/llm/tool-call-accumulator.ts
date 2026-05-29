import type { ToolCall } from './types.js';

interface PartialToolCall {
  id?: string;
  type?: 'function';
  function?: {
    name?: string;
    arguments?: string;
  };
}

/**
 * Aggregates streaming tool_call chunks into complete ToolCall objects.
 * Qwen/DashScope sends tool arguments incrementally over SSE chunks.
 */
export class ToolCallAccumulator {
  private calls = new Map<number, ToolCall>();

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
