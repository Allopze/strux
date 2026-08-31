import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig } from '../../src/core/config/loader.js';
import { Orchestrator } from '../../src/agents/orchestrator.js';

describe('End-to-End Audit Integration Test', () => {
  const outputDir = resolve(process.cwd(), './test-results-integration');
  const targetUrl = 'http://localhost:3333';

  it(
    'runs complete deterministic audit and identifies intentional fixture defects',
    async () => {
      const config = loadConfig({
        overrides: {
          target: { url: targetUrl },
          exploration: { maxStates: 2, maxDepth: 2 },
          viewports: {
            desktop: { width: 1440, height: 900 },
            mobile: { width: 390, height: 844 },
          },
        audit: {
          ui: true,
          ux: true,
          accessibility: true,
          responsive: true,
          consistency: true,
          console: true,
        },
        verification: { enabled: true },
        ai: { enabled: false },
        reports: {
          markdown: true,
          json: true,
          html: true,
          outputDir,
        },
      },
    });

    const orchestrator = new Orchestrator({ config });
    const result = await orchestrator.run();

    // 1. Verify summary metrics
    expect(result.summary.statesExplored).toBeGreaterThanOrEqual(1);
    expect(result.summary.totalFindings).toBeGreaterThan(0);
    expect(result.findings.length).toBeGreaterThan(0);

    // 2. Verify specific deterministic findings
    const ruleIds = result.findings.map((f) => f.ruleId).filter(Boolean);

    // Heading skip or missing main
    expect(
      ruleIds.some((id) => id?.includes('heading') || id?.includes('main'))
    ).toBe(true);

    // Touch targets
    expect(
      ruleIds.some((id) => id?.includes('touch-target'))
    ).toBe(true);

    // Dead links
    expect(
      ruleIds.some((id) => id?.includes('dead-link'))
    ).toBe(true);

    // Console error
    expect(
      ruleIds.some((id) => id?.includes('console-error'))
    ).toBe(true);

    // 3. Verify reports generated
    expect(existsSync(resolve(outputDir, 'report.md'))).toBe(true);
    expect(existsSync(resolve(outputDir, 'report.json'))).toBe(true);
    expect(existsSync(resolve(outputDir, 'report.html'))).toBe(true);

    // 4. Verify report content integrity
    const jsonContent = JSON.parse(readFileSync(resolve(outputDir, 'report.json'), 'utf-8'));
    expect(jsonContent.summary.targetUrl).toBe(targetUrl);
    expect(jsonContent.findings.length).toBe(result.findings.length);
  }, 60000);
});
