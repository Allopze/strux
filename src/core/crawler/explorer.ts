import type { Page } from 'playwright';
import { nanoid } from 'nanoid';
import type { AuditConfig } from '../config/schema.js';
import type { UIState, Action, StateTransition, StateGraph, ConsoleEntry, NetworkFailure } from '../states/types.js';
import { generateFingerprint, normalizeUrl } from '../states/fingerprint.js';
import { detectInteractiveElements, shouldExecuteAction } from '../interactions/detector.js';
import { EvidenceCollector } from '../evidence/collector.js';
import { navigateToState, executePageAction } from '../browser/navigator.js';
import { Logger } from '../logger.js';

const log = new Logger({ prefix: 'Explorer' });

export interface ExplorerOptions {
  config: AuditConfig;
  page: Page;
  evidence: EvidenceCollector;
}

/**
 * Autonomous explorer that crawls the target application,
 * discovers UI states via interactions, and builds a state graph.
 */
export class Explorer {
  private config: AuditConfig;
  private page: Page;
  private evidence: EvidenceCollector;

  private states = new Map<string, UIState>();
  private transitions: StateTransition[] = [];
  private visitedFingerprints = new Set<string>();
  private explorationQueue: ExplorationTask[] = [];
  private startTime = 0;
  private rootStateId = '';

  // Console and network tracking
  private currentConsoleEntries: ConsoleEntry[] = [];
  private currentNetworkFailures: NetworkFailure[] = [];

  // Listener cleanup handles
  private listenerCleanup?: () => void;

  constructor(options: ExplorerOptions) {
    this.config = options.config;
    this.page = options.page;
    this.evidence = options.evidence;
  }

