export type SessionStatus = 'active' | 'paused' | 'completed';

export interface SessionMeta {
  id: string;
  projectPath: string;
  projectHash: string;
  parentSessionId?: string;
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

export interface TranscriptEntry {
  type: 'message' | 'tool_call' | 'tool_result' | 'handoff';
  timestamp: string;
  payload: unknown;
}
