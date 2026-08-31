import chalk from 'chalk';
import readline from 'node:readline';
import { exec } from 'node:child_process';
import type { Finding, Severity } from '../../core/findings/types.js';

export class InteractiveInspector {
  private findings: Finding[];
  private filteredFindings: Finding[];
  private selectedIndex = 0;
  private currentFilter: Severity | 'ALL' = 'ALL';
  private expanded = false;
  private htmlReportPath?: string;

  constructor(findings: Finding[], htmlReportPath?: string) {
    this.findings = findings;
    this.filteredFindings = [...findings];
    this.htmlReportPath = htmlReportPath;
  }

  async run(): Promise<void> {
    if (!process.stdin.isTTY) {
      this.renderNonInteractive();
      return;
    }

    // Set raw mode
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    this.render();

    return new Promise<void>((resolve) => {
      const handleKey = (str: string, key: readline.Key) => {
        if (key.ctrl && key.name === 'c') {
          process.stdin.removeListener('keypress', handleKey);
          this.cleanup();
          resolve();
          return;
        }

        if (key.name === 'q' || key.name === 'escape') {
          process.stdin.removeListener('keypress', handleKey);
          this.cleanup();
          resolve();
          return;
        }

        if (key.name === 'up' || key.name === 'k') {
          if (this.selectedIndex > 0) {
            this.selectedIndex--;
            this.render();
          }
        } else if (key.name === 'down' || key.name === 'j') {
          if (this.selectedIndex < this.filteredFindings.length - 1) {
            this.selectedIndex++;
            this.render();
          }
        } else if (key.name === 'return' || key.name === 'space') {
          this.expanded = !this.expanded;
          this.render();
        } else if (str === '1') {
          this.setFilter('ALL');
        } else if (str === '2') {
          this.setFilter('CRITICAL');
        } else if (str === '3') {
          this.setFilter('HIGH');
        } else if (str === '4') {
          this.setFilter('MEDIUM');
        } else if (str === '5') {
          this.setFilter('LOW');
        } else if (key.name === 'o' && this.htmlReportPath) {
          this.openHtmlReport();
        }
      };

      const handleEnd = () => {
        process.stdin.removeListener('keypress', handleKey);
        this.cleanup();
        resolve();
      };

      process.stdin.on('keypress', handleKey);
      process.stdin.once('end', handleEnd);
    });
  }

  private setFilter(filter: Severity | 'ALL'): void {
    this.currentFilter = filter;
    if (filter === 'ALL') {
      this.filteredFindings = [...this.findings];
    } else {
      this.filteredFindings = this.findings.filter((f) => f.severity === filter);
    }
    this.selectedIndex = 0;
    this.render();
  }

  private openHtmlReport(): void {
    if (!this.htmlReportPath) return;
    const cmd =
      process.platform === 'darwin'
        ? `open "${this.htmlReportPath}"`
        : process.platform === 'win32'
          ? `start "" "${this.htmlReportPath}"`
          : `xdg-open "${this.htmlReportPath}"`;
    exec(cmd);
  }

  private cleanup(): void {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    console.clear();
  }