  async explore(): Promise<StateGraph> {
    this.startTime = Date.now();

    // Set up console and network listeners
    this.setupListeners();

    // Navigate to target
    log.info(`Navigating to ${this.config.target.url}`);
    await this.page.goto(this.config.target.url, {
      waitUntil: 'networkidle',
      timeout: 30000,
    }).catch(() => {
      // Fallback: try without networkidle
      return this.page.goto(this.config.target.url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
    });

    // Capture root state
    const rootState = await this.captureState([], undefined, 0);
    if (!rootState) {
      throw new Error('Failed to capture root state');
    }
    this.rootStateId = rootState.id;

    // Seed queue with root state's interactable elements
    this.enqueueInteractions(rootState);

    // Process exploration queue
    let processed = 0;
    while (this.explorationQueue.length > 0) {
      // Check limits
      if (this.states.size >= this.config.exploration.maxStates) {
        log.info(`State limit reached (${this.config.exploration.maxStates})`);
        break;
      }

      const elapsed = (Date.now() - this.startTime) / 1000 / 60;
      if (elapsed >= this.config.exploration.maxRuntimeMinutes) {
        log.info(`Time limit reached (${this.config.exploration.maxRuntimeMinutes}min)`);
        break;
      }

      const task = this.explorationQueue.shift()!;

      // Skip if too deep
      if (task.depth > this.config.exploration.maxDepth) {
        continue;
      }

      try {
        await this.executeTask(task);
      } catch (err) {
        log.debug(`Task failed: ${err}`);
      }

      processed++;
      if (processed % 10 === 0) {
        log.info(`${this.states.size} states discovered, ${this.explorationQueue.length} tasks remaining`);
      }
    }

    log.info(`Exploration complete: ${this.states.size} states, ${this.transitions.length} transitions`);

    // Remove event listeners to prevent duplicates if reused
    this.listenerCleanup?.();

    return {
      states: this.states,
      transitions: this.transitions,
      rootStateId: this.rootStateId,
    };
  }

  private async executeTask(task: ExplorationTask): Promise<void> {
    // Navigate to the parent state's URL
    const parentState = this.states.get(task.parentStateId);
    if (!parentState) return;

    // Replay actions to reach parent state if needed
    const currentUrl = this.page.url();
    const normalizedCurrent = normalizeUrl(currentUrl);

    if (normalizedCurrent !== parentState.normalizedUrl || parentState.actionsToReach.length > 0) {
      await navigateToState(this.page, parentState);
    }

    // Wait for stability
    await this.page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
    await this.page.waitForTimeout(300);

    // Execute the action
    this.currentConsoleEntries = [];
    this.currentNetworkFailures = [];

    try {
      await executePageAction(this.page, task.action);
    } catch {
      log.debug(`Action failed: ${task.action.type} on ${task.action.selector}`);
      return;
    }

    // Wait for response
    await this.page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
    await this.page.waitForTimeout(500);

    // Capture resulting state
    const actionsToReach = [...task.parentActions, task.action];
    const newState = await this.captureState(actionsToReach, task.parentStateId, task.depth);

    if (newState) {
      // Record transition
      this.transitions.push({
        fromStateId: task.parentStateId,
        toStateId: newState.id,
        action: task.action,
      });

      // Only explore new states further
      if (!this.visitedFingerprints.has(newState.fingerprint)) {
        this.visitedFingerprints.add(newState.fingerprint);
        this.enqueueInteractions(newState);
      }
    }
  }

  private async captureState(
    actionsToReach: Action[],
    parentStateId: string | undefined,
    depth: number
  ): Promise<UIState | null> {
    try {
      const url = this.page.url();
      const normalizedUrlStr = normalizeUrl(url);
      const title = await this.page.title().catch(() => '');

      // Detect interactive elements
      const interactiveElements = await detectInteractiveElements(
        this.page,
        this.config.exploration.maxActionsPerState
      );

      // Capture headings and landmarks
      const headings = await this.evidence.captureHeadings(this.page);
      const landmarks = await this.evidence.captureLandmarks(this.page);

      const vp = this.page.viewportSize();
      const viewport = {
        width: vp?.width ?? 1440,
        height: vp?.height ?? 900,
      };

      const stateId = nanoid(12);

      // Generate fingerprint
      const fingerprint = generateFingerprint({
        normalizedUrl: normalizedUrlStr,
        interactiveElements,
        headings,
        landmarks,
      });

      // Capture screenshot
      const screenshotPath = await this.evidence.captureScreenshot(
        this.page,
        `state-${stateId}`
      );

      // Capture DOM snippet
      const domSnippet = await this.evidence.captureDomSnippet(this.page);

      const state: UIState = {
        id: stateId,
        fingerprint,
        url,
        normalizedUrl: normalizedUrlStr,
        title,
        screenshotPath,
        domSnippet,
        interactiveElements,
        headings,
        landmarks,
        viewport,
        actionsToReach,
        parentStateId,
        depth,
        timestamp: Date.now(),
        consoleEntries: [...this.currentConsoleEntries],
        networkFailures: [...this.currentNetworkFailures],
        metadata: {},
      };

      this.states.set(stateId, state);
      log.debug(`State captured: ${stateId} (${normalizedUrlStr}) [depth=${depth}]`);

      return state;
    } catch (err) {
      log.warn(`Failed to capture state: ${err}`);
      return null;
    }
  }

  private enqueueInteractions(state: UIState): void {
    const targetHostname = new URL(this.config.target.url).hostname;
    let enqueued = 0;

    for (const element of state.interactiveElements) {
      if (!element.isVisible || !element.isEnabled) continue;

      // Check risk policy
      if (!shouldExecuteAction(element.risk, this.config.interactionPolicy)) {
        continue;
      }

      // Check network safety — don't follow external links
      if (element.href) {
        try {
          const linkUrl = new URL(element.href, this.config.target.url);
          if (linkUrl.hostname !== targetHostname && !this.config.networkSafety.allowExternalLinks) {
            continue;
          }
        } catch {
          // Invalid URL, skip
          continue;
        }

        // Check block patterns
        const href = element.href.toLowerCase();
        const text = element.text.toLowerCase();
        if (this.config.networkSafety.blockPatterns.some(
          (p) => href.includes(p) || text.includes(p)
        )) {
          continue;
        }
      }

      // Block patterns on text
      const text = element.text.toLowerCase();
      if (this.config.networkSafety.blockPatterns.some((p) => text.includes(p))) {
        continue;
      }

      const action: Action = {
        type: element.tag === 'a' ? 'navigate' : 'click',
        selector: element.selector,
        label: element.text || element.ariaLabel || element.selector,
        risk: element.risk,
        description: `${element.tag}${element.role ? `[role=${element.role}]` : ''}: "${element.text.slice(0, 50)}"`,
      };

      this.explorationQueue.push({
        parentStateId: state.id,
        parentActions: state.actionsToReach,
        action,
        depth: state.depth + 1,
      });

      enqueued++;
      if (enqueued >= this.config.exploration.maxActionsPerState) break;
    }
  }



  private setupListeners(): void {
    const onConsole = (msg: import('playwright').ConsoleMessage) => {
      const type = msg.type();
      if (type === 'error' || type === 'warning') {
        this.currentConsoleEntries.push({
          type: type === 'warning' ? 'warning' : 'error',
          text: msg.text().slice(0, 500),
          url: msg.location()?.url,
          timestamp: Date.now(),
        });
      }
    };

    const onPageError = (err: Error) => {
      this.currentConsoleEntries.push({
        type: 'error',
        text: `PageError: ${err.message.slice(0, 500)}`,
        timestamp: Date.now(),
      });
    };

    const onRequestFailed = (request: import('playwright').Request) => {
      this.currentNetworkFailures.push({
        url: request.url(),
        method: request.method(),
        error: request.failure()?.errorText,
        timestamp: Date.now(),
      });
    };

    const onResponse = (response: import('playwright').Response) => {
      if (response.status() >= 400) {
        this.currentNetworkFailures.push({
          url: response.url(),
          method: response.request().method(),
          status: response.status(),
          timestamp: Date.now(),
        });
      }
    };

    this.page.on('console', onConsole);
    this.page.on('pageerror', onPageError);
    this.page.on('requestfailed', onRequestFailed);
    this.page.on('response', onResponse);

    this.listenerCleanup = () => {
      this.page.removeListener('console', onConsole);
      this.page.removeListener('pageerror', onPageError);
      this.page.removeListener('requestfailed', onRequestFailed);
      this.page.removeListener('response', onResponse);
    };
  }
}

interface ExplorationTask {
  parentStateId: string;
  parentActions: Action[];
  action: Action;
  depth: number;
}
