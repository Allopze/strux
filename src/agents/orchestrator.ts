import type { AuditConfig } from '../core/config/schema.js';
import type { UIState, StateGraph } from '../core/states/types.js';
import type { Finding, AuditSummary, AuditResult } from '../core/findings/types.js';
import type { LLMProvider } from '../providers/types.js';
import { BrowserManager } from '../core/browser/manager.js';
import { navigateToState } from '../core/browser/navigator.js';
import { Explorer } from '../core/crawler/explorer.js';
import { EvidenceCollector } from '../core/evidence/collector.js';
import { deduplicateStates } from '../core/states/dedup.js';
import { RuleEngine } from '../core/rules/engine.js';
import { headingOrderRule, landmarkRule, runAxeAnalysis } from '../core/rules/accessibility.js';
import { touchTargetRule, overflowRule } from '../core/rules/touch-targets.js';
import { formLabelsRule, formSubmitRule } from '../core/rules/forms.js';
import { deadLinksRule, networkErrorsRule } from '../core/rules/navigation.js';
import { consoleErrorsRule } from '../core/rules/console.js';
import { deduplicateFindings } from '../core/findings/dedup.js';
import { FindingVerifier } from '../core/verifier/verifier.js';
import { CodeMapper } from '../core/code-mapper/mapper.js';
import { InferenceBudget } from '../providers/budget.js';
import { runVisualReview, runUXReview } from './reviewers.js';
import { ResponsiveRunner } from '../core/responsive/runner.js';
import { JourneyExecutor } from '../core/journeys/executor.js';
import { DesignSystemInferrer } from '../core/design-system/inferrer.js';
import { generateMarkdownReport, generateJsonReport, generateHtmlReport } from '../core/reporter/index.js';
import { Logger } from '../core/logger.js';
import type { LiveDashboard } from '../cli/tui/dashboard.js';

const log = new Logger({ prefix: 'Orchestrator' });

export interface OrchestratorOptions {
  config: AuditConfig;
  provider?: LLMProvider;
  dashboard?: LiveDashboard;
}

/**
 * Main orchestrator that drives the entire audit pipeline:
 * explore → deduplicate → rules → AI → verify → code map → report
 */
export class Orchestrator {
  private config: AuditConfig;
  private provider?: LLMProvider;
  private browserManager: BrowserManager;
  private evidence: EvidenceCollector;
  private ruleEngine: RuleEngine;
  private dashboard?: LiveDashboard;

  constructor(
    configOrOptions: AuditConfig | OrchestratorOptions,
    provider?: LLMProvider,
    dashboard?: LiveDashboard
  ) {
    if ('config' in configOrOptions) {
      this.config = configOrOptions.config;
      this.provider = configOrOptions.provider;
      this.dashboard = configOrOptions.dashboard;
    } else {
      this.config = configOrOptions;
      this.provider = provider;
      this.dashboard = dashboard;
    }
    this.browserManager = new BrowserManager(this.config);
    this.evidence = new EvidenceCollector(this.config.reports.outputDir);
    this.ruleEngine = new RuleEngine();

    // Register all deterministic rules
    this.ruleEngine.registerAll([
      headingOrderRule,
      landmarkRule,
      touchTargetRule,
      overflowRule,
      formLabelsRule,
      formSubmitRule,
      deadLinksRule,
      networkErrorsRule,
      consoleErrorsRule,
    ]);
  }

