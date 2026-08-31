import { z } from 'zod';

// ── Viewport ──────────────────────────────────────────────────────────
export const ViewportSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type Viewport = z.infer<typeof ViewportSchema>;

// ── Auth ──────────────────────────────────────────────────────────────
export const AuthConfigSchema = z.object({
  storageState: z.string().optional(),
});

// ── Exploration ───────────────────────────────────────────────────────
export const ExplorationConfigSchema = z.object({
  maxStates: z.number().int().positive().default(1000),
  maxDepth: z.number().int().positive().default(15),
  maxActionsPerState: z.number().int().positive().default(30),
  maxRuntimeMinutes: z.number().positive().default(60),
});

// ── Audit toggles ─────────────────────────────────────────────────────
export const AuditConfigSchema = z.object({
  ui: z.boolean().default(true),
  ux: z.boolean().default(true),
  accessibility: z.boolean().default(true),
  responsive: z.boolean().default(true),
  consistency: z.boolean().default(true),
  console: z.boolean().default(true),
});

// ── Verification ──────────────────────────────────────────────────────
export const VerificationConfigSchema = z.object({
  enabled: z.boolean().default(true),
  maxRetries: z.number().int().nonnegative().default(2),
});

// ── AI ────────────────────────────────────────────────────────────────
export const AIConfigSchema = z.object({
  enabled: z.boolean().default(false),
  provider: z.enum(['commandcode']).optional(),
  maxRequests: z.number().int().positive().default(200),
  maxRequestsPerState: z.number().int().positive().default(3),
  analyzeDuplicates: z.boolean().default(false),
});

// ── Execution ─────────────────────────────────────────────────────────
export const ExecutionConfigSchema = z.object({
  browserWorkers: z.number().int().positive().default(2),
  aiWorkers: z.number().int().positive().default(4),
});

// ── Privacy ───────────────────────────────────────────────────────────
export const PrivacyConfigSchema = z.object({
  redactInputs: z.boolean().default(false),
  redactSelectors: z.array(z.string()).default([]),
});

// ── Reports ───────────────────────────────────────────────────────────
export const ReportConfigSchema = z.object({
  markdown: z.boolean().default(true),
  json: z.boolean().default(true),
  html: z.boolean().default(false),
  outputDir: z.string().default('./uiux-audit-results'),
});

// ── Journeys ──────────────────────────────────────────────────────────
export const JourneySchema = z.object({
  name: z.string(),
  goal: z.string(),
  start: z.string().optional(),
});
export type Journey = z.infer<typeof JourneySchema>;

// ── Interaction policy ────────────────────────────────────────────────
export const InteractionPolicySchema = z.object({
  mutating: z.enum(['execute', 'skip', 'ask']).default('skip'),
  destructive: z.enum(['execute', 'skip', 'ask']).default('skip'),
  unknown: z.enum(['execute', 'skip', 'analyze']).default('analyze'),
});

// ── Network safety ────────────────────────────────────────────────────
export const NetworkSafetySchema = z.object({
  allowExternalLinks: z.boolean().default(false),
  allowedHosts: z.array(z.string()).default([]),
  blockPatterns: z.array(z.string()).default([
    'logout', 'sign-out', 'signout', 'cerrar-sesion',
    'mailto:', 'tel:', 'javascript:',
  ]),
});

// ── Top-level config ──────────────────────────────────────────────────
export const AuditConfigFullSchema = z.object({
  target: z.object({
    url: z.string().url(),
  }),
  repo: z.object({
    path: z.string(),
  }).optional(),
  auth: AuthConfigSchema.optional(),
  exploration: ExplorationConfigSchema.default({}),
  viewports: z.record(z.string(), ViewportSchema).default({
    desktop: { width: 1440, height: 900 },
  }),
  audit: AuditConfigSchema.default({}),
  verification: VerificationConfigSchema.default({}),
  ai: AIConfigSchema.default({}),
  execution: ExecutionConfigSchema.default({}),
  privacy: PrivacyConfigSchema.default({}),
  reports: ReportConfigSchema.default({}),
  journeys: z.array(JourneySchema).default([]),
  interactionPolicy: InteractionPolicySchema.default({}),
  networkSafety: NetworkSafetySchema.default({}),
});

export type AuditConfig = z.infer<typeof AuditConfigFullSchema>;
