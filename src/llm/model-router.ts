import type { AgentRole } from './types.js';

export interface ModelConfig {
  conductor: string;
  coder: string;
  explorer: string;
  planner: string;
  reviewer: string;
  verifier: string;
  reflection: string;
}

export class ModelRouter {
  constructor(private models: ModelConfig) {}

  resolve(role: AgentRole): string {
    return this.models[role];
  }
}
