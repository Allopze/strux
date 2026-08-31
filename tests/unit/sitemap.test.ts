import { describe, it, expect } from 'vitest';
import { parseSitemapXml } from '../../src/core/crawler/sitemap.js';

describe('Sitemap Parser', () => {
  it('parses URLs from standard sitemap XML', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url>
        <loc>https://example.com/</loc>
        <lastmod>2026-01-01</lastmod>
      </url>
      <url>
        <loc>https://example.com/about</loc>
      </url>
      <url>
        <loc>https://example.com/contact</loc>
      </url>
      <url>
        <loc>https://otherdomain.com/malicious</loc>
      </url>
    </urlset>`;

    const urls = parseSitemapXml(xml, 'https://example.com');
    expect(urls).toEqual([
      'https://example.com/',
      'https://example.com/about',
      'https://example.com/contact',
    ]);
  });

  it('handles CDATA blocks in loc tags', () => {
    const xml = `
    <urlset>
      <url><loc><![CDATA[https://example.com/blog?page=1&sort=asc]]></loc></url>
    </urlset>`;

    const urls = parseSitemapXml(xml, 'https://example.com');
    expect(urls).toEqual(['https://example.com/blog?page=1&sort=asc']);
  });

  it('returns empty array when no matching origin URLs found', () => {
    const xml = `<urlset><url><loc>https://other.com/page</loc></url></urlset>`;
    const urls = parseSitemapXml(xml, 'https://example.com');
    expect(urls).toEqual([]);
  });
});
