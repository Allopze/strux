import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { AuditResult } from '../findings/types.js';
import type { Finding } from '../findings/types.js';

/**
 * Generate Markdown audit report.
 */
export function generateMarkdownReport(result: AuditResult, outputDir: string): string {
  const path = join(outputDir, 'report.md');
  ensureDir(path);

  const lines: string[] = [];
  const s = result.summary;

  lines.push('# UI/UX Audit Report');
  lines.push('');
  lines.push('## Executive Summary');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Target URL | ${s.targetUrl} |`);
  lines.push(`| Duration | ${formatDuration(s.durationMs)} |`);
  lines.push(`| States explored | ${s.statesExplored} |`);
  lines.push(`| Unique UI states | ${s.uniqueStates} |`);
  lines.push(`| Routes discovered | ${s.routesDiscovered} |`);
  lines.push(`| Interactions executed | ${s.interactionsExecuted} |`);
  lines.push(`| Journeys tested | ${s.journeysTested} |`);
  lines.push(`| **Total findings** | **${s.totalFindings}** |`);
  lines.push(`| Verified findings | ${s.verifiedFindings} |`);
  lines.push(`| Rejected findings | ${s.rejectedFindings} |`);
  lines.push(`| 🔴 Critical | ${s.findingsBySeverity.CRITICAL} |`);
  lines.push(`| 🟠 High | ${s.findingsBySeverity.HIGH} |`);
  lines.push(`| 🟡 Medium | ${s.findingsBySeverity.MEDIUM} |`);
  lines.push(`| 🔵 Low | ${s.findingsBySeverity.LOW} |`);
  lines.push(`| ℹ️ Info | ${s.findingsBySeverity.INFO} |`);
  lines.push(`| Accessibility violations | ${s.accessibilityViolations} |`);
  lines.push(`| Responsive issues | ${s.responsiveIssues} |`);
  lines.push(`| Console errors | ${s.consoleErrors} |`);
  lines.push(`| AI requests | ${s.aiRequests} |`);
  lines.push('');

  // Group findings by severity
  const severities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] as const;

  for (const severity of severities) {
    const filtered = result.findings.filter((f) => f.severity === severity);
    if (filtered.length === 0) continue;

    lines.push(`## ${severityIcon(severity)} ${severity} (${filtered.length})`);
    lines.push('');

    for (const finding of filtered) {
      lines.push(formatFinding(finding));
      lines.push('');
    }
  }

  const content = lines.join('\n');
  writeFileSync(path, content, 'utf-8');
  return path;
}

/**
 * Generate JSON audit report.
 */
export function generateJsonReport(result: AuditResult, outputDir: string): string {
  const path = join(outputDir, 'report.json');
  ensureDir(path);

  const data = {
    summary: result.summary,
    findings: result.findings,
    generatedAt: new Date().toISOString(),
  };

  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
  return path;
}

/**
 * Generate self-contained HTML audit report.
 */
