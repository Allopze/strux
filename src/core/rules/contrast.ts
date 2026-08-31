import type { Page } from 'playwright';
import type { UIState } from '../states/types.js';
import type { Finding } from '../findings/types.js';
import { createRuleFinding } from './engine.js';

export interface ContrastViolation {
  selector: string;
  text: string;
  tag: string;
  textColor: string;
  bgColor: string;
  ratio: number;
  fontSize: string;
  fontWeight: string;
  isLargeText: boolean;
  requiredRatio: number;
}

/**
 * Evaluates text color contrast against background according to WCAG 2.1 AA guidelines.
 */
export async function runContrastAnalysis(
  page: Page,
  state: UIState
): Promise<Finding[]> {
  const findings: Finding[] = [];

  try {
    const violations = await page.evaluate((): ContrastViolation[] => {
      function parseRgb(colorStr: string): [number, number, number, number] | null {
        const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (!match) return null;
        return [
          parseInt(match[1]!, 10),
          parseInt(match[2]!, 10),
          parseInt(match[3]!, 10),
          match[4] !== undefined ? parseFloat(match[4]) : 1,
        ];
      }

      function getLuminance(r: number, g: number, b: number): number {
        const a = [r, g, b].map((v) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * a[0]! + 0.7152 * a[1]! + 0.0722 * a[2]!;
      }

      function getContrastRatio(fgRgb: [number, number, number], bgRgb: [number, number, number]): number {
        const l1 = getLuminance(fgRgb[0], fgRgb[1], fgRgb[2]);
        const l2 = getLuminance(bgRgb[0], bgRgb[1], bgRgb[2]);
        const lighter = Math.max(l1, l2);
        const darker = Math.min(l1, l2);
        return (lighter + 0.05) / (darker + 0.05);
      }

      function getEffectiveBackgroundColor(el: HTMLElement): [number, number, number] {
        let current: HTMLElement | null = el;
        while (current && current !== document.documentElement) {
          const style = window.getComputedStyle(current);
          const bg = style.backgroundColor;
          const parsed = parseRgb(bg);
          if (parsed && parsed[3] > 0.8) {
            return [parsed[0], parsed[1], parsed[2]];
          }
          current = current.parentElement;
        }
        return [255, 255, 255]; // default white background
      }

      const results: ContrastViolation[] = [];
      const textElements = document.querySelectorAll(
        'p, span, a, h1, h2, h3, h4, h5, h6, label, button, li, th, td, blockquote'
      );

      const seen = new Set<string>();

      for (const node of Array.from(textElements)) {
        if (results.length >= 10) break;
        const htmlEl = node as HTMLElement;
        const style = window.getComputedStyle(htmlEl);
        const text = (htmlEl.textContent || '').trim();

        if (!text || text.length < 2) continue;
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
        const rect = htmlEl.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;

        // Skip elements with children text nodes already analyzed
        if (htmlEl.childElementCount > 3) continue;

        const fg = parseRgb(style.color);
        if (!fg || fg[3] < 0.2) continue;

        const bg = getEffectiveBackgroundColor(htmlEl);
        const ratio = getContrastRatio([fg[0], fg[1], fg[2]], bg);

        const fontSizePx = parseFloat(style.fontSize);
        const fontWeight = parseInt(style.fontWeight, 10) || 400;
        const isLargeText = fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700);
        const requiredRatio = isLargeText ? 3.0 : 4.5;

        if (ratio < requiredRatio) {
          const selector = htmlEl.id
            ? `#${htmlEl.id}`
            : htmlEl.className
              ? `${htmlEl.tagName.toLowerCase()}.${String(htmlEl.className).split(' ')[0]}`
              : htmlEl.tagName.toLowerCase();

          const key = `${selector}_${Math.round(ratio * 10)}`;
          if (seen.has(key)) continue;
          seen.add(key);

          results.push({
            selector,
            text: text.slice(0, 40),
            tag: htmlEl.tagName.toLowerCase(),
            textColor: style.color,
            bgColor: `rgb(${bg.join(', ')})`,
            ratio: Math.round(ratio * 100) / 100,
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
            isLargeText,
            requiredRatio,
          });
        }
      }

      return results;
    });

    for (const v of violations) {
      const severity = v.ratio < 3.0 ? 'HIGH' : 'MEDIUM';
      findings.push(createRuleFinding({
        ruleId: 'a11y-color-contrast',
        title: `Low text contrast (${v.ratio}:1, required ${v.requiredRatio}:1): "${v.text}"`,
        severity,
        confidence: 0.95,
        category: 'ACCESSIBILITY',
        description: `Element <${v.tag}> "${v.text}" has a color contrast ratio of ${v.ratio}:1 against background (${v.bgColor}), failing WCAG 2.1 AA requirement (${v.requiredRatio}:1 for ${v.isLargeText ? 'large' : 'normal'} text at ${v.fontSize}).`,
        impact: 'Users with low vision, color blindness, or using screens in bright sunlight cannot read this text comfortably.',
        recommendation: `Adjust foreground (${v.textColor}) or background (${v.bgColor}) color to achieve at least ${v.requiredRatio}:1 contrast ratio.`,
        state,
        selector: v.selector,
        evidence: [{
          type: 'computed-styles',
          selector: v.selector,
          content: `textColor: ${v.textColor}, bgColor: ${v.bgColor}, ratio: ${v.ratio}:1, fontSize: ${v.fontSize}, required: ${v.requiredRatio}:1`,
        }],
      }));
    }
  } catch {
    // Contrast analysis evaluation failed
  }

  return findings;
}
