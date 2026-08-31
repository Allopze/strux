import { z } from 'zod';
import { ViewportSchema } from '../config/schema.js';
import { ActionSchema } from '../states/types.js';

// ── Severity & Category ───────────────────────────────────────────────
export const SeveritySchema = z.enum([
  'CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO',
]);
export type Severity = z.infer<typeof SeveritySchema>;

export const FindingCategorySchema = z.enum([
  'UI', 'UX', 'ACCESSIBILITY', 'RESPONSIVE',
  'CONSISTENCY', 'NAVIGATION', 'WORKFLOW', 'SYSTEM',
]);
export type FindingCategory = z.infer<typeof FindingCategorySchema>;

export const VerificationStatusSchema = z.enum([
  'UNVERIFIED', 'VERIFIED', 'REJECTED', 'PARTIAL', 'UNABLE_TO_VERIFY',
]);
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;

export const FindingSourceSchema = z.enum([
  'rule', 'ai', 'journey', 'hybrid',
]);

// ── Evidence ──────────────────────────────────────────────────────────
export const EvidenceSchema = z.object({
  type: z.enum([
    'screenshot', 'dom-fragment', 'selector', 'bounding-box',
    'console-log', 'axe-violation', 'network-failure', 'trace',
    'navigation-path', 'computed-styles',
  ]),
  path: z.string().optional(),
  content: z.string().optional(),
  selector: z.string().optional(),
  boundingBox: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }).optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

// ── Source location ───────────────────────────────────────────────────
export const SourceLocationSchema = z.object({
  file: z.string(),
  line: z.number().optional(),
  column: z.number().optional(),
  confidence: z.number().min(0).max(1),
});
export type SourceLocation = z.infer<typeof SourceLocationSchema>;

// ── Finding ───────────────────────────────────────────────────────────
export const FindingSchema = z.object({
  id: z.string(),
  title: z.string(),
  severity: SeveritySchema,
  confidence: z.number().min(0).max(1),
  category: FindingCategorySchema,
  description: z.string(),
  impact: z.string(),
  recommendation: z.string(),
  stateId: z.string(),
  url: z.string().optional(),
  viewport: ViewportSchema.optional(),
  selector: z.string().optional(),
  reproductionSteps: z.array(ActionSchema),
  evidence: z.array(EvidenceSchema),
  ruleId: z.string().optional(),
  source: FindingSourceSchema,
  verificationStatus: VerificationStatusSchema.default('UNVERIFIED'),
  suspectedSourceFiles: z.array(SourceLocationSchema).optional(),
});
export type Finding = z.infer<typeof FindingSchema>;

// ── Audit summary ─────────────────────────────────────────────────────
export const AuditSummarySchema = z.object({
  targetUrl: z.string(),
  startTime: z.number(),
  endTime: z.number(),
  durationMs: z.number(),
  statesExplored: z.number(),
  uniqueStates: z.number(),
  routesDiscovered: z.number(),
  interactionsExecuted: z.number(),
  journeysTested: z.number(),
  totalFindings: z.number(),
  verifiedFindings: z.number(),
  rejectedFindings: z.number(),
  findingsBySeverity: z.object({
    CRITICAL: z.number(),
    HIGH: z.number(),
    MEDIUM: z.number(),
    LOW: z.number(),
    INFO: z.number(),
  }),
  findingsByCategory: z.record(z.string(), z.number()),
  accessibilityViolations: z.number(),
  responsiveIssues: z.number(),
  consoleErrors: z.number(),
  aiRequests: z.number(),
});
export type AuditSummary = z.infer<typeof AuditSummarySchema>;

// ── Audit result ──────────────────────────────────────────────────────
export interface AuditResult {
  summary: AuditSummary;
  findings: Finding[];
  states: Map<string, import('../states/types.js').UIState>;
}
