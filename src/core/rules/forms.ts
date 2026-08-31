import type { UIState } from '../states/types.js';
import type { Finding } from '../findings/types.js';
import type { Rule } from './engine.js';
import { createRuleFinding } from './engine.js';

/**
 * Detect form-related issues from the state model.
 */
export const formLabelsRule: Rule = {
  id: 'forms-missing-label',
  name: 'Form Labels',
  category: 'ACCESSIBILITY',
  async run(state: UIState): Promise<Finding[]> {
    const findings: Finding[] = [];

    const formElements = state.interactiveElements.filter(
      (el) => ['input', 'select', 'textarea'].includes(el.tag) &&
              el.isVisible &&
              el.type !== 'hidden' &&
              el.type !== 'submit' &&
              el.type !== 'button'
    );

    for (const el of formElements) {
      const hasAriaLabel = el.ariaLabel && el.ariaLabel.trim().length > 0;

      // Without aria-label, the input may still have a <label for="id"> in the DOM,
      // but we can't verify that from the state model alone. Elements without
      // aria-label AND without an id are guaranteed to lack an accessible name.
      if (!hasAriaLabel && !el.id) {
        findings.push(createRuleFinding({
          ruleId: 'forms-missing-label',
          title: `Form input without accessible label`,
          severity: 'HIGH',
          confidence: 0.9,
          category: 'ACCESSIBILITY',
          description: `A ${el.tag}${el.type ? `[type=${el.type}]` : ''} element has no associated label, aria-label, or aria-labelledby attribute.`,
          impact: 'Screen reader users cannot identify the purpose of this form field.',
          recommendation: 'Add a <label> element with a `for` attribute, or add an `aria-label` attribute.',
          state,
          selector: el.selector,
        }));
      } else if (!hasAriaLabel && el.id) {
        // Has an id but no aria-label — a <label for> *might* exist in the DOM.
        // Flag with lower confidence; axe-core or the verifier will confirm.
        findings.push(createRuleFinding({
          ruleId: 'forms-missing-label',
          title: `Form input may lack an accessible label`,
          severity: 'MEDIUM',
          confidence: 0.6,
          category: 'ACCESSIBILITY',
          description: `A ${el.tag}${el.type ? `[type=${el.type}]` : ''} element has an id="${el.id}" but no aria-label. A <label for="${el.id}"> may or may not exist in the DOM.`,
          impact: 'If no matching <label> element exists, screen reader users cannot identify this field.',
          recommendation: 'Verify that a <label for="${el.id}"> exists, or add an explicit aria-label attribute.',
          state,
          selector: el.selector,
        }));
      }
    }

    return findings;
  },
};

/**
 * Detect missing submit buttons in forms.
 */
export const formSubmitRule: Rule = {
  id: 'forms-no-submit',
  name: 'Form Submit Button',
  category: 'UX',
  async run(state: UIState): Promise<Finding[]> {
    const findings: Finding[] = [];

    const hasFormInputs = state.interactiveElements.some(
      (el) => ['input', 'select', 'textarea'].includes(el.tag) &&
              el.isVisible &&
              el.type !== 'hidden' &&
              el.type !== 'submit' &&
              el.type !== 'button'
    );

    if (!hasFormInputs) return findings;

    const hasSubmit = state.interactiveElements.some(
      (el) =>
        (el.tag === 'button' || (el.tag === 'input' && el.type === 'submit')) &&
        el.isVisible
    );

    if (!hasSubmit) {
      findings.push(createRuleFinding({
        ruleId: 'forms-no-submit',
        title: 'Form inputs present but no visible submit button found',
        severity: 'MEDIUM',
        confidence: 0.7,
        category: 'UX',
        description: 'The page has form inputs but no clearly visible submit button was detected.',
        impact: 'Users may not understand how to submit the form, or may rely on implicit submission (pressing Enter).',
        recommendation: 'Add a clearly visible submit button with descriptive text.',
        state,
      }));
    }

    return findings;
  },
};
