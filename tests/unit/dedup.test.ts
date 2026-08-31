import { describe, it, expect } from 'vitest';
import { deduplicateStates } from '../../src/core/states/dedup.js';
import type { UIState } from '../../src/core/states/types.js';

function createMockState(overrides: Partial<UIState>): UIState {
  return {
    id: 'test-id',
    fingerprint: 'fp-default',
    url: 'http://localhost/test',
    normalizedUrl: '/test',
    title: 'Test',
    interactiveElements: [],
    headings: [],
    landmarks: [],
    viewport: { width: 1440, height: 900 },
    actionsToReach: [],
    depth: 0,
    timestamp: Date.now(),
    consoleEntries: [],
    networkFailures: [],
    metadata: {},
    ...overrides,
  };
}

describe('deduplicateStates', () => {
  it('keeps unique states', () => {
    const states = [
      createMockState({ id: 'a', fingerprint: 'fp-1' }),
      createMockState({ id: 'b', fingerprint: 'fp-2' }),
    ];

    const result = deduplicateStates(states);
    expect(result.totalUnique).toBe(2);
    expect(result.uniqueStates).toHaveLength(2);
  });

  it('deduplicates states with same fingerprint', () => {
    const states = [
      createMockState({ id: 'a', fingerprint: 'fp-1', actionsToReach: [{ type: 'click', selector: '#a', risk: 'SAFE' }, { type: 'click', selector: '#b', risk: 'SAFE' }] }),
      createMockState({ id: 'b', fingerprint: 'fp-1', actionsToReach: [{ type: 'click', selector: '#c', risk: 'SAFE' }] }),
      createMockState({ id: 'c', fingerprint: 'fp-2' }),
    ];

    const result = deduplicateStates(states);
    expect(result.totalUnique).toBe(2);
    expect(result.uniqueStates).toHaveLength(2);
    // Should keep the shallowest (fewest actions)
    const kept = result.uniqueStates.find((s) => s.fingerprint === 'fp-1');
    expect(kept?.id).toBe('b');
  });

  it('handles empty input', () => {
    const result = deduplicateStates([]);
    expect(result.totalUnique).toBe(0);
    expect(result.uniqueStates).toHaveLength(0);
  });
});
