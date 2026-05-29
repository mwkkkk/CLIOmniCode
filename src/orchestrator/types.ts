export type HandoffStatus = 'success' | 'partial' | 'blocked';

export interface Artifact {
  type: 'file' | 'plan' | 'findings' | 'review' | 'test_report';
  path?: string;
  summary: string;
}

export interface MemoryCandidate {
  category: 'preference' | 'convention' | 'architecture' | 'pitfall' | 'decision';
  content: string;
  confidence: number;
  sourceSessionId: string;
}

export interface HandoffReport {
  agentId: string;
  taskId: string;
  status: HandoffStatus;
  summary: string;
  artifacts: Artifact[];
  openQuestions: string[];
  memoryCandidates: MemoryCandidate[];
}

export function handoffToToolResult(report: HandoffReport): string {
  return JSON.stringify(report, null, 2);
}
