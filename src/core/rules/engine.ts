import type { UIState } from '../states/types.js';
import type { Finding, Evidence, Severity, FindingCategory } from '../findings/types.js';
import { nanoid } from 'nanoid';
import { Logger } from '../logger.js';

const log = new Logger({ prefix: 'Rules' });

/**
 * A deterministic rule that analyzes a UIState and produces findings.
 */
export interface Rule {
  id: string;
  name: string;
  category: FindingCategory;
  run(state: UIState, context: RuleContext): Promise<Finding[]>;
}

export interface RuleContext {
  allStates: UIState[];
  targetUrl: string;
  repoPath?: string;
}

/**
 * Registry and executor for deterministic rules.
 */
export class RuleEngine {
  private rules: Rule[] = [];

  register(rule: Rule): void {
    this.rules.push(rule);
    log.debug(`Registered rule: ${rule.id}`);
  }

  registerAll(rules: Rule[]): void {
    for (const rule of rules) {
      this.register(rule);
    }
  }

  async runAll(states: UIState[], context: RuleContext): Promise<Finding[]> {
    const allFindings: Finding[] = [];

    for (const state of states) {
      for (const rule of this.rules) {
        try {
          const findings = await rule.run(state, context);
          allFindings.push(...findings);
        } catch (err) {
          log.warn(`Rule ${rule.id} failed on state ${state.id}: ${err}`);
        }
      }
    }

    log.info(`${this.rules.length} rules produced ${allFindings.length} findings across ${states.length} states`);
    return allFindings;
  }

  getRules(): Rule[] {
    return [...this.rules];
  }
}

/**
 * Helper to create a finding from a rule.
 */
export function createRuleFinding(params: {
  ruleId: string;
  title: string;
  severity: Severity;
  confidence: number;
  category: FindingCategory;
  description: string;
  impact: string;
  recommendation: string;
  state: UIState;
  selector?: string;
  evidence?: Evidence[];
}): Finding {
  return {
    id: `${params.ruleId}-${nanoid(6)}`,
    title: params.title,
    severity: params.severity,
    confidence: params.confidence,
    category: params.category,
    description: params.description,
    impact: params.impact,
    recommendation: params.recommendation,
    stateId: params.state.id,
    url: params.state.url,
    viewport: params.state.viewport,
    selector: params.selector,
    reproductionSteps: params.state.actionsToReach,
    evidence: params.evidence ?? [],
    ruleId: params.ruleId,
    source: 'rule',
    verificationStatus: 'UNVERIFIED',
  };
}
