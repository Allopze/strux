import type { Page } from 'playwright';
import type { UIState } from '../states/types.js';
import type { Finding } from '../findings/types.js';
import { createRuleFinding } from '../rules/engine.js';
import { navigateToState } from '../browser/navigator.js';
import { Logger } from '../logger.js';

const log = new Logger({ prefix: 'DesignSystem' });

export interface ButtonStyleSample {
  text: string;
  tag: string;
  className: string;
  height: number;
  borderRadius: string;
  backgroundColor: string;
  color: string;
  fontSize: string;
  selector: string;
  stateId: string;
}

/**
 * Infers design system tokens and flags statistical outliers / visual inconsistencies.
 */
export class DesignSystemInferrer {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async analyze(states: UIState[]): Promise<Finding[]> {
    const findings: Finding[] = [];
    const buttonSamples: ButtonStyleSample[] = [];

    log.info(`Inferring design patterns across ${states.length} states...`);

    for (const state of states) {
      try {
        await navigateToState(this.page, state);
        await this.page.waitForTimeout(300);

        const samples = await this.page.evaluate((stateId: string): ButtonStyleSample[] => {
          const items: ButtonStyleSample[] = [];
          document.querySelectorAll('button, [role="button"], .btn, input[type="submit"]').forEach((el) => {
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            if (style.display !== 'none' && style.visibility !== 'hidden' && rect.height > 10) {
              items.push({
                text: (el.textContent || '').trim().slice(0, 30),
                tag: el.tagName.toLowerCase(),
                className: el.className ? String(el.className) : '',
                height: Math.round(rect.height),
                borderRadius: style.borderRadius,
                backgroundColor: style.backgroundColor,
                color: style.color,
                fontSize: style.fontSize,
                selector: el.id ? `#${el.id}` : el.className ? `.${String(el.className).split(' ')[0]}` : el.tagName.toLowerCase(),
                stateId,
              });
            }
          });
          return items;
        }, state.id);

        buttonSamples.push(...samples);
      } catch {
        // Continue
      }
    }

    if (buttonSamples.length < 4) {
      return findings;
    }

    // 1. Analyze button heights
    const heightCounts: Record<number, number> = {};
    for (const s of buttonSamples) {
      heightCounts[s.height] = (heightCounts[s.height] ?? 0) + 1;
    }

    // Find dominant height
    const sortedHeights = Object.entries(heightCounts).sort((a, b) => b[1] - a[1]);
    const dominantHeight = sortedHeights[0] ? parseInt(sortedHeights[0][0], 10) : 0;
    const dominantCount = sortedHeights[0] ? sortedHeights[0][1] : 0;

    // If dominant height accounts for >= 70% of buttons and there is an outlier
    if (dominantCount >= 3 && dominantCount / buttonSamples.length >= 0.6) {
      for (const sample of buttonSamples) {
        if (Math.abs(sample.height - dominantHeight) >= 8 && sample.height > 15) {
          const parentState = states.find((s) => s.id === sample.stateId) || states[0]!;
          findings.push(createRuleFinding({
            ruleId: 'ds-button-height-outlier',
            title: `Inconsistent button height: ${sample.height}px (standard is ${dominantHeight}px)`,
            severity: 'LOW',
            confidence: 0.85,
            category: 'CONSISTENCY',
            description: `Button "${sample.text}" has a height of ${sample.height}px, while ${dominantCount} of ${buttonSamples.length} buttons across the application use ${dominantHeight}px.`,
            impact: 'Subtle visual inconsistencies make the interface feel unpolished and less cohesive.',
            recommendation: `Align button height to the established standard of ${dominantHeight}px.`,
            state: parentState,
            selector: sample.selector,
          }));
        }
      }
    }

    log.info(`Design system analysis produced ${findings.length} consistency findings`);
    return findings;
  }
}
