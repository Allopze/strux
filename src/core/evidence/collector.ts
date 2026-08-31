import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from 'playwright';
import { Logger } from '../logger.js';

const log = new Logger({ prefix: 'Evidence' });

export interface EvidenceItem {
  type: 'screenshot' | 'dom-fragment' | 'selector' | 'bounding-box' | 'console-log' |
        'axe-violation' | 'network-failure' | 'trace' | 'navigation-path' | 'computed-styles';
  path?: string;
  content?: string;
  selector?: string;
  boundingBox?: { x: number; y: number; width: number; height: number };
  metadata?: Record<string, unknown>;
}

/**
 * Manages evidence collection: screenshots, DOM snapshots, traces, etc.
 */
export class EvidenceCollector {
  private baseDir: string;

  constructor(outputDir: string) {
    this.baseDir = outputDir;
    this.ensureDirs();
  }

  private ensureDirs(): void {
    const dirs = [
      'screenshots',
      'states',
      'accessibility',
      'console',
      'network',
      'findings',
      'traces',
    ];
    for (const dir of dirs) {
      const path = join(this.baseDir, dir);
      if (!existsSync(path)) {
        mkdirSync(path, { recursive: true });
      }
    }
  }

  async captureScreenshot(
    page: Page,
    name: string,
    fullPage: boolean = false
  ): Promise<string> {
    const path = join(this.baseDir, 'screenshots', `${name}.png`);
    try {
      await page.screenshot({ path, fullPage, timeout: 10000 });
      log.debug(`Screenshot: ${name}`);
      return path;
    } catch (err) {
      log.warn(`Failed to capture screenshot ${name}: ${err}`);
      return '';
    }
  }

  async captureDomSnippet(
    page: Page,
    selector?: string
  ): Promise<string> {
    try {
      if (selector) {
        const el = page.locator(selector).first();
        return await el.evaluate((node) => node.outerHTML).catch(() => '');
      }

      // Capture a simplified DOM overview
      return await page.evaluate((): string => {
        const body = document.body;
        if (!body) return '';

        function isElementVisible(el: Element): boolean {
          const htmlEl = el as HTMLElement;
          if (htmlEl.offsetParent === null && htmlEl.tagName !== 'BODY' && htmlEl.tagName !== 'HTML') {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
          }
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden';
        }

        function simplify(el: Element, depth: number): string {
          if (depth > 4) return '...';
          if (!isElementVisible(el) && el !== body) return '';
          const tag = el.tagName.toLowerCase();
          const attrs: string[] = [];
          if ((el as HTMLElement).id) attrs.push(`id="${(el as HTMLElement).id}"`);
          const role = el.getAttribute('role');
          if (role) attrs.push(`role="${role}"`);
          const ariaLabel = el.getAttribute('aria-label');
          if (ariaLabel) attrs.push(`aria-label="${ariaLabel}"`);

          const attrStr = attrs.length ? ' ' + attrs.join(' ') : '';
          const children = Array.from(el.children)
            .filter((c) => isElementVisible(c))
            .slice(0, 10)
            .map((c) => simplify(c, depth + 1))
            .filter(Boolean)
            .join('\n');

          if (children) {
            return `<${tag}${attrStr}>\n${children}\n</${tag}>`;
          }
          const text = (el.textContent || '').trim().slice(0, 50);
          return `<${tag}${attrStr}>${text}</${tag}>`;
        }

        return simplify(body, 0).slice(0, 5000);
      });
    } catch {
      return '';
    }
  }

  async captureHeadings(
    page: Page
  ): Promise<Array<{ level: number; text: string }>> {
    try {
      return await page.evaluate((): Array<{ level: number; text: string }> => {
        const headings: Array<{ level: number; text: string }> = [];
        document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((h: Element) => {
          const htmlEl = h as HTMLElement;
          const style = window.getComputedStyle(h);
          const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && (htmlEl.offsetParent !== null || h.tagName === 'BODY');
          if (isVisible) {
            const level = parseInt(h.tagName[1]!, 10);
            headings.push({ level, text: (h.textContent || '').trim().slice(0, 200) });
          }
        });
        return headings;
      });
    } catch {
      return [];
    }
  }

  async captureLandmarks(
    page: Page
  ): Promise<Array<{ role: string; label?: string }>> {
    try {
      return await page.evaluate((): Array<{ role: string; label?: string }> => {
        const landmarks: Array<{ role: string; label?: string }> = [];
        const semanticTags: Record<string, string> = {
          HEADER: 'banner',
          NAV: 'navigation',
          MAIN: 'main',
          FOOTER: 'contentinfo',
          ASIDE: 'complementary',
          FORM: 'form',
          SECTION: 'region',
          DIALOG: 'dialog',
        };

        function isVisible(el: Element): boolean {
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden';
        }

        // Explicit roles
        document.querySelectorAll('[role]').forEach((el: Element) => {
          if (!isVisible(el)) return;
          const role = el.getAttribute('role');
          if (role && ['banner', 'navigation', 'main', 'contentinfo',
            'complementary', 'form', 'region', 'search', 'dialog', 'alertdialog'].includes(role)) {
            landmarks.push({
              role,
              label: el.getAttribute('aria-label') || undefined,
            });
          }
        });

        // Implicit roles from semantic tags
        for (const [tag, role] of Object.entries(semanticTags)) {
          document.querySelectorAll(tag.toLowerCase()).forEach((el: Element) => {
            if (!isVisible(el)) return;
            if (!el.getAttribute('role')) {
              landmarks.push({
                role,
                label: el.getAttribute('aria-label') || undefined,
              });
            }
          });
        }

        return landmarks;
      });
    } catch {
      return [];
    }
  }

  getArtifactPath(category: string, name: string): string {
    return join(this.baseDir, category, name);
  }
}
