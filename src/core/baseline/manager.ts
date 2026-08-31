import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Finding } from '../findings/types.js';
import { Logger } from '../logger.js';

const log = new Logger({ prefix: 'Baseline' });

export interface BaselineEntry {
  fingerprint: string;
  ruleId?: string;
  category: string;
  selector?: string;
  urlPath: string;
  title: string;
  severity: string;
  suppressedAt: string;
  reason?: string;
}

export interface BaselineFile {
  version: '1.0';
  targetUrl: string;
  createdAt: string;
  updatedAt: string;
  entries: BaselineEntry[];
}

export class BaselineManager {
  /**
   * Generates a stable fingerprint for matching a finding against a baseline.
   */
  static generateFindingFingerprint(f: Finding): string {
    let pathname = '/';
    if (f.url) {
      try {
        pathname = new URL(f.url).pathname;
      } catch {
        pathname = f.url;
      }
    }
    const rule = f.ruleId ?? f.category;
    const sel = f.selector ?? '';
    return `${rule}|${sel}|${pathname}`;
  }

  /**
   * Load baseline file from path. Returns null if file does not exist or is invalid.
   */
  static loadBaseline(filePath: string): BaselineFile | null {
    const fullPath = resolve(process.cwd(), filePath);
    if (!existsSync(fullPath)) {
      return null;
    }

    try {
      const content = readFileSync(fullPath, 'utf-8');
      const parsed = JSON.parse(content) as BaselineFile;
      if (parsed.version === '1.0' && Array.isArray(parsed.entries)) {
        log.info(`Loaded baseline with ${parsed.entries.length} suppressed findings from ${filePath}`);
        return parsed;
      }
    } catch (err) {
      log.warn(`Failed to parse baseline file ${filePath}: ${err}`);
    }

    return null;
  }

  /**
   * Save findings as the new baseline file.
   */
  static saveBaseline(filePath: string, findings: Finding[], targetUrl: string): void {
    const fullPath = resolve(process.cwd(), filePath);
    const now = new Date().toISOString();

    const entries: BaselineEntry[] = findings.map((f) => {
      let urlPath = '/';
      if (f.url) {
        try {
          urlPath = new URL(f.url).pathname;
        } catch {
          urlPath = f.url;
        }
      }

      return {
        fingerprint: BaselineManager.generateFindingFingerprint(f),
        ruleId: f.ruleId,
        category: f.category,
        selector: f.selector,
        urlPath,
        title: f.title,
        severity: f.severity,
        suppressedAt: now,
      };
    });

    const baseline: BaselineFile = {
      version: '1.0',
      targetUrl,
      createdAt: existsSync(fullPath)
        ? (JSON.parse(readFileSync(fullPath, 'utf-8')).createdAt ?? now)
        : now,
      updatedAt: now,
      entries,
    };

    writeFileSync(fullPath, JSON.stringify(baseline, null, 2), 'utf-8');
    log.info(`Saved baseline with ${entries.length} findings to ${filePath}`);
  }

  /**
   * Filter findings against a baseline.
   * Returns active (new/unsuppressed) findings and suppressed findings.
   */
  static filterFindings(
    findings: Finding[],
    baseline: BaselineFile
  ): { active: Finding[]; suppressed: Finding[] } {
    const baselineFingerprints = new Set(baseline.entries.map((e) => e.fingerprint));
    const active: Finding[] = [];
    const suppressed: Finding[] = [];

    for (const f of findings) {
      const fp = BaselineManager.generateFindingFingerprint(f);
      if (baselineFingerprints.has(fp)) {
        suppressed.push(f);
      } else {
        active.push(f);
      }
    }

    if (suppressed.length > 0) {
      log.info(`Baseline suppressed ${suppressed.length} known findings (${active.length} active remaining)`);
    }

    return { active, suppressed };
  }
}
