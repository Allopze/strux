import { readFileSync } from 'node:fs';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import type { LLMProvider, CompletionMessage, ContentPart } from '../providers/types.js';
import type { UIState } from '../core/states/types.js';
import type { Finding } from '../core/findings/types.js';
import { VISUAL_REVIEWER_PROMPT, UX_REVIEWER_PROMPT } from './prompts/index.js';
import { sanitizeForAI, sanitizeDomSnippet } from '../core/sanitizer/sanitizer.js';
import { Logger } from '../core/logger.js';

const log = new Logger({ prefix: 'AI' });

const AIFindingSchema = z.object({
  title: z.string(),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']),
  confidence: z.number().min(0).max(1),
  category: z.enum(['UI', 'UX', 'ACCESSIBILITY', 'RESPONSIVE', 'CONSISTENCY', 'NAVIGATION', 'WORKFLOW', 'SYSTEM']),
  description: z.string(),
  impact: z.string(),
  recommendation: z.string(),
  selector: z.string().optional(),
});

const AIFindingsArraySchema = z.array(AIFindingSchema);

/**
 * Run the visual reviewer AI agent on a state.
 */
export async function runVisualReview(
  provider: LLMProvider,
  state: UIState,
  existingFindings: Finding[]
): Promise<Finding[]> {
  const context = buildStateContext(state, existingFindings);
  const messages: CompletionMessage[] = [
    { role: 'system', content: VISUAL_REVIEWER_PROMPT },
    { role: 'user', content: context },
  ];

  // Include screenshot if available and provider supports images
  if (state.screenshotPath && provider.capabilities().supportsImages) {
    try {
      const imageData = readFileSync(state.screenshotPath);
      const base64 = imageData.toString('base64');
      const parts: ContentPart[] = [
        { type: 'text', text: context },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${base64}`, detail: 'high' } },
      ];
      messages[1] = { role: 'user', content: parts };
    } catch {
      // Skip image if unreadable
    }
  }

  return executeAIReview(provider, messages, state, 'visual-reviewer');
}

/**
 * Run the UX reviewer AI agent on a state.
 */
export async function runUXReview(
  provider: LLMProvider,
  state: UIState,
  existingFindings: Finding[]
): Promise<Finding[]> {
  const context = buildStateContext(state, existingFindings);
  const messages: CompletionMessage[] = [
    { role: 'system', content: UX_REVIEWER_PROMPT },
    { role: 'user', content: context },
  ];

  return executeAIReview(provider, messages, state, 'ux-reviewer');
}

async function executeAIReview(
  provider: LLMProvider,
  messages: CompletionMessage[],
  state: UIState,
  agentName: string
): Promise<Finding[]> {
  try {
    const result = await provider.complete({
      messages,
      temperature: 0.3,
      maxTokens: 4096,
      responseFormat: provider.capabilities().supportsJsonMode
        ? { type: 'json_object' }
        : undefined,
    });

    const parsed = parseAIFindings(result.content);
    const findings = parsed.map((f) => ({
      id: `${agentName}-${nanoid(6)}`,
      title: f.title,
      severity: f.severity,
      confidence: f.confidence,
      category: f.category,
      description: f.description,
      impact: f.impact,
      recommendation: f.recommendation,
      stateId: state.id,
      url: state.url,
      viewport: state.viewport,
      selector: f.selector,
      reproductionSteps: state.actionsToReach,
      evidence: state.screenshotPath
        ? [{ type: 'screenshot' as const, path: state.screenshotPath }]
        : [],
      source: 'ai' as const,
      verificationStatus: 'UNVERIFIED' as const,
    }));

    log.debug(`${agentName}: ${findings.length} findings for state ${state.id}`);
    return findings;
  } catch (err) {
    log.warn(`${agentName} failed for state ${state.id}: ${err}`);
    return [];
  }
}

function buildStateContext(state: UIState, existingFindings: Finding[]): string {
  const parts: string[] = [];

  parts.push(`## State Information`);
  parts.push(`URL: ${state.url}`);
  parts.push(`Title: ${state.title}`);
  parts.push(`Viewport: ${state.viewport.width}×${state.viewport.height}`);
  parts.push('');

  // Interactive elements
  parts.push(`## Interactive Elements (${state.interactiveElements.length})`);
  for (const el of state.interactiveElements.filter((e) => e.isVisible).slice(0, 30)) {
    parts.push(`- ${el.tag}${el.role ? `[role=${el.role}]` : ''}: "${el.text.slice(0, 60)}" ${el.boundingBox ? `(${Math.round(el.boundingBox.width)}×${Math.round(el.boundingBox.height)}px)` : ''}`);
  }
  parts.push('');

  // Headings
  if (state.headings.length > 0) {
    parts.push(`## Headings`);
    for (const h of state.headings) {
      parts.push(`- h${h.level}: ${h.text}`);
    }
    parts.push('');
  }

  // Landmarks
  if (state.landmarks.length > 0) {
    parts.push(`## Landmarks`);
    for (const l of state.landmarks) {
      parts.push(`- ${l.role}${l.label ? `: ${l.label}` : ''}`);
    }
    parts.push('');
  }

  // Existing deterministic findings
  const stateFindings = existingFindings.filter((f) => f.stateId === state.id);
  if (stateFindings.length > 0) {
    parts.push(`## Already Detected Issues (${stateFindings.length})`);
    for (const f of stateFindings.slice(0, 10)) {
      parts.push(`- [${f.severity}] ${f.title}`);
    }
    parts.push('');
  }

  // DOM snippet
  if (state.domSnippet) {
    const sanitized = sanitizeDomSnippet(sanitizeForAI(state.domSnippet), true);
    parts.push(`## DOM Structure`);
    parts.push('```html');
    parts.push(sanitized.slice(0, 3000));
    parts.push('```');
  }

  return parts.join('\n');
}

function parseAIFindings(content: string): z.infer<typeof AIFindingsArraySchema> {
  try {
    // Try to extract JSON array from the response
    let jsonStr = content.trim();

    // Handle responses wrapped in markdown code blocks
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch?.[1]) {
      jsonStr = codeBlockMatch[1];
    }

    // Handle responses that are a JSON object with a "findings" key
    const parsed = JSON.parse(jsonStr);
    const arr = Array.isArray(parsed) ? parsed : (parsed.findings ?? []);

    const result = AIFindingsArraySchema.safeParse(arr);
    if (result.success) {
      return result.data;
    }

    log.debug(`AI response validation failed: ${result.error.issues.map((i) => i.message).join(', ')}`);
    return [];
  } catch {
    log.debug('Failed to parse AI response as JSON');
    return [];
  }
}