  private render(): void {
    console.clear();

    console.log(chalk.cyan('┌────────────────────────────────────────────────────────────────────────┐'));
    console.log(chalk.cyan('│') + chalk.bold.white('  🎯 UI/UX AUDITOR — Interactive Findings Inspector') + ' '.repeat(20) + chalk.cyan('│'));
    console.log(chalk.cyan('│') + chalk.dim('  Keys: [↑/↓] Navigate  [Enter] Details  [1-5] Filter  [o] Open HTML  [q] Quit') + chalk.cyan('│'));
    console.log(chalk.cyan('└────────────────────────────────────────────────────────────────────────┘'));

    console.log(
      chalk.dim(' Filter: ') +
        (this.currentFilter === 'ALL' ? chalk.bold.cyan('[1: All]') : '[1: All]') +
        ' ' +
        (this.currentFilter === 'CRITICAL' ? chalk.bold.red('[2: Critical]') : '[2: Critical]') +
        ' ' +
        (this.currentFilter === 'HIGH' ? chalk.bold.hex('#FF5722')('[3: High]') : '[3: High]') +
        ' ' +
        (this.currentFilter === 'MEDIUM' ? chalk.bold.yellow('[4: Medium]') : '[4: Medium]') +
        ' ' +
        (this.currentFilter === 'LOW' ? chalk.bold.blue('[5: Low]') : '[5: Low]') +
        chalk.dim(` (${this.filteredFindings.length} findings)`)
    );
    console.log('');

    if (this.filteredFindings.length === 0) {
      console.log(chalk.yellow('  No findings match this filter.'));
      return;
    }

    const pageSize = 10;
    const startIdx = Math.max(0, Math.min(this.selectedIndex - Math.floor(pageSize / 2), this.filteredFindings.length - pageSize));
    const visibleFindings = this.filteredFindings.slice(startIdx, startIdx + pageSize);

    for (let i = 0; i < visibleFindings.length; i++) {
      const idx = startIdx + i;
      const f = visibleFindings[i]!;
      const isSelected = idx === this.selectedIndex;
      const cursor = isSelected ? chalk.bold.cyan('▶ ') : '  ';
      const badge = this.getBadge(f.severity);
      const title = f.title.length > 50 ? f.title.slice(0, 47) + '...' : f.title;
      const status = f.verificationStatus === 'VERIFIED' ? chalk.green('✓') : chalk.dim('?');

      if (isSelected) {
        console.log(chalk.bgGray.white(`${cursor}${badge} ${status} ${title.padEnd(52)}`));
      } else {
        console.log(`${cursor}${badge} ${status} ${title}`);
      }
    }

    // Selected Details Panel
    const selected = this.filteredFindings[this.selectedIndex];
    if (selected) {
      console.log('');
      console.log(chalk.cyan('──────────────────────────────────────────────────────────────────────────'));
      console.log(chalk.bold.white(`  📌 Details: ${selected.title}`));
      console.log(`  📂 Category:     ${chalk.bold(selected.category)} · Confidence: ${Math.round(selected.confidence * 100)}%`);
      console.log(`  🛡️  Status:       ${this.formatStatus(selected.verificationStatus)}`);
      if (selected.selector) {
        console.log(`  🎯 Selector:     ${chalk.cyan(selected.selector)}`);
      }
      if (selected.suspectedSourceFiles?.length) {
        console.log(`  📁 Source:       ${chalk.green(selected.suspectedSourceFiles.map((s) => `${s.file}${s.line ? ':' + s.line : ''}`).join(', '))}`);
      }
      console.log('');
      console.log(`  📝 ${chalk.dim(selected.description)}`);

      if (selected.impact) {
        console.log(`  ⚠️  ${chalk.yellow('Impact:')} ${selected.impact}`);
      }
      if (selected.recommendation) {
        console.log(`  💡 ${chalk.green('Recommendation:')} ${selected.recommendation}`);
      }
    }
  }

  private renderNonInteractive(): void {
    console.log(chalk.bold(`\n  Findings Summary (${this.findings.length} total):`));
    for (const f of this.findings) {
      console.log(`  - [${f.severity}] ${f.title} (${f.verificationStatus})`);
    }
  }

  private getBadge(severity: Severity): string {
    switch (severity) {
      case 'CRITICAL':
        return chalk.red('[CRIT]');
      case 'HIGH':
        return chalk.hex('#FF5722')('[HIGH]');
      case 'MEDIUM':
        return chalk.yellow('[MED ]');
      case 'LOW':
        return chalk.blue('[LOW ]');
      case 'INFO':
        return chalk.gray('[INFO]');
    }
  }

  private formatStatus(status: string): string {
    switch (status) {
      case 'VERIFIED':
        return chalk.green.bold('VERIFIED (Confirmed defect)');
      case 'REJECTED':
        return chalk.red.bold('REJECTED (False positive)');
      case 'PARTIAL':
        return chalk.yellow('PARTIAL (Element present)');
      default:
        return chalk.dim(status);
    }
  }
}