  async run(): Promise<AuditResult> {
    const startTime = Date.now();
    let allFindings: Finding[] = [];
    let stateGraph: StateGraph | undefined;
    let uniqueStates: UIState[] = [];
    let aiRequests = 0;
    let journeysTested = 0;

    try {
      this.dashboard?.start();

      // 1. Launch browser
      log.info('Starting audit...');
      await this.browserManager.launch();

      // 2. Explore application
      this.dashboard?.setPhase(1, 'Explorando estados interactivos de la aplicación...');
      log.info('Phase 1: Exploring application...');
      const worker = await this.browserManager.createWorker(0);

      const explorer = new Explorer({
        config: this.config,
        page: worker.page,
        evidence: this.evidence,
      });

      stateGraph = await explorer.explore();
      const allStates = Array.from(stateGraph.states.values());

      // 3. Deduplicate states
      this.dashboard?.setPhase(2, 'Deduplicando estados y calculando fingerprints...');
      log.info('Phase 2: Deduplicating states...');
      const dedupResult = deduplicateStates(allStates);
      uniqueStates = dedupResult.uniqueStates;
      this.dashboard?.updateStateCounts(allStates.length, uniqueStates.length);

      // 4. Run axe-core on each unique state (requires page navigation and state reconstruction)
      this.dashboard?.setPhase(3, 'Ejecutando análisis de accesibilidad WCAG (axe-core)...', { current: 0, total: uniqueStates.length });
      log.info('Phase 3: Running accessibility analysis...');
      const axeFindings: Finding[] = [];
      for (const [i, state] of uniqueStates.entries()) {
        try {
          await navigateToState(worker.page, state);
          await worker.page.waitForTimeout(300);
          const findings = await runAxeAnalysis(worker.page, state);
          axeFindings.push(...findings);
        } catch (err) {
          log.debug(`axe analysis failed for state ${state.id}: ${err}`);
        }

        this.dashboard?.setPhase(3, 'Ejecutando análisis de accesibilidad WCAG (axe-core)...', { current: i + 1, total: uniqueStates.length });
        if ((i + 1) % 5 === 0 || i === uniqueStates.length - 1) {
          log.progress('axe-core analysis', i + 1, uniqueStates.length);
        }
      }
      allFindings.push(...axeFindings);
      this.dashboard?.addFindings(axeFindings);

      // 5. Run deterministic rules on all unique states
      this.dashboard?.setPhase(4, 'Ejecutando reglas deterministas de layout, formularios y enlaces...');
      log.info('Phase 4: Running deterministic rules...');
      const ruleFindings = await this.ruleEngine.runAll(uniqueStates, {
        allStates: uniqueStates,
        targetUrl: this.config.target.url,
        repoPath: this.config.repo?.path,
      });
      allFindings.push(...ruleFindings);
      this.dashboard?.addFindings(ruleFindings);

      // 5.1 Responsive analysis across configured viewports
      if (this.config.audit.responsive) {
        log.info('Phase 4.1: Responsive multi-viewport analysis...');
        const responsiveRunner = new ResponsiveRunner({
          page: worker.page,
          config: this.config,
          uniqueStates,
        });
        const responsiveFindings = await responsiveRunner.run(uniqueStates);
        allFindings.push(...responsiveFindings);
        this.dashboard?.addFindings(responsiveFindings);
      }

      // 5.2 User journey flow testing
      journeysTested = 0;
      if (this.config.journeys.length > 0) {
        log.info('Phase 4.2: User journey execution...');
        const journeyExecutor = new JourneyExecutor(worker.page, this.config.target.url);
        const { metrics, findings: journeyFindings } = await journeyExecutor.runJourneys(
          this.config.journeys,
          uniqueStates
        );
        journeysTested = metrics.length;
        allFindings.push(...journeyFindings);
        this.dashboard?.addFindings(journeyFindings);
      }

      // 5.3 Design system & visual consistency inference
      if (this.config.audit.consistency) {
        log.info('Phase 4.3: Design system consistency analysis...');
        const dsInferrer = new DesignSystemInferrer(worker.page);
        const consistencyFindings = await dsInferrer.analyze(uniqueStates);
        allFindings.push(...consistencyFindings);
        this.dashboard?.addFindings(consistencyFindings);
      }

      // 6. AI analysis (if enabled and provider available)
      if (this.config.ai.enabled && this.provider) {
        this.dashboard?.setPhase(5, 'Ejecutando revisión de IA (Visual & UX)...');
        log.info('Phase 5: AI analysis...');
        const budget = new InferenceBudget({
          maxRequests: this.config.ai.maxRequests,
          maxRequestsPerState: this.config.ai.maxRequestsPerState,
          analyzeDuplicates: this.config.ai.analyzeDuplicates,
        });

        // Prioritize states by interest score
        const scoredStates = uniqueStates
          .map((s) => ({ state: s, score: InferenceBudget.calculateInterestScore(s) }))
          .sort((a, b) => b.score - a.score);

        for (const { state } of scoredStates) {
          if (!budget.canRequest(state.id)) continue;

          try {
            // Visual review
            if (this.config.audit.ui && budget.canRequest(state.id)) {
              budget.recordRequest(state.id);
              const findings = await runVisualReview(this.provider, state, allFindings);
              allFindings.push(...findings);
              this.dashboard?.addFindings(findings);
              aiRequests++;
            }

            // UX review
            if (this.config.audit.ux && budget.canRequest(state.id)) {
              budget.recordRequest(state.id);
              const findings = await runUXReview(this.provider, state, allFindings);
              allFindings.push(...findings);
              this.dashboard?.addFindings(findings);
              aiRequests++;
            }
          } catch (err) {
            log.warn(`AI analysis failed for state ${state.id}: ${err}`);
          }
        }

        log.info(`AI analysis used ${aiRequests} requests`);
      }

      // 7. Deduplicate findings
      log.info('Phase 6: Deduplicating findings...');
      allFindings = deduplicateFindings(allFindings);

      // 8. Verify findings
      if (this.config.verification.enabled) {
        this.dashboard?.setPhase(6, 'Verificando hallazgos autónomamente en navegador limpio...');
        log.info('Phase 7: Verifying findings...');
        const verifierWorker = await this.browserManager.getOrCreateActiveWorker(0);
        const verifier = new FindingVerifier(verifierWorker.page, this.config.target.url);
        allFindings = await verifier.verifyAll(allFindings);
      }

      // 9. Code mapping
      if (this.config.repo?.path) {
        log.info('Phase 8: Mapping findings to source code...');
        const codeMapper = new CodeMapper(this.config.repo.path);
        allFindings = await codeMapper.mapFindings(allFindings);
      }

      // 10. Generate summary
      const endTime = Date.now();
      const discoveredRoutes = new Set(uniqueStates.map((s) => s.normalizedUrl)).size;
      const summary = buildSummary({
        targetUrl: this.config.target.url,
        startTime,
        endTime,
        statesExplored: allStates.length,
        uniqueStates: uniqueStates.length,
        routesDiscovered: discoveredRoutes,
        interactionsExecuted: stateGraph.transitions.length,
        journeysTested,
        findings: allFindings,
        aiRequests,
      });

      const result: AuditResult = {
        summary,
        findings: allFindings,
        states: stateGraph.states,
      };

      // 11. Generate reports
      this.dashboard?.setPhase(7, 'Generando reportes (Markdown, JSON, HTML)...');
      log.info('Phase 9: Generating reports...');
      const outputDir = this.config.reports.outputDir;

      if (this.config.reports.markdown) {
        const path = generateMarkdownReport(result, outputDir);
        log.info(`Markdown report: ${path}`);
      }

      if (this.config.reports.json) {
        const path = generateJsonReport(result, outputDir);
        log.info(`JSON report: ${path}`);
      }

      if (this.config.reports.html) {
        const path = generateHtmlReport(result, outputDir);
        log.info(`HTML report: ${path}`);
      }

      const verifiedCount = allFindings.filter((f) => f.verificationStatus === 'VERIFIED').length;
      this.dashboard?.printFinalSummary(verifiedCount, Math.round((endTime - startTime) / 1000));
      this.dashboard?.stop();

      // 12. Print summary
      printSummary(summary);

      return result;
    } finally {
      await this.browserManager.close();
    }
  }
}

