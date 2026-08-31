import { createHash } from 'node:crypto';
import type { UIState, InteractiveElement } from './types.js';

/**
 * Generate a structural fingerprint for a UI state.
 *
 * The fingerprint captures the semantic structure of the page — not its data.
 * Two pages with the same layout, controls, and headings but different text
 * content (e.g., paginated lists) will produce the same fingerprint.
 */
export function generateFingerprint(state: Pick<UIState, 'normalizedUrl' | 'interactiveElements' | 'headings' | 'landmarks'>): string {
  const parts: string[] = [];

  // 1. Normalized URL path (without query params that are just pagination)
  parts.push(`url:${state.normalizedUrl}`);

  // 2. Interactive element structure (tag+role+type, not text content)
  const elemSignature = state.interactiveElements
    .filter((el) => el.isVisible)
    .map((el) => elementSignature(el))
    .sort()
    .join('|');
  parts.push(`elements:${elemSignature}`);

  // 3. Heading structure (levels only for fingerprint)
  const headingStructure = state.headings
    .map((h) => `h${h.level}`)
    .join(',');
  parts.push(`headings:${headingStructure}`);

  // 4. Landmark structure
  const landmarkStructure = state.landmarks
    .map((l) => l.role)
    .sort()
    .join(',');
  parts.push(`landmarks:${landmarkStructure}`);

  const raw = parts.join('||');
  return createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

function elementSignature(el: InteractiveElement): string {
  const parts = [el.tag];
  if (el.role) parts.push(`role=${el.role}`);
  if (el.type) parts.push(`type=${el.type}`);
  if (el.dataTestId) parts.push(`testId=${el.dataTestId}`);
  if (el.risk && el.risk !== 'UNKNOWN') parts.push(`risk=${el.risk}`);
  return parts.join(':');
}

/**
 * Normalize a URL by removing volatile query parameters
 * (pagination, sort, timestamps, random tokens), while preserving
 * SPA routes (both pathname and hash route).
 */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const paramsToRemove: string[] = [];

    for (const [key, value] of parsed.searchParams) {
      // Remove pagination params
      if (/^(page|p|offset|skip|cursor|limit|per_page|pageSize)$/i.test(key)) {
        paramsToRemove.push(key);
        continue;
      }
      // Remove sort params
      if (/^(sort|order|orderBy|sortBy|dir|direction)$/i.test(key)) {
        paramsToRemove.push(key);
        continue;
      }
      // Remove timestamp/cache-busting params
      if (/^(t|ts|timestamp|_|cb|cacheBuster|_t)$/i.test(key)) {
        paramsToRemove.push(key);
        continue;
      }
      // Remove purely numeric params (likely IDs, timestamps)
      if (/^\d{10,}$/.test(value)) {
        paramsToRemove.push(key);
      }
    }

    for (const key of paramsToRemove) {
      parsed.searchParams.delete(key);
    }

    // Sort remaining params for stability
    parsed.searchParams.sort();

    // Preserve SPA hash routing (e.g. #vehicles, #/dashboard)
    const hash = parsed.hash ? parsed.hash : '';

    return `${parsed.pathname}${parsed.search}${hash}`;
  } catch {
    return url;
  }
}
