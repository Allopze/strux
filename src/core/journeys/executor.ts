import type { Page } from 'playwright';
import type { Journey } from '../config/schema.js';
import type { Finding } from '../findings/types.js';
import type { UIState } from '../states/types.js';
import { createRuleFinding } from '../rules/engine.js';
import { Logger } from '../logger.js';

const log = new Logger({ prefix: 'Journey' });

export interface JourneyMetrics {
  journeyName: string;
  success: boolean;
  stepsCount: number;
  durationMs: number;
  errorsEncountered: number;
  blockers: string[];
  routesVisited: string[];
}

/**
 * Executes and evaluates user journeys to measure friction, discoverability, and flow completion.
 */
export class JourneyExecutor {
  private page: Page;
  private targetUrl: string;

  constructor(page: Page, targetUrl: string) {
    this.page = page;
    this.targetUrl = targetUrl;
  }

  async runJourneys(journeys: Journey[], states: UIState[]): Promise<{ metrics: JourneyMetrics[]; findings: Finding[] }> {
    const metrics: JourneyMetrics[] = [];
    const findings: Finding[] = [];

    if (journeys.length === 0) {
      return { metrics, findings };
    }

    log.info(`Executing ${journeys.length} user journeys...`);

    for (const journey of journeys) {
      log.info(`Running journey: "${journey.name}" — Goal: ${journey.goal}`);
      const startUrl = journey.start
        ? new URL(journey.start, this.targetUrl).toString()
        : this.targetUrl;

      const startTime = Date.now();
      const routesVisited: string[] = [];
      const blockers: string[] = [];
      let stepsCount = 0;
      let errorsEncountered = 0;
      let success = false;

      try {
        await this.page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        routesVisited.push(this.page.url());

        // Attempt goal-oriented discovery on the page
        // Look for buttons or links matching words in the goal or journey name
        const goalKeywords = journey.goal.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
        const nameKeywords = journey.name.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
        const searchKeywords = [...new Set([...goalKeywords, ...nameKeywords])];

        // Step 1: Search for relevant starting action
        const matchedElement = await this.page.evaluate((keywords: string[]) => {
          const candidates: Array<{ selector: string; text: string; score: number }> = [];
          document.querySelectorAll('a, button, [role="button"], input[type="submit"]').forEach((el) => {
            const text = (el.textContent || '').toLowerCase().trim();
            const aria = (el.getAttribute('aria-label') || '').toLowerCase().trim();
            const combined = `${text} ${aria}`;
            let score = 0;
            for (const kw of keywords) {
              if (combined.includes(kw)) score += 10;
            }
            if (score > 0) {
              candidates.push({
                selector: el.id ? `#${el.id}` : el.className ? `.${el.className.split(' ')[0]}` : el.tagName.toLowerCase(),
                text: combined.slice(0, 40),
                score,
              });
            }
          });
          candidates.sort((a, b) => b.score - a.score);
          return candidates[0] || null;
        }, searchKeywords);

        if (matchedElement) {
          log.debug(`Journey action: clicking "${matchedElement.text}"`);
          const locator = this.page.locator(matchedElement.selector).first();
          await locator.click({ timeout: 5000 }).catch(() => {});
          stepsCount++;
          routesVisited.push(this.page.url());
          await this.page.waitForTimeout(500);

          // Check if form or modal opened
          const hasForm = await this.page.evaluate(() => document.querySelector('form, .modal, [role="dialog"]') !== null);
          if (hasForm) {
            success = true;
          }
        } else {
          blockers.push(`Could not discover obvious starting action matching keywords: ${searchKeywords.join(', ')}`);
        }

        const durationMs = Date.now() - startTime;
        metrics.push({
          journeyName: journey.name,
          success,
          stepsCount,
          durationMs,
          errorsEncountered,
          blockers,
          routesVisited,
        });

        if (!success && blockers.length > 0) {
          const baseState = states[0] ?? {
            id: 'journey-root',
            url: startUrl,
            viewport: { width: 1440, height: 900 },
            actionsToReach: [],
          };

          findings.push(createRuleFinding({
            ruleId: 'journey-flow-blocked',
            title: `Journey friction: "${journey.name}"`,
            severity: 'MEDIUM',
            confidence: 0.8,
            category: 'WORKFLOW',
            description: `The user journey "${journey.name}" (Goal: ${journey.goal}) encountered friction:\n${blockers.map((b) => `• ${b}`).join('\n')}`,
            impact: 'Users may struggle to discover how to initiate or complete this primary workflow.',
            recommendation: 'Ensure prominent Call-to-Actions and clear navigation labels for key tasks.',
            state: baseState as UIState,
          }));
        }
      } catch (err) {
        log.warn(`Journey "${journey.name}" failed: ${err}`);
      }
    }

    return { metrics, findings };
  }
}
