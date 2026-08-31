import { describe, it, expect } from 'vitest';
import { imageAltRule } from '../../src/core/rules/images.js';
import type { UIState } from '../../src/core/states/types.js';

describe('imageAltRule', () => {
  const createMockState = (images: unknown[]): UIState => ({
    id: 'state-1',
    fingerprint: 'fp-1',
    url: 'https://example.com/products',
    normalizedUrl: 'https://example.com/products',
    title: 'Products',
    interactiveElements: [],
    headings: [],
    landmarks: [],
    viewport: { width: 1440, height: 900 },
    actionsToReach: [],
    depth: 0,
    timestamp: Date.now(),
    consoleEntries: [],
    networkFailures: [],
    metadata: {
      images,
    },
  });

  it('detects images missing alt attribute', async () => {
    const state = createMockState([
      {
        src: '/assets/banner.png',
        alt: null,
        role: null,
        ariaLabel: null,
        isVisible: true,
        width: 300,
        height: 100,
        selector: 'img#banner',
      },
    ]);

    const findings = await imageAltRule.run(state, {
      allStates: [state],
      targetUrl: 'https://example.com',
    });

    expect(findings.length).toBe(1);
    expect(findings[0]?.ruleId).toBe('a11y-image-missing-alt');
    expect(findings[0]?.severity).toBe('HIGH');
  });

  it('detects redundant alt text like "photo of product"', async () => {
    const state = createMockState([
      {
        src: '/assets/product.jpg',
        alt: 'photo of sneakers',
        role: null,
        ariaLabel: null,
        isVisible: true,
        width: 150,
        height: 150,
        selector: 'img.product-thumb',
      },
    ]);

    const findings = await imageAltRule.run(state, {
      allStates: [state],
      targetUrl: 'https://example.com',
    });

    expect(findings.length).toBe(1);
    expect(findings[0]?.ruleId).toBe('a11y-image-redundant-alt');
    expect(findings[0]?.severity).toBe('LOW');
  });

  it('ignores decorative images with role="presentation"', async () => {
    const state = createMockState([
      {
        src: '/assets/divider.svg',
        alt: null,
        role: 'presentation',
        ariaLabel: null,
        isVisible: true,
        width: 20,
        height: 20,
        selector: 'img.divider',
      },
    ]);

    const findings = await imageAltRule.run(state, {
      allStates: [state],
      targetUrl: 'https://example.com',
    });

    expect(findings.length).toBe(0);
  });
});
