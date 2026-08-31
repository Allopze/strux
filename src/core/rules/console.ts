import type { UIState } from '../states/types.js';
import type { Finding } from '../findings/types.js';
import type { Rule } from './engine.js';
import { createRuleFinding } from './engine.js';

/**
 * Detect console errors and warnings associated with states.
 */
export const consoleErrorsRule: Rule = {
  id: 'sys-console-error',
  name: 'Console Errors',
  category: 'SYSTEM',
  async run(state: UIState): Promise<Finding[]> {
    const findings: Finding[] = [];

    const errors = state.consoleEntries.filter((e) => e.type === 'error');
    const warnings = state.consoleEntries.filter((e) => e.type === 'warning');

    // Deduplicate by text
    const uniqueErrors = [...new Map(errors.map((e) => [e.text.slice(0, 100), e])).values()];
    const uniqueWarnings = [...new Map(warnings.map((w) => [w.text.slice(0, 100), w])).values()];

    if (uniqueErrors.length > 0) {
      findings.push(createRuleFinding({
        ruleId: 'sys-console-error',
        title: `${uniqueErrors.length} console error(s) detected`,
        severity: uniqueErrors.length >= 5 ? 'HIGH' : 'MEDIUM',
        confidence: 0.9,
        category: 'SYSTEM',
        description: `Console errors were logged on this state:\n\n${uniqueErrors.map((e) => `• ${e.text.slice(0, 200)}`).join('\n')}`,
        impact: 'Console errors may indicate broken functionality, unhandled exceptions, or missing resources.',
        recommendation: 'Investigate and fix the underlying issues causing these console errors.',
        state,
        evidence: uniqueErrors.map((e) => ({
          type: 'console-log' as const,
          content: e.text,
          metadata: { url: e.url, timestamp: e.timestamp },
        })),
      }));
    }

    if (uniqueWarnings.length >= 3) {
      findings.push(createRuleFinding({
        ruleId: 'sys-console-warnings',
        title: `${uniqueWarnings.length} console warnings detected`,
        severity: 'LOW',
        confidence: 0.7,
        category: 'SYSTEM',
        description: `Multiple console warnings were logged:\n\n${uniqueWarnings.slice(0, 5).map((w) => `• ${w.text.slice(0, 150)}`).join('\n')}`,
        impact: 'Warnings may indicate deprecations, configuration issues, or potential problems.',
        recommendation: 'Review and address the warnings.',
        state,
        evidence: uniqueWarnings.slice(0, 5).map((w) => ({
          type: 'console-log' as const,
          content: w.text,
        })),
      }));
    }

    return findings;
  },
};
