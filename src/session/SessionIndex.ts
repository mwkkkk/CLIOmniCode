/**
 * Session 索引（SessionIndex）
 *
 * 管理 ~/.omni/sessions/index.json，记录所有 session 的元数据。
 * list() 按 projectHash 过滤；可传 status 只取 active / completed 等。
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { SessionMeta } from './types.js';

/** 将项目绝对路径 hash 为 16 位 hex，用于 session 分组 */
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

  /**
   * 列出 session
   * @param projectPath 若传入，只返回该项目的 session（按 hash 匹配）
   */
  async list(projectPath?: string, status?: SessionMeta['status']): Promise<SessionMeta[]> {
    const all = await this.read();
    let filtered = all;
    if (projectPath) {
      const hash = hashProjectPath(projectPath);
      filtered = filtered.filter((s) => s.projectHash === hash);
    }
    if (status) {
      filtered = filtered.filter((s) => s.status === status);
    }
    return filtered;
  }

  async get(id: string): Promise<SessionMeta | undefined> {
    return (await this.read()).find((s) => s.id === id);
  }

  /** 创建新 session，标题默认为用户首条消息的前 80 字符 */
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

  /** 更新最后活跃时间和 token 累计用量 */
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
