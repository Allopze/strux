import { z } from 'zod';
import { ViewportSchema } from '../config/schema.js';

// ── Action types ──────────────────────────────────────────────────────
export const ActionRiskSchema = z.enum([
  'SAFE',
  'LIKELY_SAFE',
  'MUTATING',
  'DESTRUCTIVE',
  'UNKNOWN',
]);
export type ActionRisk = z.infer<typeof ActionRiskSchema>;

export const ActionSchema = z.object({
  type: z.enum(['click', 'fill', 'select', 'hover', 'navigate', 'keyboard', 'scroll', 'submit', 'toggle']),
  selector: z.string(),
  value: z.string().optional(),
  label: z.string().optional(),
  description: z.string().optional(),
  risk: ActionRiskSchema.default('UNKNOWN'),
  timestamp: z.number().optional(),
});
export type Action = z.infer<typeof ActionSchema>;

// ── Interactive element ───────────────────────────────────────────────
export const InteractiveElementSchema = z.object({
  selector: z.string(),
  tag: z.string(),
  role: z.string().optional(),
  text: z.string(),
  ariaLabel: z.string().optional(),
  type: z.string().optional(),
  href: z.string().optional(),
  isVisible: z.boolean(),
  isEnabled: z.boolean(),
  boundingBox: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }).nullable(),
  risk: ActionRiskSchema,
  dataTestId: z.string().optional(),
  classes: z.array(z.string()).default([]),
  id: z.string().optional(),
});
export type InteractiveElement = z.infer<typeof InteractiveElementSchema>;

// ── Console entry ─────────────────────────────────────────────────────
export const ConsoleEntrySchema = z.object({
  type: z.enum(['error', 'warning', 'info', 'log']),
  text: z.string(),
  url: z.string().optional(),
  timestamp: z.number(),
});
export type ConsoleEntry = z.infer<typeof ConsoleEntrySchema>;

// ── Network failure ───────────────────────────────────────────────────
export const NetworkFailureSchema = z.object({
  url: z.string(),
  method: z.string(),
  status: z.number().optional(),
  error: z.string().optional(),
  timestamp: z.number(),
});
export type NetworkFailure = z.infer<typeof NetworkFailureSchema>;

// ── UI State ──────────────────────────────────────────────────────────
export const UIStateSchema = z.object({
  id: z.string(),
  fingerprint: z.string(),
  url: z.string(),
  normalizedUrl: z.string(),
  title: z.string(),
  screenshotPath: z.string().optional(),
  domSnippet: z.string().optional(),
  interactiveElements: z.array(InteractiveElementSchema),
  headings: z.array(z.object({
    level: z.number(),
    text: z.string(),
  })),
  landmarks: z.array(z.object({
    role: z.string(),
    label: z.string().optional(),
  })),
  viewport: ViewportSchema,
  actionsToReach: z.array(ActionSchema),
  parentStateId: z.string().optional(),
  depth: z.number().default(0),
  timestamp: z.number(),
  consoleEntries: z.array(ConsoleEntrySchema).default([]),
  networkFailures: z.array(NetworkFailureSchema).default([]),
  metadata: z.record(z.unknown()).default({}),
});
export type UIState = z.infer<typeof UIStateSchema>;

// ── State transition ──────────────────────────────────────────────────
export interface StateTransition {
  fromStateId: string;
  toStateId: string;
  action: Action;
}

// ── State graph ───────────────────────────────────────────────────────
export interface StateGraph {
  states: Map<string, UIState>;
  transitions: StateTransition[];
  rootStateId: string;
}
