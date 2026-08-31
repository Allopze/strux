import type { UIState } from '../states/types.js';
import type { Finding } from '../findings/types.js';
import type { Rule } from './engine.js';
import { createRuleFinding } from './engine.js';

const MIN_TOUCH_TARGET = 44; // WCAG 2.5.5

/**
 * Detect interactive elements that are too small for touch targets.
 */
export const touchTargetRule: Rule = {
  id: 'ui-touch-target',
  name: 'Touch Target Size',
  category: 'UI',
  async run(state: UIState): Promise<Finding[]> {
    const findings: Finding[] = [];

    for (const el of state.interactiveElements) {
      if (!el.isVisible || !el.boundingBox) continue;
      const { width, height } = el.boundingBox;

      if (width < MIN_TOUCH_TARGET || height < MIN_TOUCH_TARGET) {
        // Skip very small elements that are likely just icons within larger clickable areas
        if (width < 5 || height < 5) continue;

        findings.push(createRuleFinding({
          ruleId: 'ui-touch-target',
          title: `Touch target too small: ${Math.round(width)}×${Math.round(height)}px`,
          severity: 'MEDIUM',
          confidence: 0.9,
          category: 'UI',
          description: `Interactive element "${el.text.slice(0, 50)}" (${el.tag}) has dimensions ${Math.round(width)}×${Math.round(height)}px, which is smaller than the recommended minimum of ${MIN_TOUCH_TARGET}×${MIN_TOUCH_TARGET}px.`,
          impact: 'Users on touch devices may have difficulty tapping this element accurately.',
          recommendation: `Increase the element's clickable area to at least ${MIN_TOUCH_TARGET}×${MIN_TOUCH_TARGET}px. Use padding rather than just increasing the visual size.`,
          state,
          selector: el.selector,
          evidence: [{
            type: 'bounding-box',
            boundingBox: el.boundingBox,
            selector: el.selector,
            content: `${el.tag}: "${el.text.slice(0, 50)}" — ${Math.round(width)}×${Math.round(height)}px`,
          }],
        }));
      }
    }

    return findings;
  },
};

/**
 * Detect elements with potential overflow issues.
 * This is a heuristic based on bounding boxes extending beyond viewport.
 */
export const overflowRule: Rule = {
  id: 'ui-overflow',
  name: 'Overflow Detection',
  category: 'UI',
  async run(state: UIState): Promise<Finding[]> {
    const findings: Finding[] = [];
    const { width: vpWidth } = state.viewport;

    for (const el of state.interactiveElements) {
      if (!el.isVisible || !el.boundingBox) continue;
      const { x, width } = el.boundingBox;

      // Element extends beyond right edge of viewport
      if (x + width > vpWidth + 5) {
        findings.push(createRuleFinding({
          ruleId: 'ui-overflow-right',
          title: `Element overflows viewport horizontally`,
          severity: 'MEDIUM',
          confidence: 0.85,
          category: 'UI',
          description: `Element "${el.text.slice(0, 50)}" (${el.tag}) extends ${Math.round(x + width - vpWidth)}px beyond the right edge of the viewport.`,
          impact: 'Content is cut off or requires horizontal scrolling, degrading user experience.',
          recommendation: 'Ensure the element fits within the viewport width or uses responsive wrapping.',
          state,
          selector: el.selector,
          evidence: [{
            type: 'bounding-box',
            boundingBox: el.boundingBox,
            selector: el.selector,
          }],
        }));
      }

      // Element extends beyond left edge
      if (x < -5) {
        findings.push(createRuleFinding({
          ruleId: 'ui-overflow-left',
          title: `Element overflows viewport to the left`,
          severity: 'LOW',
          confidence: 0.8,
          category: 'UI',
          description: `Element "${el.text.slice(0, 50)}" (${el.tag}) starts at x=${Math.round(x)}, which is off-screen to the left.`,
          impact: 'Content may be inaccessible or partially hidden.',
          recommendation: 'Check positioning to ensure the element is visible within the viewport.',
          state,
          selector: el.selector,
        }));
      }
    }

    return findings;
  },
};