export function generateHtmlReport(result: AuditResult, outputDir: string): string {
  const path = join(outputDir, 'report.html');
  ensureDir(path);

  const s = result.summary;
  const findingsJson = JSON.stringify(result.findings);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>UI/UX Audit Report — ${s.targetUrl}</title>
  <style>
    :root {
      --bg: #0f1117;
      --surface: #1a1d27;
      --surface2: #252830;
      --border: #2e3140;
      --text: #e4e6eb;
      --text-dim: #8b8fa3;
      --critical: #ff4757;
      --high: #ff8c42;
      --medium: #ffd43b;
      --low: #4dabf7;
      --info: #69db7c;
      --accent: #7c5cfc;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', -apple-system, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }
    .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
    h1 { font-size: 1.8rem; margin-bottom: 0.5rem; background: linear-gradient(135deg, var(--accent), #a78bfa); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    h2 { font-size: 1.3rem; margin: 2rem 0 1rem; color: var(--text); }
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin: 1.5rem 0; }
    .stat { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1rem 1.2rem; }
    .stat-label { font-size: 0.8rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.05em; }
    .stat-value { font-size: 1.5rem; font-weight: 700; margin-top: 0.25rem; }
    .severity-critical .stat-value { color: var(--critical); }
    .severity-high .stat-value { color: var(--high); }
    .severity-medium .stat-value { color: var(--medium); }
    .severity-low .stat-value { color: var(--low); }
    .filters { display: flex; gap: 0.5rem; flex-wrap: wrap; margin: 1rem 0; }
    .filter-btn { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 0.4rem 1rem; color: var(--text); cursor: pointer; font-size: 0.85rem; transition: all 0.2s; }
    .filter-btn:hover, .filter-btn.active { background: var(--accent); border-color: var(--accent); }
    .search-box { width: 100%; padding: 0.6rem 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; color: var(--text); font-size: 0.9rem; margin: 1rem 0; }
    .finding { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1.2rem; margin-bottom: 1rem; transition: border-color 0.2s; }
    .finding:hover { border-color: var(--accent); }
    .finding-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem; }
    .finding-id { font-size: 0.75rem; font-family: monospace; color: var(--text-dim); }
    .finding-title { font-size: 1rem; font-weight: 600; }
    .badge { display: inline-block; padding: 0.15rem 0.6rem; border-radius: 6px; font-size: 0.75rem; font-weight: 600; }
    .badge-critical { background: rgba(255,71,87,0.15); color: var(--critical); }
    .badge-high { background: rgba(255,140,66,0.15); color: var(--high); }
    .badge-medium { background: rgba(255,212,59,0.15); color: var(--medium); }
    .badge-low { background: rgba(77,171,247,0.15); color: var(--low); }
    .badge-info { background: rgba(105,219,124,0.15); color: var(--info); }
    .badge-verified { background: rgba(105,219,124,0.15); color: var(--info); }
    .badge-unverified { background: rgba(139,143,163,0.15); color: var(--text-dim); }
    .badge-rejected { background: rgba(255,71,87,0.15); color: var(--critical); }
    .finding-meta { font-size: 0.85rem; color: var(--text-dim); margin: 0.5rem 0; }
    .finding-desc { margin: 0.75rem 0; font-size: 0.9rem; }
    .finding-section { margin: 0.5rem 0; }
    .finding-section strong { color: var(--text-dim); font-size: 0.8rem; text-transform: uppercase; }
    pre { background: var(--surface2); padding: 0.75rem; border-radius: 8px; overflow-x: auto; font-size: 0.8rem; margin: 0.5rem 0; }
    .hidden { display: none; }
    @media (max-width: 768px) { .container { padding: 1rem; } .summary-grid { grid-template-columns: repeat(2, 1fr); } }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔍 UI/UX Audit Report</h1>
    <p style="color:var(--text-dim)">${s.targetUrl} — ${new Date().toLocaleDateString()}</p>

    <div class="summary-grid">
      <div class="stat"><div class="stat-label">States explored</div><div class="stat-value">${s.statesExplored}</div></div>
      <div class="stat"><div class="stat-label">Unique states</div><div class="stat-value">${s.uniqueStates}</div></div>
      <div class="stat"><div class="stat-label">Total findings</div><div class="stat-value">${s.totalFindings}</div></div>
      <div class="stat severity-critical"><div class="stat-label">Critical</div><div class="stat-value">${s.findingsBySeverity.CRITICAL}</div></div>
      <div class="stat severity-high"><div class="stat-label">High</div><div class="stat-value">${s.findingsBySeverity.HIGH}</div></div>
      <div class="stat severity-medium"><div class="stat-label">Medium</div><div class="stat-value">${s.findingsBySeverity.MEDIUM}</div></div>
      <div class="stat severity-low"><div class="stat-label">Low</div><div class="stat-value">${s.findingsBySeverity.LOW}</div></div>
      <div class="stat"><div class="stat-label">Duration</div><div class="stat-value">${formatDuration(s.durationMs)}</div></div>
    </div>

    <h2>Findings</h2>
    <input type="text" class="search-box" id="searchBox" placeholder="Search findings..." oninput="filterFindings()">
    <div class="filters" id="filters">
      <button class="filter-btn active" onclick="setFilter('all', this)">All</button>
      <button class="filter-btn" onclick="setFilter('CRITICAL', this)">Critical</button>
      <button class="filter-btn" onclick="setFilter('HIGH', this)">High</button>
      <button class="filter-btn" onclick="setFilter('MEDIUM', this)">Medium</button>
      <button class="filter-btn" onclick="setFilter('LOW', this)">Low</button>
      <button class="filter-btn" onclick="setFilter('VERIFIED', this)">Verified</button>
    </div>
    <div id="findings"></div>
  </div>
  <script>
    const findings = ${findingsJson};
    let currentFilter = 'all';

    function renderFindings(list) {
      const container = document.getElementById('findings');
      container.innerHTML = list.map(f => \`
        <div class="finding" data-severity="\${f.severity}" data-status="\${f.verificationStatus}">
          <div class="finding-header">
            <div>
              <span class="finding-id">\${f.id}</span>
              <div class="finding-title">\${esc(f.title)}</div>
            </div>
            <div style="display:flex;gap:0.5rem">
              <span class="badge badge-\${f.severity.toLowerCase()}">\${f.severity}</span>
              <span class="badge badge-\${f.verificationStatus.toLowerCase()}">\${f.verificationStatus}</span>
            </div>
          </div>
          <div class="finding-meta">\${f.category} · Confidence: \${Math.round(f.confidence * 100)}% · \${f.source}</div>
          <div class="finding-desc">\${esc(f.description)}</div>
          \${f.impact ? \`<div class="finding-section"><strong>Impact</strong><p>\${esc(f.impact)}</p></div>\` : ''}
          \${f.recommendation ? \`<div class="finding-section"><strong>Recommendation</strong><p>\${esc(f.recommendation)}</p></div>\` : ''}
          \${f.selector ? \`<div class="finding-section"><strong>Selector</strong><pre>\${esc(f.selector)}</pre></div>\` : ''}
          \${f.url ? \`<div class="finding-section"><strong>URL</strong><pre>\${esc(f.url)}</pre></div>\` : ''}
          \${f.suspectedSourceFiles?.length ? \`<div class="finding-section"><strong>Probable Source</strong><pre>\${f.suspectedSourceFiles.map(s => \`\${s.file}\${s.line ? ':' + s.line : ''} (conf: \${Math.round(s.confidence * 100)}%)\`).join('\\n')}</pre></div>\` : ''}
        </div>
      \`).join('');
    }

    function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

    function setFilter(f, btn) {
      currentFilter = f;
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      if (btn) btn.classList.add('active');
      filterFindings();
    }

    function filterFindings() {
      const search = document.getElementById('searchBox').value.toLowerCase();
      let filtered = findings;
      if (currentFilter !== 'all') {
        if (currentFilter === 'VERIFIED') {
          filtered = filtered.filter(f => f.verificationStatus === 'VERIFIED');
        } else {
          filtered = filtered.filter(f => f.severity === currentFilter);
        }
      }
      if (search) {
        filtered = filtered.filter(f =>
          f.title.toLowerCase().includes(search) ||
          f.description.toLowerCase().includes(search) ||
          f.category.toLowerCase().includes(search) ||
          f.id.toLowerCase().includes(search)
        );
      }
      renderFindings(filtered);
    }

    renderFindings(findings);
  </script>
</body>
</html>`;

  writeFileSync(path, html, 'utf-8');
  return path;
}

// ── Helpers ───────────────────────────────────────────────────────────

function formatFinding(f: Finding): string {
  const lines: string[] = [];

  lines.push(`### ${f.id}`);
  lines.push(`**${f.title}**`);
  lines.push('');
  lines.push(`| | |`);
  lines.push(`|---|---|`);
  lines.push(`| Severity | ${severityIcon(f.severity)} ${f.severity} |`);
  lines.push(`| Confidence | ${Math.round(f.confidence * 100)}% |`);
  lines.push(`| Verification | ${f.verificationStatus} |`);
  lines.push(`| Category | ${f.category} |`);
  lines.push(`| Source | ${f.source} |`);
  if (f.url) lines.push(`| URL | \`${f.url}\` |`);
  if (f.viewport) lines.push(`| Viewport | ${f.viewport.width}×${f.viewport.height} |`);
  if (f.selector) lines.push(`| Selector | \`${f.selector}\` |`);
  lines.push('');

  lines.push(`**Problem:** ${f.description}`);
  lines.push('');
  lines.push(`**Impact:** ${f.impact}`);
  lines.push('');
  lines.push(`**Recommendation:** ${f.recommendation}`);

  if (f.reproductionSteps.length > 0) {
    lines.push('');
    lines.push('**Reproduction steps:**');
    for (const [i, step] of f.reproductionSteps.entries()) {
      lines.push(`${i + 1}. ${step.type}: ${step.label || step.selector}`);
    }
  }

  if (f.suspectedSourceFiles && f.suspectedSourceFiles.length > 0) {
    lines.push('');
    lines.push('**Probable source:**');
    for (const src of f.suspectedSourceFiles) {
      lines.push(`- \`${src.file}${src.line ? ':' + src.line : ''}\` (confidence: ${Math.round(src.confidence * 100)}%)`);
    }
  }

  lines.push('');
  lines.push('---');

  return lines.join('\n');
}

function severityIcon(severity: string): string {
  switch (severity) {
    case 'CRITICAL': return '🔴';
    case 'HIGH': return '🟠';
    case 'MEDIUM': return '🟡';
    case 'LOW': return '🔵';
    case 'INFO': return 'ℹ️';
    default: return '•';
  }
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  if (minutes === 0) return `${remaining}s`;
  return `${minutes}m ${remaining}s`;
}

function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}
