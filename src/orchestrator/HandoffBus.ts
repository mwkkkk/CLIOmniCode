/**
 * 交接总线（HandoffBus）
 *
 * 收集多个子 Agent 的 HandoffReport，供调试和 trace 使用。
 * 当前为预留模块，AgentRouter 尚未接入 publish。
 */
import type { HandoffReport } from './types.js';

export class HandoffBus {
  private reports: HandoffReport[] = [];

  publish(report: HandoffReport): void {
    this.reports.push(report);
  }

  list(): HandoffReport[] {
    return [...this.reports];
  }

  latest(agentId?: string): HandoffReport | undefined {
    if (agentId) {
      return [...this.reports].reverse().find((r) => r.agentId === agentId);
    }
    return this.reports.at(-1);
  }
}
