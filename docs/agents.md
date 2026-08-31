# Specialized Multi-Agent System

The auditor provides a specialized multi-agent team architecture designed for both **Native AI IDE workspaces** and **CommandCode / OpenAI-compatible CLI & CI pipelines**.

---

## 1. Agent Roles

```text
┌─────────────────────────────────────────────────────────────┐
│                    @uiux-auditor (Lead)                     │
│           Orchestrates exploration, rules & reports         │
└───────┬──────────────────────┬──────────────────────┬───────┘
        │                      │                      │
┌───────▼────────┐     ┌───────▼────────┐     ┌───────▼────────┐
│  ui-explorer   │     │ visual-reviewer│     │  ux-reviewer   │
│ Discovers      │     │ Visual noise,  │     │ Cognitive load,│
│ dynamic states │     │ hierarchy, CTA │     │ feedback & flow│
└────────────────┘     └────────────────┘     └────────────────┘
        │                      │                      │
┌───────▼────────┐     ┌───────▼────────┐     ┌───────▼────────┐
│ accessibility- │     │  responsive-   │     │ consistency-   │
│    reviewer    │     │    reviewer    │     │    reviewer    │
│ WCAG 2.1 AA    │     │ Multi-viewport │     │ Design system  │
│ tree & contrast│     │ & mobile touch │     │ token drift    │
└────────────────┘     └────────────────┘     └────────────────┘
        │                      │
┌───────▼────────┐     ┌───────▼────────┐
│ journey-tester │     │finding-verifier│
│ Flow friction  │     │ Reproduction   │
│ & task steps   │     │ validation     │
└────────────────┘     └────────────────┘
```

---

## 2. Agent Responsibilities

| Agent / Skill | Primary Responsibility | Input Context | Output |
|---|---|---|---|
| **`uiux-auditor`** | Master pipeline orchestration, environment validation, reporting | Target URL, config | Executive Summary & Audit Reports |
| **`ui-explorer`** | Safe graph traversal, interaction classification | Live Playwright Page | Discovered UIStates & Transitions |
| **`visual-reviewer`** | Visual hierarchy, contrast, density, alignment, CTA prominence | State screenshot + DOM snippet | UI Category Findings |
| **`ux-reviewer`** | Cognitive load, user feedback, error recovery, discoverability | State elements + interaction context | UX Category Findings |
| **`accessibility-reviewer`** | WCAG 2.1 AA criteria, screen reader usability, ARIA trees | axe results + semantic tree | Accessibility Findings |
| **`responsive-reviewer`** | Multi-breakpoint overflow, element clipping, touch target sizing | Multi-viewport captures | Responsive Findings |
| **`consistency-reviewer`** | Cross-screen style variance, button height drift, copy mismatch | Multi-state computed styles | Consistency Findings |
| **`journey-tester`** | Goal completion, flow friction, navigation blockers | Journey goals & start URLs | Workflow Findings & Metrics |
| **`finding-verifier`** | Automated defect reproduction & false-positive elimination | Reproduction steps & selector | `VERIFIED` / `REJECTED` status |

---

## 3. Prompts & Structured Outputs

All agent prompts are centralized under `src/agents/prompts/` and strictly require Zod-validated JSON responses. Loose conversational text is rejected by the parser to guarantee automated traceability.
