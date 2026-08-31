import type { UIState } from '../core/states/types.js';

export interface BudgetConfig {
  maxRequests: number;
  maxRequestsPerState: number;
  analyzeDuplicates: boolean;
}

/**
 * Tracks and enforces AI inference budget.
 */
export class InferenceBudget {
  private config: BudgetConfig;
  private totalRequests = 0;
  private requestsPerState = new Map<string, number>();

  constructor(config: BudgetConfig) {
    this.config = config;
  }

  canRequest(stateId: string): boolean {
    if (this.totalRequests >= this.config.maxRequests) {
      return false;
    }

    const stateRequests = this.requestsPerState.get(stateId) ?? 0;
    return stateRequests < this.config.maxRequestsPerState;
  }

  recordRequest(stateId: string): void {
    this.totalRequests++;
    const current = this.requestsPerState.get(stateId) ?? 0;
    this.requestsPerState.set(stateId, current + 1);
  }

  getStats(): { total: number; remaining: number } {
    return {
      total: this.totalRequests,
      remaining: Math.max(0, this.config.maxRequests - this.totalRequests),
    };
  }

  /**
   * Calculate an interest score for a state to prioritize AI analysis.
   * Higher scores get analyzed first.
   */
  static calculateInterestScore(state: UIState): number {
    let score = 0;

    // Has form inputs
    const hasForm = state.interactiveElements.some(
      (el) => ['input', 'select', 'textarea'].includes(el.tag)
    );
    if (hasForm) score += 30;

    // Has console errors
    if (state.consoleEntries.some((e) => e.type === 'error')) score += 25;

    // Has network failures
    if (state.networkFailures.length > 0) score += 20;

    // Has modals/dialogs (likely interesting state)
    const hasModal = state.interactiveElements.some(
      (el) => el.role === 'dialog' || el.role === 'alertdialog'
    );
    if (hasModal) score += 20;

    // Has many interactive elements (complex UI)
    if (state.interactiveElements.length > 10) score += 15;

    // Root state or main pages
    if (state.depth <= 1) score += 10;

    // Has navigation landmarks
    if (state.landmarks.some((l) => l.role === 'navigation')) score += 5;

    // Multiple headings (content-rich page)
    if (state.headings.length > 3) score += 5;

    return score;
  }
}
