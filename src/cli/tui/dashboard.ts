import chalk from 'chalk';
import type { Finding, Severity } from '../../core/findings/types.js';

export interface DashboardState {
  targetUrl: string;
  startTime: number;
  currentPhase: number;
  totalPhases: number;
  phaseName: string;
  phaseProgress?: { current: number; total: number };
  statesDiscovered: number;
  statesUnique: number;
  findingsCount: Record<Severity, number>;
  liveFindings: Finding[];
}

export class LiveDashboard {
  private isTTY: boolean;
  private state: DashboardState;
  private timer?: NodeJS.Timeout;

  constructor(targetUrl: string) {
    this.isTTY = Boolean(process.stdout.isTTY && !process.env['CI']);
    this.state = {
      targetUrl,
      startTime: Date.now(),
      currentPhase: 1,
      totalPhases: 7,
      phaseName: 'Initializing...',
      statesDiscovered: 0,
      statesUnique: 0,
      findingsCount: {
        CRITICAL: 0,
        HIGH: 0,
        MEDIUM: 0,
        LOW: 0,
        INFO: 0,
      },
      liveFindings: [],
    };
  }

  start(): void {
    if (this.isTTY) {
      console.clear();
      this.renderHeader();
      this.timer = setInterval(() => {
        // Refresh timer if in TTY
      }, 500);
    } else {
      console.log(chalk.bold.cyan(`\n  🔍 UI/UX Auditor — ${this.state.targetUrl}`));
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  setPhase(phase: number, name: string, progress?: { current: number; total: number }): void {
    this.state.currentPhase = phase;
    this.state.phaseName = name;
    this.state.phaseProgress = progress;

    const phasePrefix = chalk.cyan(`[${phase}/${this.state.totalPhases}]`);
    let progressStr = '';
    if (progress && progress.total > 0) {
      const pct = Math.round((progress.current / progress.total) * 100);
      progressStr = chalk.dim(` (${progress.current}/${progress.total} - ${pct}%)`);
    }

    console.log(`  ${phasePrefix} ${chalk.bold(name)}${progressStr}`);
  }

  updateStateCounts(discovered: number, unique: number): void {
    this.state.statesDiscovered = discovered;
    this.state.statesUnique = unique;
  }

  addFindings(newFindings: Finding[]): void {
    for (const f of newFindings) {
      this.state.findingsCount[f.severity]++;
      if (this.state.liveFindings.length < 50) {
        this.state.liveFindings.push(f);
      }

      // Stream the finding
      this.printFindingStream(f);
    }
  }

  private printFindingStream(f: Finding): void {
    const badge = this.getSeverityBadge(f.severity);
    const shortTitle = f.title.length > 60 ? f.title.slice(0, 57) + '...' : f.title;
    const selector = f.selector ? chalk.dim(` (${f.selector})`) : '';
    console.log(`     ${badge} ${shortTitle}${selector}`);
  }

  private getSeverityBadge(severity: Severity): string {
    switch (severity) {
      case 'CRITICAL':
        return chalk.bgRed.black.bold(' CRITICAL ');
      case 'HIGH':
        return chalk.bgHex('#FF5722').black.bold(' HIGH ');
      case 'MEDIUM':
        return chalk.bgYellow.black.bold(' MEDIUM ');
      case 'LOW':
        return chalk.bgBlue.black.bold(' LOW ');
      case 'INFO':
        return chalk.bgGray.black(' INFO ');
    }
  }

  private renderHeader(): void {
    console.log(chalk.cyan('┌────────────────────────────────────────────────────────────────────────┐'));
    console.log(chalk.cyan('│') + chalk.bold.white('  🔍 UI/UX Auditor — Terminal Engine') + ' '.repeat(34) + chalk.cyan('│'));
    console.log(chalk.cyan('│') + chalk.dim(`  Target: ${this.state.targetUrl.padEnd(58)}`) + chalk.cyan('│'));
    console.log(chalk.cyan('└────────────────────────────────────────────────────────────────────────┘'));
    console.log('');
  }

  printFinalSummary(verifiedCount: number, durationSeconds: number): void {
    const min = Math.floor(durationSeconds / 60);
    const sec = durationSeconds % 60;
    const durStr = `${min}m ${sec}s`;
    const totalFindings =
      this.state.findingsCount.CRITICAL +
      this.state.findingsCount.HIGH +
      this.state.findingsCount.MEDIUM +
      this.state.findingsCount.LOW +
      this.state.findingsCount.INFO;

    console.log('');
    console.log(chalk.green('═════════════════════════════════════════════════════════════════════════'));
    console.log(chalk.bold.white('  ✨ AUDIT COMPLETED'));
    console.log(chalk.green('═════════════════════════════════════════════════════════════════════════'));
    console.log(`  ⏱️  Duration:           ${chalk.bold(durStr)}`);
    console.log(`  🌐 States Explored:    ${chalk.bold(this.state.statesDiscovered)} (${this.state.statesUnique} unique)`);
    console.log(`  🎯 Total Findings:     ${chalk.bold(totalFindings)}`);
    console.log(`  🛡️  Verified Defects:   ${chalk.green.bold(verifiedCount)}`);
    console.log('');
    console.log(`  🔴 Critical:           ${this.state.findingsCount.CRITICAL}`);
    console.log(`  🟠 High:               ${this.state.findingsCount.HIGH}`);
    console.log(`  🟡 Medium:             ${this.state.findingsCount.MEDIUM}`);
    console.log(`  🔵 Low:                ${this.state.findingsCount.LOW}`);
    console.log(chalk.green('═════════════════════════════════════════════════════════════════════════'));
    console.log('');
  }
}
