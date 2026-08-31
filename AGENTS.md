# 🤖 Freebuff Agent Instructions for UI/UX Auditor

This repository contains **UI/UX Auditor (`uiux-audit`)**, an autonomous engine that navigates web applications, audits UI/UX and WCAG accessibility, verifies defects via Playwright, and maps findings to source code.

## 🛠️ How Freebuff Must Interact With This Project

### 1. Running Audits via CLI
When the user asks you to audit an application:
```bash
# Run headless audit and generate reports
npx uiux-audit audit <target-url> --json --repo .

# Example against local dev server:
npx uiux-audit audit http://localhost:3000 --json --repo .
```

### 2. Reading Findings
The audit outputs structured findings to `./uiux-audit-results/report.json`:
- `summary`: Total findings, critical/high/medium/low counts, duration.
- `findings`: Array of verified findings with:
  - `id`, `category` (ACCESSIBILITY, RESPONSIVE, USABILITY, VISUAL, FORMS, NAVIGATION),
  - `severity` (CRITICAL, HIGH, MEDIUM, LOW),
  - `title`, `description`, `recommendation`,
  - `stateId`, `evidence` (selector, bounding box, screenshot path),
  - `suspectedSourceFiles` (exact source file path, line number, confidence).

### 3. Automatically Fixing Code
When asked to fix detected defects:
1. Read `uiux-audit-results/report.json`.
2. For each verified finding, open the file specified in `suspectedSourceFiles[0].file`.
3. Apply the accessibility or responsive fix based on `recommendation` and WCAG 2.1 AA rules (e.g. adding `aria-label`, fixing heading hierarchy `<h1>...<h3>`, improving color contrast, expanding click targets >= 44x44px).
4. Re-run `npx uiux-audit audit <target-url> --json` to verify the fix resolved the issue!

### 4. Interactive Tools
- Launch Live Terminal Inspector: `npx uiux-audit inspect`
- Launch Interactive Login Browser: `npx uiux-audit login <target-url>`
- Launch Interactive Chat REPL: `npx uiux-audit chat`
