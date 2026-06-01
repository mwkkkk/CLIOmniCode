/**
 * 会话类型定义
 */

export type SessionStatus = 'active' | 'paused' | 'completed';

/** Session 元数据，存储在 ~/.omni/sessions/index.json */
export interface SessionMeta {
  id: string;
  projectPath: string; // 创建 session 时的 cwd
  projectHash: string; // hash(projectPath)，用于按项目过滤
  parentSessionId?: string; // 预留：子 Agent fork 的父 session
  title: string;
  tags: string[];
  status: SessionStatus;
  createdAt: string;
  lastActiveAt: string;
  tokenUsage: {
    input: number;
    output: number;
  };
}

/** Transcript 中的一条记录，JSONL 每行一个 */
export interface TranscriptEntry {
  type: 'chat_message' | 'message' | 'tool_call' | 'tool_result' | 'handoff';
  timestamp: string;
  payload: unknown;
}
