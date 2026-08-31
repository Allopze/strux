import type { UIState } from '../states/types.js';
import type { Finding } from '../findings/types.js';
import type { Rule } from './engine.js';
import { createRuleFinding } from './engine.js';

interface CapturedImage {
  src: string;
  alt: string | null;
  role: string | null;
  ariaLabel: string | null;
  isVisible: boolean;
  width: number;
  height: number;
  selector: string;
}

const REDUNDANT_ALT_PATTERNS = [
  /^(image|picture|photo|graphic|icon|logo|placeholder|img)$/i,
  /^(image|picture|photo)\s+(of|showing)\b/i,
  /\.(png|jpe?g|webp|gif|svg)$/i,
];

/**
 * Detect missing, redundant, or misleading alt text on image elements.
 */
export const imageAltRule: Rule = {
  id: 'a11y-image-alt',
  name: 'Image Alternative Text',
  category: 'ACCESSIBILITY',
  async run(state: UIState): Promise<Finding[]> {
    const findings: Finding[] = [];
    const images = (state.metadata?.['images'] as CapturedImage[] | undefined) ?? [];

    for (const img of images) {
      if (!img.isVisible) continue;

      const hasAriaLabel = Boolean(img.ariaLabel && img.ariaLabel.trim().length > 0);
      const isExplicitlyDecorative = img.role === 'presentation' || img.role === 'none';

      // 1. Missing alt attribute completely
      if (img.alt === null && !hasAriaLabel && !isExplicitlyDecorative) {
        findings.push(createRuleFinding({
          ruleId: 'a11y-image-missing-alt',
          title: `Image missing alt attribute: "${getShortSrc(img.src)}"`,
          severity: 'HIGH',
          confidence: 0.95,
          category: 'ACCESSIBILITY',
          description: `An image element (${img.selector}) is missing the required "alt" attribute. Screen readers cannot describe this image.`,
          impact: 'Screen reader users will hear the file path or URL instead of a descriptive label.',
          recommendation: 'Add an alt attribute describing the image content, or alt="" if the image is purely decorative.',
          state,
          selector: img.selector,
          evidence: [{
            type: 'selector',
            selector: img.selector,
            content: `src: ${img.src} (${img.width}×${img.height}px)`,
          }],
        }));
        continue;
      }

      // 2. Redundant or low-quality alt text
      if (img.alt && !isExplicitlyDecorative) {
        const trimmedAlt = img.alt.trim();
        for (const pattern of REDUNDANT_ALT_PATTERNS) {
          if (pattern.test(trimmedAlt)) {
            findings.push(createRuleFinding({
              ruleId: 'a11y-image-redundant-alt',
              title: `Redundant or poor alt text: "${trimmedAlt}"`,
              severity: 'LOW',
              confidence: 0.85,
              category: 'ACCESSIBILITY',
              description: `Image alt text "${trimmedAlt}" contains redundant words (e.g. "image of", "photo", or raw file extension). Screen readers already announce elements as images.`,
              impact: 'Users with screen readers hear repetitive or unhelpful descriptions.',
              recommendation: 'Remove words like "image of" or file names, and describe what the image actually conveys.',
              state,
              selector: img.selector,
            }));
            break;
          }
        }
      }

      // 3. Large non-decorative image marked with empty alt
      if (img.alt === '' && !isExplicitlyDecorative && img.width > 200 && img.height > 200) {
        // Warning: Large banner or hero image marked as decorative might omit important information
        findings.push(createRuleFinding({
          ruleId: 'a11y-image-empty-alt-large',
          title: `Large prominent image (${img.width}×${img.height}px) marked as decorative`,
          severity: 'LOW',
          confidence: 0.7,
          category: 'ACCESSIBILITY',
          description: `A large image (${img.width}×${img.height}px) has alt="", marking it as decorative. Verify if it conveys informative content.`,
          impact: 'Informative content in illustrations or banners may be invisible to screen reader users.',
          recommendation: 'If this image contains informative text or charts, provide a meaningful alt description.',
          state,
          selector: img.selector,
        }));
      }
    }

    return findings;
  },
};

function getShortSrc(src: string): string {
  if (!src) return 'img';
  try {
    const parsed = new URL(src, 'http://localhost');
    const parts = parsed.pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || src.slice(0, 40);
  } catch {
    return src.slice(0, 40);
  }
}
