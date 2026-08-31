import type { Page } from 'playwright';
import type { AuditConfig, Viewport } from '../config/schema.js';
import type { UIState } from '../states/types.js';
import type { Finding } from '../findings/types.js';
import { createRuleFinding } from '../rules/engine.js';
import { navigateToState } from '../browser/navigator.js';
import { Logger } from '../logger.js';

const log = new Logger({ prefix: 'Responsive' });

export interface ResponsiveRunOptions {
  page: Page;
  config: AuditConfig;
  uniqueStates: UIState[];
}

/**
 * Runs responsive analysis across configured viewports (desktop, tablet, mobile).
 */
export class ResponsiveRunner {
  private page: Page;
  private config: AuditConfig;

  constructor(options: ResponsiveRunOptions) {
    this.page = options.page;
    this.config = options.config;
  }

  async run(states: UIState[]): Promise<Finding[]> {
    const findings: Finding[] = [];
    const viewports = this.config.viewports;
    const viewportEntries = Object.entries(viewports);

    if (viewportEntries.length <= 1) {
      // If only one viewport configured, test at least standard mobile
      viewportEntries.push(['mobile-default', { width: 390, height: 844 }]);
    }

    log.info(`Testing responsive design across ${viewportEntries.length} viewports...`);

    for (const [name, vp] of viewportEntries) {
      log.debug(`Setting viewport: ${name} (${vp.width}×${vp.height})`);

      for (const state of states) {
        try {
          await this.page.setViewportSize({ width: vp.width, height: vp.height });
          await navigateToState(this.page, state);
          await this.page.waitForTimeout(300);

          const stateFindings = await this.analyzeViewport(state, vp, name);
          findings.push(...stateFindings);
        } catch (err) {
          log.debug(`Responsive check failed on ${state.id} (${name}): ${err}`);
        }
      }
    }

    log.info(`Responsive analysis produced ${findings.length} findings`);
    return findings;
  }

  private async analyzeViewport(
    state: UIState,
    viewport: Viewport,
    viewportName: string
  ): Promise<Finding[]> {
    const findings: Finding[] = [];

    // Check 1: Horizontal scroll / document overflow
    const hasHorizontalOverflow = await this.page.evaluate(() => {
      const scrollWidth = document.documentElement.scrollWidth;
      const clientWidth = document.documentElement.clientWidth;
      return scrollWidth > clientWidth + 5;
    });

    if (hasHorizontalOverflow) {
      const overflowPx = await this.page.evaluate(() => {
        return document.documentElement.scrollWidth - document.documentElement.clientWidth;
      });

      findings.push(createRuleFinding({
        ruleId: 'resp-horizontal-overflow',
        title: `Page overflows horizontally on ${viewportName} (${viewport.width}px)`,
        severity: viewport.width <= 768 ? 'HIGH' : 'MEDIUM',
        confidence: 0.95,
        category: 'RESPONSIVE',
        description: `Page content exceeds the viewport width by ${Math.round(overflowPx)}px, causing unwanted horizontal scrolling on ${viewportName} devices.`,
        impact: 'Users on mobile/tablet devices must scroll horizontally to read content, creating significant usability friction.',
        recommendation: 'Use max-width: 100%, overflow-x: auto on tables/wide containers, and flexible grid/flexbox layouts.',
        state: { ...state, viewport },
      }));
    }

    // Check 2: Element bounds exceeding viewport width
    const overflowingElements = await this.page.evaluate((vpWidth: number) => {
      const results: Array<{ selector: string; tag: string; text: string; right: number }> = [];
      document.querySelectorAll('table, img, pre, code, .card, form, input, button').forEach((el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        if (style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0) {
          if (rect.right > vpWidth + 5) {
            results.push({
              selector: el.id ? `#${el.id}` : el.tagName.toLowerCase(),
              tag: el.tagName.toLowerCase(),
              text: (el.textContent || '').trim().slice(0, 40),
              right: Math.round(rect.right),
            });
          }
        }
      });
      return results.slice(0, 5);
    }, viewport.width);

    for (const el of overflowingElements) {
      findings.push(createRuleFinding({
        ruleId: 'resp-element-clipped',
        title: `<${el.tag}> overflows viewport on ${viewportName}`,
        severity: 'MEDIUM',
        confidence: 0.9,
        category: 'RESPONSIVE',
        description: `Element <${el.tag}> "${el.text}" extends beyond the right viewport edge (reaches ${el.right}px in a ${viewport.width}px viewport).`,
        impact: 'Portions of this element are hidden off-screen or cut off on smaller screens.',
        recommendation: 'Apply responsive styling (e.g., overflow-x: auto, max-width: 100%, or wrapping).',
        state: { ...state, viewport },
        selector: el.selector,
      }));
    }

    // Check 3: Small touch targets on mobile viewports (< 44px)
    if (viewport.width <= 768) {
      const tinyButtons = await this.page.evaluate(() => {
        const results: Array<{ tag: string; text: string; width: number; height: number; selector: string }> = [];
        document.querySelectorAll('button, a[href], input[type="submit"], input[type="button"]').forEach((el) => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            if ((rect.width < 40 || rect.height < 40) && rect.width > 5 && rect.height > 5) {
              results.push({
                tag: el.tagName.toLowerCase(),
                text: (el.textContent || (el as HTMLInputElement).value || '').trim().slice(0, 30),
                width: Math.round(rect.width),
                height: Math.round(rect.height),
                selector: el.id ? `#${el.id}` : el.className ? `.${el.className.split(' ')[0]}` : el.tagName.toLowerCase(),
              });
            }
          }
        });
        return results.slice(0, 5);
      });

      for (const btn of tinyButtons) {
        findings.push(createRuleFinding({
          ruleId: 'resp-mobile-touch-target',
          title: `Small touch target on mobile: ${btn.width}×${btn.height}px ("${btn.text || btn.tag}")`,
          severity: 'HIGH',
          confidence: 0.9,
          category: 'RESPONSIVE',
          description: `Interactive element <${btn.tag}> "${btn.text}" measures only ${btn.width}×${btn.height}px on mobile viewports, failing the 44×44px minimum touch target guideline.`,
          impact: 'Mobile users will experience missed taps and difficulty activating this control.',
          recommendation: 'Increase touch area to at least 44×44px using padding or min-height/min-width.',
          state: { ...state, viewport },
          selector: btn.selector,
        }));
      }
    }

    return findings;
  }
}
