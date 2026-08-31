import type { UIState } from '../states/types.js';
import type { Finding } from '../findings/types.js';
import { createRuleFinding } from './engine.js';
import { Logger } from '../logger.js';

const log = new Logger({ prefix: 'LinkChecker' });

export interface LinkCheckOptions {
  timeoutMs?: number;
  maxLinks?: number;
}

/**
 * Validates discovered HTTP links via actual network requests (HEAD/GET)
 * to detect real 404, 500, or broken endpoints.
 */
export async function runLinkValidation(
  states: UIState[],
  targetUrl: string,
  options: LinkCheckOptions = {}
): Promise<Finding[]> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const maxLinks = options.maxLinks ?? 30;
  const findings: Finding[] = [];

  // Extract all distinct links across states
  const linkMap = new Map<string, { state: UIState; selector?: string; text?: string }>();

  for (const state of states) {
    for (const el of state.interactiveElements) {
      if (el.tag === 'a' && el.href) {
        const href = el.href.trim();
        if (
          !href ||
          href === '#' ||
          href.startsWith('javascript:') ||
          href.startsWith('mailto:') ||
          href.startsWith('tel:') ||
          href.startsWith('data:')
        ) {
          continue;
        }

        try {
          const absoluteUrl = new URL(href, state.url || targetUrl).toString();
          if (!linkMap.has(absoluteUrl)) {
            linkMap.set(absoluteUrl, { state, selector: el.selector, text: el.text });
          }
        } catch {
          // Invalid URL
        }
      }
    }
  }

  const urlsToCheck = Array.from(linkMap.entries()).slice(0, maxLinks);
  if (urlsToCheck.length === 0) return findings;

  log.info(`Validating ${urlsToCheck.length} unique links over HTTP...`);

  for (const [url, info] of urlsToCheck) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      let status: number | null = null;
      let errorMsg: string | null = null;

      try {
        let res = await fetch(url, {
          method: 'HEAD',
          signal: controller.signal,
          headers: { 'User-Agent': 'uiux-auditor/0.1.0' },
        });

        // Some servers return 405 for HEAD, fallback to GET
        if (res.status === 405) {
          res = await fetch(url, {
            method: 'GET',
            signal: controller.signal,
            headers: { 'User-Agent': 'uiux-auditor/0.1.0' },
          });
        }

        status = res.status;
      } catch (err) {
        errorMsg = err instanceof Error ? err.message : String(err);
      } finally {
        clearTimeout(timeout);
      }

      if (status !== null && (status >= 400 || status === 0)) {
        const is404 = status === 404;
        const isServerErr = status >= 500;

        findings.push(createRuleFinding({
          ruleId: 'nav-broken-http-link',
          title: `Broken link returns HTTP ${status}: "${info.text || url}"`,
          severity: is404 ? 'HIGH' : isServerErr ? 'HIGH' : 'MEDIUM',
          confidence: 0.95,
          category: 'NAVIGATION',
          description: `Link pointing to "${url}" returned HTTP status ${status} during live HTTP validation.`,
          impact: 'Users clicking this link will experience broken navigation or server error pages.',
          recommendation: `Update the href destination or fix the target endpoint at ${url}.`,
          state: info.state,
          selector: info.selector,
          evidence: [{
            type: 'network-failure',
            content: `URL: ${url}\nHTTP Status: ${status}\nLink Text: "${info.text || ''}"`,
          }],
        }));
      } else if (errorMsg && (errorMsg.includes('fetch failed') || errorMsg.includes('ENOTFOUND') || errorMsg.includes('ECONNREFUSED'))) {
        findings.push(createRuleFinding({
          ruleId: 'nav-broken-http-link',
          title: `Unreachable link (Network error): "${info.text || url}"`,
          severity: 'HIGH',
          confidence: 0.9,
          category: 'NAVIGATION',
          description: `Network request to link destination "${url}" failed: ${errorMsg}`,
          impact: 'Users will encounter a connection error when attempting to follow this link.',
          recommendation: `Verify the domain and URL format for ${url}.`,
          state: info.state,
          selector: info.selector,
        }));
      }
    } catch {
      // Ignore link check loop error
    }
  }

  return findings;
}
