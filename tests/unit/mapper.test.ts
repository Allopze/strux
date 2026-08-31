import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { CodeMapper } from '../../src/core/code-mapper/mapper.js';
import type { Finding } from '../../src/core/findings/types.js';

describe('CodeMapper', () => {
  const repoPath = resolve(process.cwd(), './examples/test-app');
  const mapper = new CodeMapper(repoPath);

  it('maps findings with valid selectors to source files', async () => {
    const finding: Finding = {
      id: 'test-1',
      title: 'Missing label on input "#vehicle-search"',
      severity: 'HIGH',
      confidence: 0.9,
      category: 'ACCESSIBILITY',
      description: 'Input element without label',
      impact: 'Accessibility failure',
      recommendation: 'Add label',
      stateId: 'state-1',
      selector: '#vehicle-search',
      reproductionSteps: [],
      evidence: [],
      source: 'rule',
      verificationStatus: 'UNVERIFIED',
    };

    const mapped = await mapper.mapFindings([finding]);
    expect(mapped[0]!.suspectedSourceFiles).toBeDefined();
    expect(mapped[0]!.suspectedSourceFiles!.length).toBeGreaterThan(0);
    expect(mapped[0]!.suspectedSourceFiles![0]!.file).toContain('index.html');
  });
});
