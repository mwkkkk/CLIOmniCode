import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { SessionMeta } from './types.js';

export function hashProjectPath(projectPath: string): string {
  return createHash('sha256').update(projectPath).digest('hex').slice(0, 16);
}

export class SessionIndex {
  constructor(private indexPath: string) {}

  static async open(dataDir: string): Promise<SessionIndex> {
    const indexPath = join(dataDir, 'sessions', 'index.json');
    await mkdir(join(dataDir, 'sessions'), { recursive: true });
    return new SessionIndex(indexPath);
  }

  async list(projectPath?: string): Promise<SessionMeta[]> {
    const all = await this.read();
    if (!projectPath) return all;
    const hash = hashProjectPath(projectPath);
    return all.filter((s) => s.projectHash === hash);
  }

  async get(id: string): Promise<SessionMeta | undefined> {
    return (await this.read()).find((s) => s.id === id);
  }

  async create(projectPath: string, title?: string): Promise<SessionMeta> {
    const now = new Date().toISOString();
    const session: SessionMeta = {
      id: randomUUID(),
      projectPath,
      projectHash: hashProjectPath(projectPath),
      title: title ?? `Session ${now.slice(0, 16)}`,
      tags: [],
      status: 'active',
      createdAt: now,
      lastActiveAt: now,
      tokenUsage: { input: 0, output: 0 },
    };

    const all = await this.read();
    all.unshift(session);
    await this.write(all);
    return session;
  }

  async touch(id: string, usage?: { input: number; output: number }): Promise<void> {
    const all = await this.read();
    const session = all.find((s) => s.id === id);
    if (!session) return;

    session.lastActiveAt = new Date().toISOString();
    if (usage) {
      session.tokenUsage.input += usage.input;
      session.tokenUsage.output += usage.output;
    }
    await this.write(all);
  }

  async complete(id: string): Promise<void> {
    const all = await this.read();
    const session = all.find((s) => s.id === id);
    if (session) {
      session.status = 'completed';
      session.lastActiveAt = new Date().toISOString();
      await this.write(all);
    }
  }

  private async read(): Promise<SessionMeta[]> {
    try {
      const raw = await readFile(this.indexPath, 'utf-8');
      return JSON.parse(raw) as SessionMeta[];
    } catch {
      return [];
    }
  }

  private async write(sessions: SessionMeta[]): Promise<void> {
    await writeFile(this.indexPath, JSON.stringify(sessions, null, 2), 'utf-8');
  }
}
