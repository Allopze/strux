import type { Page } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import type { UIState } from '../states/types.js';
import type { Finding, Evidence } from '../findings/types.js';
import type { Rule } from './engine.js';
import { createRuleFinding } from './engine.js';

// Map axe impact to our severity
const IMPACT_MAP: Record<string, 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'> = {
  critical: 'CRITICAL',
  serious: 'HIGH',
  moderate: 'MEDIUM',
  minor: 'LOW',
};

export interface AxeRuleOptions {
  page: Page;
}

/**
 * Run axe-core accessibility analysis on a page for a given state.
 * This rule needs the Playwright Page object, so it's run differently
 * from pure-state rules.
 */
export async function runAxeAnalysis(
  page: Page,
  state: UIState
): Promise<Finding[]> {
  const findings: Finding[] = [];

  try {
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
      .analyze();

    for (const violation of results.violations) {
      const severity = IMPACT_MAP[violation.impact ?? 'minor'] ?? 'LOW';

      for (const node of violation.nodes.slice(0, 5)) {
        const evidence: Evidence[] = [
          {
            type: 'axe-violation',
            content: JSON.stringify({
              id: violation.id,
              impact: violation.impact,
              help: violation.help,
              helpUrl: violation.helpUrl,
              html: node.html,
              target: node.target,
              failureSummary: node.failureSummary,
            }, null, 2),
          },
          {
            type: 'selector',
            selector: node.target[0] as string | undefined,
            content: node.html,
          },
        ];

        findings.push(createRuleFinding({
          ruleId: `a11y-${violation.id}`,
          title: violation.help,
          severity,
          confidence: 0.95,
          category: 'ACCESSIBILITY',
          description: `${violation.description}\n\nHTML: ${node.html}\n\nFailure: ${node.failureSummary ?? 'N/A'}`,
          impact: violation.help,
          recommendation: `Fix the accessibility issue. See: ${violation.helpUrl}`,
          state,
          selector: node.target[0] as string | undefined,
          evidence,
        }));
      }
    }
  } catch (err) {
    // axe-core may fail on certain pages; don't break the audit
  }

  return findings;
}

/**
 * Stateless accessibility rules that don't require the page.
 */
export const headingOrderRule: Rule = {
  id: 'a11y-heading-order',
  name: 'Heading Order',
  category: 'ACCESSIBILITY',
  async run(state: UIState): Promise<Finding[]> {
    const findings: Finding[] = [];
    let prevLevel = 0;

    for (const heading of state.headings) {
      if (heading.level > prevLevel + 1 && prevLevel > 0) {
        findings.push(createRuleFinding({
          ruleId: 'a11y-heading-order',
          title: `Heading level skipped: h${prevLevel} → h${heading.level}`,
          severity: 'MEDIUM',
          confidence: 0.95,
          category: 'ACCESSIBILITY',
          description: `Heading "${heading.text}" is h${heading.level} but the previous heading was h${prevLevel}. Heading levels should not skip (e.g., h1 → h3 without h2).`,
          impact: 'Screen reader users may have difficulty understanding the document structure.',
          recommendation: `Use h${prevLevel + 1} instead of h${heading.level}, or add intermediate headings.`,
          state,
        }));
      }
      prevLevel = heading.level;
    }

    // Check for missing h1
    if (state.headings.length > 0 && !state.headings.some((h) => h.level === 1)) {
      findings.push(createRuleFinding({
        ruleId: 'a11y-missing-h1',
        title: 'Page is missing an h1 heading',
        severity: 'MEDIUM',
        confidence: 0.9,
        category: 'ACCESSIBILITY',
        description: 'The page has headings but no h1 element. Every page should have a primary h1 heading.',
        impact: 'Screen reader users rely on h1 to identify the main content of the page.',
        recommendation: 'Add an h1 heading that describes the primary content of this page.',
        state,
      }));
    }

    return findings;
  },
};

export const landmarkRule: Rule = {
  id: 'a11y-landmarks',
  name: 'Landmark Regions',
  category: 'ACCESSIBILITY',
  async run(state: UIState): Promise<Finding[]> {
    const findings: Finding[] = [];

    const hasMain = state.landmarks.some((l) => l.role === 'main');
    if (!hasMain && state.interactiveElements.length > 3) {
      findings.push(createRuleFinding({
        ruleId: 'a11y-missing-main',
        title: 'Page is missing a main landmark',
        severity: 'MEDIUM',
        confidence: 0.85,
        category: 'ACCESSIBILITY',
        description: 'The page has interactive content but no <main> element or [role="main"].',
        impact: 'Screen reader users cannot quickly navigate to the primary content area.',
        recommendation: 'Wrap the primary content in a <main> element.',
        state,
      }));
    }

    return findings;
  },
};
