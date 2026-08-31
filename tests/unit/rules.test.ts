import { describe, it, expect } from 'vitest';
import { headingOrderRule, landmarkRule } from '../../src/core/rules/accessibility.js';
import { formLabelsRule, formSubmitRule } from '../../src/core/rules/forms.js';
import { deadLinksRule } from '../../src/core/rules/navigation.js';
import { consoleErrorsRule } from '../../src/core/rules/console.js';
import { touchTargetRule } from '../../src/core/rules/touch-targets.js';
import type { UIState } from '../../src/core/states/types.js';

describe('Deterministic Rules', () => {
  const baseState: UIState = {
    id: 's-1',
    fingerprint: 'fp-1',
    url: 'https://example.com/form',
    normalizedUrl: 'https://example.com/form',
    title: 'Form Page',
    interactiveElements: [],
    headings: [],
    landmarks: [],
    viewport: { width: 1440, height: 900 },
    actionsToReach: [],
    depth: 0,
    timestamp: Date.now(),
    consoleEntries: [],
    networkFailures: [],
    metadata: {},
  };

  const context = {
    allStates: [baseState],
    targetUrl: 'https://example.com',
  };

  it('detects skipped heading levels (h1 -> h3)', async () => {
    const state: UIState = {
      ...baseState,
      headings: [
        { level: 1, text: 'Title' },
        { level: 3, text: 'Skipped subheader' },
      ],
    };

    const findings = await headingOrderRule.run(state, context);
    expect(findings.some((f) => f.ruleId === 'a11y-heading-order')).toBe(true);
  });

  it('detects missing h1 heading', async () => {
    const state: UIState = {
      ...baseState,
      headings: [{ level: 2, text: 'Subheading without h1' }],
    };

    const findings = await headingOrderRule.run(state, context);
    expect(findings.some((f) => f.ruleId === 'a11y-missing-h1')).toBe(true);
  });

  it('detects unlabelled form inputs', async () => {
    const state: UIState = {
      ...baseState,
      interactiveElements: [
        {
          selector: 'input#email',
          tag: 'input',
          type: 'email',
          text: '',
          ariaLabel: '',
          isVisible: true,
          isEnabled: true,
          boundingBox: { x: 10, y: 10, width: 200, height: 40 },
          risk: 'LIKELY_SAFE',
          classes: [],
          id: 'email',
        },
        {
          selector: 'input.anon',
          tag: 'input',
          type: 'text',
          text: '',
          ariaLabel: '',
          isVisible: true,
          isEnabled: true,
          boundingBox: { x: 10, y: 60, width: 200, height: 40 },
          risk: 'LIKELY_SAFE',
          classes: [],
        },
      ],
    };

    const findings = await formLabelsRule.run(state, context);
    expect(findings.length).toBe(2);
    expect(findings.some((f) => f.severity === 'HIGH')).toBe(true);
  });

  it('detects dead links with href="#"', async () => {
    const state: UIState = {
      ...baseState,
      interactiveElements: [
        {
          selector: 'a.dummy',
          tag: 'a',
          href: '#',
          text: 'Click here',
          isVisible: true,
          isEnabled: true,
          boundingBox: { x: 10, y: 10, width: 100, height: 30 },
          risk: 'SAFE',
          classes: [],
        },
      ],
    };

    const findings = await deadLinksRule.run(state, context);
    expect(findings.some((f) => f.ruleId === 'nav-dead-link')).toBe(true);
  });

  it('detects console errors', async () => {
    const state: UIState = {
      ...baseState,
      consoleEntries: [
        { type: 'error', text: 'Uncaught TypeError: Cannot read properties of undefined', timestamp: Date.now() },
      ],
    };

    const findings = await consoleErrorsRule.run(state, context);
    expect(findings.some((f) => f.ruleId === 'sys-console-error')).toBe(true);
  });

  it('detects small touch targets under 44x44px', async () => {
    const state: UIState = {
      ...baseState,
      interactiveElements: [
        {
          selector: 'button.tiny',
          tag: 'button',
          text: 'x',
          isVisible: true,
          isEnabled: true,
          boundingBox: { x: 10, y: 10, width: 20, height: 20 },
          risk: 'SAFE',
          classes: [],
        },
      ],
    };

    const findings = await touchTargetRule.run(state, context);
    expect(findings.some((f) => f.ruleId === 'ui-touch-target')).toBe(true);
  });
});
