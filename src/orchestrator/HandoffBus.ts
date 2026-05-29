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
