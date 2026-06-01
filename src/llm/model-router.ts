/**
 * 模型路由器（Model Router）
 *
 * 按 Agent 角色从 omni.config.yaml 的 models 配置中选取千问模型。
 * 例如：explorer 用 qwen-flash（快/便宜），coder 用 qwen3-coder-plus（代码专用）。
 */
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
