import { Logger } from '../logger.js';

const log = new Logger({ prefix: 'Sitemap' });

/**
 * Fetch and extract URLs from sitemap.xml or sitemap_index.xml if available.
 */
export async function fetchSitemapUrls(targetUrl: string, maxUrls: number = 100): Promise<string[]> {
  try {
    const origin = new URL(targetUrl).origin;
    const candidates = [
      `${origin}/sitemap.xml`,
      `${origin}/sitemap_index.xml`,
      `${origin}/sitemap-index.xml`,
    ];

    for (const candidate of candidates) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);

        const res = await fetch(candidate, {
          method: 'GET',
          signal: controller.signal,
          headers: {
            'User-Agent': 'uiux-auditor/0.1.0',
            'Accept': 'application/xml, text/xml, */*',
          },
        });

        clearTimeout(timeout);

        if (!res.ok) continue;

        const xml = await res.text();
        const urls = parseSitemapXml(xml, origin);

        if (urls.length > 0) {
          log.info(`Discovered ${urls.length} URLs from sitemap (${candidate})`);
          return urls.slice(0, maxUrls);
        }
      } catch {
        // Candidate not available or failed to fetch
      }
    }
  } catch {
    // Ignore URL parse or network errors
  }

  return [];
}

/**
 * Extract <loc> tags from sitemap XML content and filter by origin.
 */
export function parseSitemapXml(xml: string, allowedOrigin: string): string[] {
  const urls: string[] = [];
  const locRegex = /<loc>(?:<!\[CDATA\[)?(https?:\/\/[^<\]]+)(?:\]\]>)?<\/loc>/gi;

  let match: RegExpExecArray | null;
  while ((match = locRegex.exec(xml)) !== null) {
    const url = match[1]?.trim();
    if (!url) continue;

    try {
      const parsed = new URL(url);
      if (parsed.origin === allowedOrigin) {
        urls.push(parsed.toString());
      }
    } catch {
      // Invalid URL
    }
  }

  return [...new Set(urls)];
}
