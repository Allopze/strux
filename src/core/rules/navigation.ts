import type { UIState } from '../states/types.js';
import type { Finding } from '../findings/types.js';
import type { Rule } from './engine.js';
import { createRuleFinding } from './engine.js';

/**
 * Detect navigation issues: dead links, dead buttons, broken routes.
 */
export const deadLinksRule: Rule = {
  id: 'nav-dead-links',
  name: 'Dead Links',
  category: 'NAVIGATION',
  async run(state: UIState): Promise<Finding[]> {
    const findings: Finding[] = [];

    const links = state.interactiveElements.filter(
      (el) => el.tag === 'a' && el.isVisible
    );

    for (const link of links) {
      // Links with no href or empty href
      if (!link.href || link.href === '#' || link.href === 'javascript:void(0)') {
        findings.push(createRuleFinding({
          ruleId: 'nav-dead-link',
          title: `Link with no valid destination: "${link.text.slice(0, 40)}"`,
          severity: 'LOW',
          confidence: 0.85,
          category: 'NAVIGATION',
          description: `A link element contains "${link.text.slice(0, 60)}" but has href="${link.href ?? ''}", which does not navigate anywhere.`,
          impact: 'Users expect links to navigate somewhere. A non-functional link is confusing.',
          recommendation: 'Use a <button> if the element triggers an action, or provide a valid href.',
          state,
          selector: link.selector,
        }));
      }
    }

    return findings;
  },
};

/**
 * Detect network failures associated with this state.
 */
export const networkErrorsRule: Rule = {
  id: 'nav-network-errors',
  name: 'Network Errors',
  category: 'SYSTEM',
  async run(state: UIState): Promise<Finding[]> {
    const findings: Finding[] = [];

    for (const failure of state.networkFailures) {
      const is4xx = failure.status !== undefined && failure.status >= 400 && failure.status < 500;
      const is5xx = failure.status !== undefined && failure.status >= 500;

      // Skip common expected failures (favicon, etc.)
      if (failure.url.endsWith('/favicon.ico')) continue;

      let pathname = failure.url;
      try {
        pathname = new URL(failure.url).pathname;
      } catch {
        // Use raw url if not a valid absolute URL
      }

      if (is5xx) {
        findings.push(createRuleFinding({
          ruleId: 'nav-server-error',
          title: `Server error ${failure.status} on ${pathname}`,
          severity: 'HIGH',
          confidence: 0.95,
          category: 'SYSTEM',
          description: `Request to ${failure.url} returned HTTP ${failure.status}.`,
          impact: 'Functionality may be broken or data may not load for users.',
          recommendation: 'Investigate and fix the server error.',
          state,
          evidence: [{
            type: 'network-failure',
            content: JSON.stringify(failure, null, 2),
          }],
        }));
      } else if (is4xx && failure.status !== 401 && failure.status !== 403) {
        findings.push(createRuleFinding({
          ruleId: 'nav-client-error',
          title: `Client error ${failure.status} on ${pathname}`,
          severity: 'MEDIUM',
          confidence: 0.85,
          category: 'SYSTEM',
          description: `Request to ${failure.url} returned HTTP ${failure.status}.`,
          impact: 'Resources may be missing or API endpoints may be incorrect.',
          recommendation: 'Verify the URL and fix the request.',
          state,
          evidence: [{
            type: 'network-failure',
            content: JSON.stringify(failure, null, 2),
          }],
        }));
      }
    }

    return findings;
  },
};