function buildSummary(params: {
  targetUrl: string;
  startTime: number;
  endTime: number;
  statesExplored: number;
  uniqueStates: number;
  routesDiscovered: number;
  interactionsExecuted: number;
  journeysTested: number;
  findings: Finding[];
  aiRequests: number;
}): AuditSummary {
  const findings = params.findings;

  const findingsBySeverity = {
    CRITICAL: findings.filter((f) => f.severity === 'CRITICAL').length,
    HIGH: findings.filter((f) => f.severity === 'HIGH').length,
    MEDIUM: findings.filter((f) => f.severity === 'MEDIUM').length,
    LOW: findings.filter((f) => f.severity === 'LOW').length,
    INFO: findings.filter((f) => f.severity === 'INFO').length,
  };

  const findingsByCategory: Record<string, number> = {};
  for (const f of findings) {
    findingsByCategory[f.category] = (findingsByCategory[f.category] ?? 0) + 1;
  }

  return {
    targetUrl: params.targetUrl,
    startTime: params.startTime,
    endTime: params.endTime,
    durationMs: params.endTime - params.startTime,
    statesExplored: params.statesExplored,
    uniqueStates: params.uniqueStates,
    routesDiscovered: params.routesDiscovered,
    interactionsExecuted: params.interactionsExecuted,
    journeysTested: params.journeysTested,
    totalFindings: findings.length,
    verifiedFindings: findings.filter((f) => f.verificationStatus === 'VERIFIED').length,
    rejectedFindings: findings.filter((f) => f.verificationStatus === 'REJECTED').length,
    findingsBySeverity,
    findingsByCategory,
    accessibilityViolations: findings.filter((f) => f.category === 'ACCESSIBILITY').length,
    responsiveIssues: findings.filter((f) => f.category === 'RESPONSIVE').length,
    consoleErrors: findings.filter((f) => f.ruleId === 'sys-console-error').length,
    aiRequests: params.aiRequests,
  };
}

function printSummary(s: AuditSummary): void {
  const duration = s.durationMs / 1000;
  const minutes = Math.floor(duration / 60);
  const seconds = Math.round(duration % 60);

  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log('  Audit completed.');
  console.log('═══════════════════════════════════════════');
  console.log(`  States discovered:    ${s.statesExplored}`);
  console.log(`  Unique states:        ${s.uniqueStates}`);
  console.log(`  Routes:               ${s.routesDiscovered}`);
  console.log(`  Interactions:         ${s.interactionsExecuted}`);
  console.log(`  Findings:             ${s.totalFindings}`);
  console.log(`  Verified:             ${s.verifiedFindings}`);
  console.log(`  Rejected:             ${s.rejectedFindings}`);
  console.log(`  🔴 Critical:          ${s.findingsBySeverity.CRITICAL}`);
  console.log(`  🟠 High:              ${s.findingsBySeverity.HIGH}`);
  console.log(`  🟡 Medium:            ${s.findingsBySeverity.MEDIUM}`);
  console.log(`  🔵 Low:               ${s.findingsBySeverity.LOW}`);
  console.log(`  Duration:             ${minutes}m ${seconds}s`);
  console.log('═══════════════════════════════════════════');
}
