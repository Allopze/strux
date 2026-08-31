import { describe, it, expect } from 'vitest';
import { deduplicateFindings } from '../../src/core/findings/dedup.js';
import type { Finding } from '../../src/core/findings/types.js';

function createMockFinding(overrides: Partial<Finding>): Finding {
  return {
    id: 'test-finding',
    title: 'Test Finding',
    severity: 'MEDIUM',
    confidence: 0.8,
    category: 'UI',
    description: 'A test finding',
    impact: 'Some impact',
    recommendation: 'Fix it',
    stateId: 'state-1',
    reproductionSteps: [],
    evidence: [],
    source: 'rule',
    verificationStatus: 'UNVERIFIED',
    ...overrides,
  };
}

describe('deduplicateFindings', () => {
  it('keeps unique findings', () => {
    const findings = [
      createMockFinding({ id: 'f1', title: 'Issue A', selector: '#a' }),
      createMockFinding({ id: 'f2', title: 'Issue B', selector: '#b' }),
    ];

    const result = deduplicateFindings(findings);
    expect(result).toHaveLength(2);
  });

  it('merges duplicate findings', () => {
    const findings = [
      createMockFinding({ id: 'f1', title: 'Issue A', selector: '#a', ruleId: 'rule-1', confidence: 0.7, source: 'rule' }),
      createMockFinding({ id: 'f2', title: 'Issue A', selector: '#a', ruleId: 'rule-1', confidence: 0.9, source: 'ai' }),
    ];

    const result = deduplicateFindings(findings);
    expect(result).toHaveLength(1);
    // Should have boosted confidence because sources corroborate
    expect(result[0]!.confidence).toBeGreaterThan(0.9);
    expect(result[0]!.source).toBe('hybrid');
  });

  it('handles empty input', () => {
    expect(deduplicateFindings([])).toHaveLength(0);
  });
});
