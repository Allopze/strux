import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { unlinkSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { BaselineManager } from '../../src/core/baseline/manager.js';
import type { Finding } from '../../src/core/findings/types.js';

describe('BaselineManager', () => {
  const testBaselinePath = './test-baseline.json';

  const mockFinding: Finding = {
    id: 'f-1',
    ruleId: 'a11y-missing-h1',
    title: 'Page is missing an h1 heading',
    severity: 'MEDIUM',
    confidence: 0.9,
    category: 'ACCESSIBILITY',
    description: 'No h1 found',
    impact: 'Low accessibility',
    recommendation: 'Add h1',
    stateId: 'state-1',
    url: 'https://example.com/dashboard',
    reproductionSteps: [],
    evidence: [],
    source: 'rule',
    verificationStatus: 'UNVERIFIED',
    selector: 'body',
  };

  const newFinding: Finding = {
    id: 'f-2',
    ruleId: 'a11y-missing-main',
    title: 'Page is missing a main landmark',
    severity: 'HIGH',
    confidence: 0.95,
    category: 'ACCESSIBILITY',
    description: 'No main found',
    impact: 'Low accessibility',
    recommendation: 'Add main',
    stateId: 'state-1',
    url: 'https://example.com/dashboard',
    reproductionSteps: [],
    evidence: [],
    source: 'rule',
    verificationStatus: 'UNVERIFIED',
    selector: 'div.content',
  };

  afterEach(() => {
    const fullPath = resolve(process.cwd(), testBaselinePath);
    if (existsSync(fullPath)) {
      unlinkSync(fullPath);
    }
  });

  it('generates consistent fingerprints for findings', () => {
    const fp1 = BaselineManager.generateFindingFingerprint(mockFinding);
    const fp2 = BaselineManager.generateFindingFingerprint({ ...mockFinding, id: 'f-other' });
    expect(fp1).toBe('a11y-missing-h1|body|/dashboard');
    expect(fp1).toBe(fp2);
  });

  it('saves and loads baseline correctly', () => {
    BaselineManager.saveBaseline(testBaselinePath, [mockFinding], 'https://example.com');

    const baseline = BaselineManager.loadBaseline(testBaselinePath);
    expect(baseline).not.toBeNull();
    expect(baseline?.version).toBe('1.0');
    expect(baseline?.entries.length).toBe(1);
    expect(baseline?.entries[0]?.ruleId).toBe('a11y-missing-h1');
  });

  it('filters suppressed vs active findings against baseline', () => {
    BaselineManager.saveBaseline(testBaselinePath, [mockFinding], 'https://example.com');
    const baseline = BaselineManager.loadBaseline(testBaselinePath)!;

    const { active, suppressed } = BaselineManager.filterFindings(
      [mockFinding, newFinding],
      baseline
    );

    expect(suppressed.length).toBe(1);
    expect(suppressed[0]?.id).toBe('f-1');
    expect(active.length).toBe(1);
    expect(active[0]?.id).toBe('f-2');
  });
});
