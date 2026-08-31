import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import type { CompletionMessage } from '../../providers/types.js';

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  targetUrl: string;
  messages: CompletionMessage[];
}

export class SessionManager {
  private static getSessionsDir(): string {
    const dir = resolve(homedir(), '.config', 'uiux-auditor', 'sessions');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  static createSession(targetUrl: string = 'http://localhost:3000'): ChatSession {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
    const randomSuffix = Math.random().toString(36).substring(2, 7);
    const id = `session_${timestamp}_${randomSuffix}`;

    const session: ChatSession = {
      id,
      title: `Nueva sesión (${targetUrl})`,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      targetUrl,
      messages: [],
    };

    SessionManager.saveSession(session);
    return session;
  }

  static saveSession(session: ChatSession): void {
    try {
      if (!SessionManager.isValidSessionId(session.id)) return;
      const dir = SessionManager.getSessionsDir();
      session.updatedAt = new Date().toISOString();
      const filePath = resolve(dir, `${session.id}.json`);
      writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf-8');
    } catch {
      // Ignore write errors in restricted environments
    }
  }

  static listSessions(): ChatSession[] {
    const dir = SessionManager.getSessionsDir();
    if (!existsSync(dir)) return [];

    const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    const sessions: ChatSession[] = [];

    for (const file of files) {
      try {
        const content = readFileSync(resolve(dir, file), 'utf-8');
        const parsed = JSON.parse(content) as ChatSession;
        if (parsed.id && Array.isArray(parsed.messages)) {
          sessions.push(parsed);
        }
      } catch {
        // Skip corrupted session files
      }
    }

    return sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  static loadSession(idOrPrefix: string): ChatSession | null {
    const sessions = SessionManager.listSessions();
    // 1. Exact match
    const exact = sessions.find((s) => s.id === idOrPrefix);
    if (exact) return exact;

    // 2. Prefix or index match
    const index = parseInt(idOrPrefix, 10);
    if (!isNaN(index) && index >= 1 && index <= sessions.length) {
      return sessions[index - 1] ?? null;
    }

    const partial = sessions.find((s) => s.id.includes(idOrPrefix));
    return partial ?? null;
  }

  static getLatestSession(): ChatSession | null {
    const sessions = SessionManager.listSessions();
    return sessions.length > 0 ? (sessions[0] ?? null) : null;
  }

  static deleteSession(id: string): boolean {
    if (!SessionManager.isValidSessionId(id)) return false;
    const dir = SessionManager.getSessionsDir();
    const filePath = resolve(dir, `${id}.json`);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
      return true;
    }
    return false;
  }

  /**
   * Validate that a session ID does not contain path traversal characters.
   */
  private static isValidSessionId(id: string): boolean {
    return /^[a-zA-Z0-9_-]+$/.test(id);
  }
}
