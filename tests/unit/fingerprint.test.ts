import { describe, it, expect } from 'vitest';
import { generateFingerprint, normalizeUrl } from '../../src/core/states/fingerprint.js';

describe('normalizeUrl', () => {
  it('removes pagination parameters', () => {
    expect(normalizeUrl('http://localhost:3000/vehicles?page=1&limit=10'))
      .toBe('/vehicles');
  });

  it('removes sort parameters', () => {
    expect(normalizeUrl('http://localhost:3000/vehicles?sort=name&order=asc'))
      .toBe('/vehicles');
  });

  it('keeps meaningful parameters', () => {
    expect(normalizeUrl('http://localhost:3000/vehicles?status=active'))
      .toBe('/vehicles?status=active');
  });

  it('sorts remaining parameters', () => {
    const result = normalizeUrl('http://localhost:3000/items?z=1&a=2');
    expect(result).toBe('/items?a=2&z=1');
  });

  it('handles URLs without query params', () => {
    expect(normalizeUrl('http://localhost:3000/dashboard'))
      .toBe('/dashboard');
  });

  it('preserves hash route for SPA navigation', () => {
    expect(normalizeUrl('http://localhost:3000/app#vehicles'))
      .toBe('/app#vehicles');
  });

  it('handles invalid URLs gracefully', () => {
    expect(normalizeUrl('not-a-url')).toBe('not-a-url');
  });
});

describe('generateFingerprint', () => {
  it('produces the same fingerprint for structurally identical states', () => {
    const state1 = {
      normalizedUrl: '/vehicles',
      interactiveElements: [
        { tag: 'button', role: 'button', text: 'Add', isVisible: true, selector: '#btn1', ariaLabel: undefined, type: undefined, href: undefined, isEnabled: true, boundingBox: null, risk: 'SAFE' as const, classes: [], id: undefined, dataTestId: undefined },
      ],
      headings: [{ level: 1, text: 'Vehicles' }],
      landmarks: [{ role: 'main' }],
    };

    const state2 = {
      normalizedUrl: '/vehicles',
      interactiveElements: [
        { tag: 'button', role: 'button', text: 'Different text', isVisible: true, selector: '#btn2', ariaLabel: undefined, type: undefined, href: undefined, isEnabled: true, boundingBox: null, risk: 'SAFE' as const, classes: [], id: undefined, dataTestId: undefined },
      ],
      headings: [{ level: 1, text: 'Different heading' }],
      landmarks: [{ role: 'main' }],
    };

    expect(generateFingerprint(state1)).toBe(generateFingerprint(state2));
  });

  it('produces different fingerprints for structurally different states', () => {
    const state1 = {
      normalizedUrl: '/vehicles',
      interactiveElements: [
        { tag: 'button', role: undefined, text: 'X', isVisible: true, selector: '#a', ariaLabel: undefined, type: undefined, href: undefined, isEnabled: true, boundingBox: null, risk: 'SAFE' as const, classes: [], id: undefined, dataTestId: undefined },
      ],
      headings: [{ level: 1, text: 'A' }],
      landmarks: [],
    };

    const state2 = {
      normalizedUrl: '/dashboard',
      interactiveElements: [
        { tag: 'a', role: undefined, text: 'X', isVisible: true, selector: '#b', ariaLabel: undefined, type: undefined, href: '/', isEnabled: true, boundingBox: null, risk: 'SAFE' as const, classes: [], id: undefined, dataTestId: undefined },
      ],
      headings: [{ level: 2, text: 'B' }],
      landmarks: [{ role: 'navigation' }],
    };

    expect(generateFingerprint(state1)).not.toBe(generateFingerprint(state2));
  });
});
