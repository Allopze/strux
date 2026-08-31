import type { Finding } from './types.js';
import { Logger } from '../logger.js';

const log = new Logger({ prefix: 'FindingDedup' });

/**
 * Deduplicate findings by merging those that target the same element
 * and describe the same issue.
 */
export function deduplicateFindings(findings: Finding[]): Finding[] {
  const groups = new Map<string, Finding[]>();

  for (const finding of findings) {
    const key = generateFindingKey(finding);
    const existing = groups.get(key);
    if (existing) {
      existing.push(finding);
    } else {
      groups.set(key, [finding]);
    }
  }

  const deduplicated: Finding[] = [];

  for (const [, group] of groups) {
    if (group.length === 1) {
      deduplicated.push(group[0]!);
    } else {
      deduplicated.push(mergeFindings(group));
    }
  }

  if (findings.length !== deduplicated.length) {
    log.info(`${findings.length} findings → ${deduplicated.length} after dedup`);
  }

  return deduplicated;
}

/**
 * Generate a deduplication key for a finding based on:
 * - state ID
 * - selector (if present)
 * - category
 * - rule ID (if present)
 * - simplified title
 */
function generateFindingKey(finding: Finding): string {
  const parts = [
    finding.stateId,
    finding.selector || 'no-selector',
    finding.category,
    finding.ruleId || 'no-rule',
    simplifyTitle(finding.title),
  ];
  return parts.join('::');
}

function simplifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

/**
 * Merge multiple findings for the same issue into one,
 * keeping the highest severity, highest confidence,
 * and combining evidence.
 */
function mergeFindings(group: Finding[]): Finding {
  const severityOrder = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] as const;

  // Sort by severity (highest first), then confidence (highest first)
  group.sort((a, b) => {
    const sevDiff = severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity);
    if (sevDiff !== 0) return sevDiff;
    return b.confidence - a.confidence;
  });

  const primary = group[0]!;

  // Combine evidence from all findings
  const allEvidence = group.flatMap((f) => f.evidence);

  // Combine suspected source files
  const allSources = group
    .flatMap((f) => f.suspectedSourceFiles || [])
    .filter((s, i, arr) =>
      arr.findIndex((x) => x.file === s.file && x.line === s.line) === i
    );

  // Calculate combined confidence (corroborating sources boost confidence)
  const sources = new Set(group.map((f) => f.source));
  const confidenceBoost = sources.size > 1 ? 0.1 : 0;
  const maxConfidence = Math.max(...group.map((f) => f.confidence));

  return {
    ...primary,
    confidence: Math.min(1, maxConfidence + confidenceBoost),
    evidence: allEvidence,
    suspectedSourceFiles: allSources.length > 0 ? allSources : undefined,
    source: sources.size > 1 ? 'hybrid' : primary.source,
  };
}
