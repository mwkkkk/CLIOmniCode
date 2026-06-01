/**
 * 多 Agent 编排类型
 *
 * HandoffReport 是子 Agent 完成任务后返回给 Conductor 的结构化交接物，
 * 避免大段自然语言污染主 Agent 的上下文。
 */

export type HandoffStatus = 'success' | 'partial' | 'blocked';

/** 子 Agent 产出的具体成果（文件、计划、review 等） */
export interface Artifact {
  type: 'file' | 'plan' | 'findings' | 'review' | 'test_report';
  path?: string;
  summary: string;
}

/** Reflection 阶段建议写入长期记忆的事实 */
export interface MemoryCandidate {
  category: 'preference' | 'convention' | 'architecture' | 'pitfall' | 'decision';
  content: string;
  confidence: number;
  sourceSessionId: string;
}

/** 子 Agent → Conductor 的结构化交接报告 */
export interface HandoffReport {
  agentId: string;
  taskId: string;
  status: HandoffStatus;
  summary: string;
  artifacts: Artifact[];
  openQuestions: string[];
  memoryCandidates: MemoryCandidate[];
}

/** 将 HandoffReport 序列化为 tool_result 字符串回传给 LLM */
export function handoffToToolResult(report: HandoffReport): string {
  return JSON.stringify(report, null, 2);
}
