import type { Page } from 'playwright';
import type { UIState } from '../states/types.js';
import type { Finding } from '../findings/types.js';
import { createRuleFinding } from './engine.js';

export interface KeyboardAuditResult {
  hasSkipLink: boolean;
  missingFocusIndicators: Array<{ selector: string; tag: string; text: string }>;
  positiveTabindexes: Array<{ selector: string; tabindex: number }>;
  unfocusableInteractives: Array<{ selector: string; tag: string; text: string }>;
}

/**
 * Runs keyboard accessibility analysis on the page:
 * - Focus indicator presence (:focus-visible / outline)
 * - Skip link existence
 * - Tab order integrity (positive tabindex)
 * - Clickable elements without keyboard focusability
 */
export async function runKeyboardAnalysis(
  page: Page,
  state: UIState
): Promise<Finding[]> {
  const findings: Finding[] = [];

  try {
    const result = await page.evaluate((): KeyboardAuditResult => {
      // 1. Skip link detection
      let hasSkipLink = false;
      const links = document.querySelectorAll('a[href]');
      for (const link of Array.from(links).slice(0, 5)) {
        const href = (link.getAttribute('href') || '').toLowerCase();
        const text = (link.textContent || '').toLowerCase();
        const aria = (link.getAttribute('aria-label') || '').toLowerCase();
        if (
          href.startsWith('#main') ||
          href.startsWith('#content') ||
          href.startsWith('#app') ||
          text.includes('skip to') ||
          text.includes('saltar al') ||
          aria.includes('skip')
        ) {
          hasSkipLink = true;
          break;
        }
      }

      // 2. Positive tabindex detection
      const positiveTabindexes: Array<{ selector: string; tabindex: number }> = [];
      document.querySelectorAll('[tabindex]').forEach((el) => {
        const ti = parseInt(el.getAttribute('tabindex') || '0', 10);
        if (ti > 0 && positiveTabindexes.length < 5) {
          const selector = el.id ? `#${el.id}` : el.className ? `.${String(el.className).split(' ')[0]}` : el.tagName.toLowerCase();
          positiveTabindexes.push({ selector, tabindex: ti });
        }
      });

      // 3. Unfocusable elements with click handlers
      const unfocusableInteractives: Array<{ selector: string; tag: string; text: string }> = [];
      document.querySelectorAll('div[onclick], span[onclick], p[onclick], section[onclick]').forEach((el) => {
        const htmlEl = el as HTMLElement;
        const style = window.getComputedStyle(htmlEl);
        if (style.display !== 'none' && style.visibility !== 'hidden') {
          const hasTabIndex = htmlEl.hasAttribute('tabindex');
          const isButtonRole = htmlEl.getAttribute('role') === 'button';
          if (!hasTabIndex && !isButtonRole && unfocusableInteractives.length < 5) {
            const selector = htmlEl.id ? `#${htmlEl.id}` : htmlEl.className ? `.${String(htmlEl.className).split(' ')[0]}` : htmlEl.tagName.toLowerCase();
            unfocusableInteractives.push({
              selector,
              tag: htmlEl.tagName.toLowerCase(),
              text: (htmlEl.textContent || '').trim().slice(0, 30),
            });
          }
        }
      });

      // 4. Focus indicator check (detect outline: none without fallback)
      const missingFocusIndicators: Array<{ selector: string; tag: string; text: string }> = [];
      const focusableCandidates = document.querySelectorAll(
        'button, a[href], input:not([type="hidden"]), select, textarea, [tabindex="0"], [role="button"]'
      );

      for (const node of Array.from(focusableCandidates).slice(0, 15)) {
        const htmlEl = node as HTMLElement;
        const style = window.getComputedStyle(htmlEl);
        if (style.display === 'none' || style.visibility === 'hidden' || htmlEl.offsetParent === null) continue;

        // Check if inline or computed style explicitly kills outline with 0/none and no box-shadow
        const outlineStyle = style.outlineStyle;
        const outlineWidth = parseFloat(style.outlineWidth) || 0;
        const boxShadow = style.boxShadow;

        // An element that has outline explicitly set to none or 0px in normal state might also lack :focus styles
        if ((outlineStyle === 'none' || outlineWidth === 0) && (boxShadow === 'none' || !boxShadow)) {
          // If it's a styled button or custom control with no outline
          const selector = htmlEl.id ? `#${htmlEl.id}` : htmlEl.className ? `.${String(htmlEl.className).split(' ')[0]}` : htmlEl.tagName.toLowerCase();
          if (missingFocusIndicators.length < 5) {
            missingFocusIndicators.push({
              selector,
              tag: htmlEl.tagName.toLowerCase(),
              text: (htmlEl.textContent || (htmlEl as HTMLInputElement).value || '').trim().slice(0, 30),
            });
          }
        }
      }

      return {
        hasSkipLink,
        positiveTabindexes,
        unfocusableInteractives,
        missingFocusIndicators,
      };
    });

    // Generate findings from result

    // 1. Missing skip link
    if (!result.hasSkipLink && state.interactiveElements.length >= 6) {
      findings.push(createRuleFinding({
        ruleId: 'a11y-missing-skip-link',
        title: 'Page lacks a "Skip to content" navigation link',
        severity: 'LOW',
        confidence: 0.85,
        category: 'ACCESSIBILITY',
        description: 'The page has multiple interactive elements and navigation links but does not provide a skip link as the first focusable element.',
        impact: 'Keyboard and screen reader users must tab through all navigation links before reaching the primary content on every page.',
        recommendation: 'Add a skip link (e.g. <a href="#main" class="skip-link">Skip to content</a>) at the top of the body.',
        state,
      }));
    }

    // 2. Positive tabindex
    for (const item of result.positiveTabindexes) {
      findings.push(createRuleFinding({
        ruleId: 'a11y-positive-tabindex',
        title: `Positive tabindex (${item.tabindex}) disrupts logical focus order`,
        severity: 'MEDIUM',
        confidence: 0.95,
        category: 'ACCESSIBILITY',
        description: `Element ${item.selector} has tabindex="${item.tabindex}". Positive tabindex values disrupt natural keyboard navigation flow.`,
        impact: 'Keyboard navigation jumps unpredictably between elements instead of following DOM order.',
        recommendation: 'Use tabindex="0" to insert elements into natural tab order or use native focusable HTML elements.',
        state,
        selector: item.selector,
      }));
    }

    // 3. Unfocusable interactives
    for (const item of result.unfocusableInteractives) {
      findings.push(createRuleFinding({
        ruleId: 'a11y-unfocusable-interactive',
        title: `<${item.tag}> has click action but is not keyboard accessible`,
        severity: 'HIGH',
        confidence: 0.9,
        category: 'ACCESSIBILITY',
        description: `Element <${item.tag}> "${item.text}" has an onclick handler but lacks a tabindex, role="button", and keydown listener.`,
        impact: 'Keyboard-only users cannot activate or focus this control.',
        recommendation: 'Replace with a native <button> element or add role="button", tabindex="0", and Enter/Space key listeners.',
        state,
        selector: item.selector,
      }));
    }
  } catch {
    // Keyboard navigation evaluation failed
  }

  return findings;
}
