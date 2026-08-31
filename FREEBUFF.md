# 🤖 Freebuff Integration Guide for UI/UX Auditor

Freebuff can autonomously run audits, analyze UI/UX reports, and fix frontend code in this repository.

## Commands for Freebuff:
- **Audit web app**: `npx uiux-audit audit <url> --json --repo .`
- **Inspect findings**: Read `./uiux-audit-results/report.json`
- **Fix code**: Use `findings[].suspectedSourceFiles` and `findings[].recommendation` to locate and patch defects in the codebase.
- **Re-test**: Run `npx uiux-audit audit <url> --json` to ensure 0 remaining defects.
