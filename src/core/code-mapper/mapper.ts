import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import type { Finding, SourceLocation } from '../findings/types.js';
import { Logger } from '../logger.js';

const log = new Logger({ prefix: 'CodeMapper' });

const SEARCHABLE_EXTENSIONS = new Set([
  '.tsx', '.ts', '.jsx', '.js', '.vue', '.svelte',
  '.html', '.astro', '.php', '.blade.php', '.twig', '.css', '.scss',
]);

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out',
  'test-results', 'test-results-integration', 'uiux-audit-results',
  'coverage', '.next', '.nuxt', '.output',
]);

/**
 * Attempts to map findings to source code locations by searching
 * the repository for relevant text, selectors, and identifiers.
 */
export class CodeMapper {
  private repoPath: string;

  constructor(repoPath: string) {
    this.repoPath = repoPath;
  }

  async mapFindings(findings: Finding[]): Promise<Finding[]> {
    if (!existsSync(this.repoPath)) {
      log.warn(`Repository path not found: ${this.repoPath}`);
      return findings;
    }

    let mapped = 0;

    for (const finding of findings) {
      try {
        const locations = await this.findSourceLocations(finding);
        if (locations.length > 0) {
          finding.suspectedSourceFiles = locations;
          mapped++;
        }
      } catch {
        // Skip mapping failures silently
      }
    }

    log.info(`Mapped ${mapped}/${findings.length} findings to source locations`);
    return findings;
  }

  private async findSourceLocations(finding: Finding): Promise<SourceLocation[]> {
    const locations: SourceLocation[] = [];
    const searchTerms = this.extractSearchTerms(finding);

    for (const term of searchTerms) {
      if (term.length < 3) continue;

      try {
        const results = this.searchRepoFiles(term);
        for (const result of results.slice(0, 3)) {
          // Don't add duplicates
          if (locations.some((l) => l.file === result.file && l.line === result.line)) {
            continue;
          }

          locations.push({
            file: result.file,
            line: result.line,
            confidence: this.calculateMappingConfidence(term, result),
          });
        }
      } catch {
        // search may fail, that's fine
      }
    }

    // Sort by confidence
    locations.sort((a, b) => b.confidence - a.confidence);
    return locations.slice(0, 5);
  }

  private extractSearchTerms(finding: Finding): string[] {
    const terms: string[] = [];

    // Extract text from finding
    if (finding.selector) {
      // data-testid selectors
      const testIdMatch = finding.selector.match(/data-testid="([^"]+)"/);
      if (testIdMatch?.[1]) terms.push(testIdMatch[1]);

      // id selectors
      const idMatch = finding.selector.match(/^#([a-zA-Z0-9_-]+)/);
      if (idMatch?.[1]) terms.push(idMatch[1]);
    }

    // URL path segments (likely route names)
    if (finding.url) {
      try {
        const path = new URL(finding.url).pathname;
        const segments = path.split('/').filter((s) => s.length > 2 && !/^\d+$/.test(s));
        terms.push(...segments);
      } catch {
        // Invalid URL
      }
    }

    // Text from finding title (look for quoted strings)
    const quotedStrings = finding.title.match(/"([^"]+)"/g);
    if (quotedStrings) {
      terms.push(...quotedStrings.map((s) => s.replace(/"/g, '')));
    }

    return [...new Set(terms)];
  }

  private searchRepoFiles(term: string): Array<{ file: string; line: number; content: string }> {
    const results: Array<{ file: string; line: number; content: string }> = [];
    const lowerTerm = term.toLowerCase();

    const scanDirectory = (dir: string): void => {
      if (results.length >= 10) return;

      let entries: string[] = [];
      try {
        entries = readdirSync(dir);
      } catch {
        return;
      }

      for (const entry of entries) {
        if (results.length >= 10) break;
        if (IGNORED_DIRS.has(entry)) continue;

        const fullPath = join(dir, entry);
        try {
          const stat = statSync(fullPath);
          if (stat.isDirectory()) {
            scanDirectory(fullPath);
          } else if (stat.isFile()) {
            const ext = extname(entry);
            if (SEARCHABLE_EXTENSIONS.has(ext)) {
              this.searchFile(fullPath, term, lowerTerm, results);
            }
          }
        } catch {
          // File access error, skip
        }
      }
    };

    scanDirectory(this.repoPath);
    return results;
  }

  private searchFile(
    filePath: string,
    rawTerm: string,
    lowerTerm: string,
    results: Array<{ file: string; line: number; content: string }>
  ): void {
    try {
      const content = readFileSync(filePath, 'utf-8');
      if (!content.toLowerCase().includes(lowerTerm)) return;

      const relativePath = relative(this.repoPath, filePath);
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (line.includes(rawTerm) || line.toLowerCase().includes(lowerTerm)) {
          results.push({
            file: relativePath,
            line: i + 1,
            content: line.trim().slice(0, 150),
          });
          if (results.length >= 10) break;
        }
      }
    } catch {
      // Ignore binary or unreadable files
    }
  }

  private calculateMappingConfidence(
    term: string,
    _result: { file: string; line: number; content: string }
  ): number {
    let confidence = 0.5;

    // Longer search terms = higher confidence
    if (term.length > 10) confidence += 0.15;
    if (term.length > 20) confidence += 0.1;

    // Component files are more likely correct
    if (_result.file.match(/\.(tsx|jsx|vue|svelte|html|astro)$/)) confidence += 0.1;

    // data-testid matches are very reliable
    if (term.match(/^[a-z]+-[a-z]+(-[a-z]+)*$/)) confidence += 0.15;

    return Math.min(0.95, confidence);
  }
}
