# Architecture Overview — UI/UX Auditor

The **UI/UX Auditor** is architecturally inspired by Strix, designed around a rigorous, evidence-based, reproducible pipeline. It does not treat an LLM as a chatbot reacting to raw screenshots; instead, it decouples deterministic browser mechanics, DOM/accessibility trees, interaction analysis, and verification from optional high-level AI judgment.

---

## 1. Conceptual Architecture

```text
                                  UI/UX AUDITOR
                                        │
                    ┌───────────────────┴───────────────────┐
                    │                                       │
             NATIVE AI SQUAD                           CLI / CI RUNNER
                    │                                       │
             @uiux-auditor                             LLMProvider
             (.agents / skills)                             │
                    │                                  CommandCode / OpenAI
                    │                                       │
                    └───────────────────┬───────────────────┘
                                        │
                                   ORCHESTRATOR
                                        │
     ┌──────────────────────────────────┼──────────────────────────────────┐
     │                                  │                                  │
  EXPLORER                           ANALYSIS                           VERIFIER
     │                                  │                                  │
 Playwright                     Deterministic Rules                    Playwright
 DOM / ARIA Tree                + Optional AI Review                   Step Replay &
 Interactive Elements           (axe, CSS, Layout, UX)                 DOM Evaluation
     │                                  │                                  │
     └──────────────────────────────────┼──────────────────────────────────┘
                                        │
                                   CODE MAPPER
                                        │
                                    REPORTER
                           (Markdown, JSON, HTML)
```

---

## 2. Structural Layering

The codebase enforces strict modular separation across domains:

```text
.agents/                  # Native multi-agent squad & specialized skills
├── uiux-auditor/         # Master orchestrator agent definition
└── skills/               # 8 specialized review skills

src/
├── core/
│   ├── browser/          # Playwright lifecycle, worker pool, state navigation
│   ├── config/           # Zod schema validation & YAML config loader
│   ├── crawler/          # Autonomous BFS explorer with risk policies
│   ├── states/           # UIState model, structural fingerprinting, deduplication
│   ├── interactions/     # Atomic interactive element discovery & risk classification
│   ├── evidence/         # Evidence collector (screenshots, DOM, traces, logs)
│   ├── rules/            # Deterministic rule engine (axe-core, touch, overflow, forms, console, nav)
│   ├── responsive/       # Multi-viewport responsive layout runner
│   ├── journeys/         # User journey workflow & flow-friction executor
│   ├── design-system/    # Computed style inference & outlier detection
│   ├── verifier/         # Independent reproduction & verification engine
│   ├── code-mapper/      # Safe native cross-platform source code mapping
│   ├── sanitizer/        # Privacy redaction for passwords, tokens, API keys, PII
│   ├── reporter/         # Markdown, JSON, and self-contained interactive HTML reporters
│   └── logger.ts         # Structured progress logging
│
├── agents/               # AI reasoning agents
│   ├── orchestrator.ts   # 9-phase audit coordinator
│   ├── reviewers.ts      # Visual and UX AI reviewers
│   └── prompts/          # Centralized, evidence-based system prompts
│
├── providers/            # LLM provider abstraction
│   ├── types.ts          # LLMProvider interface & capabilities
│   ├── commandcode.ts    # Direct fetch-based CommandCode / OpenAI-compatible provider
│   └── budget.ts         # Token/request budget tracker & state interest scoring
│
└── cli/                  # CLI commands (audit, init, doctor)
    └── index.ts
```

---

## 3. End-to-End Audit Pipeline

1. **Validation & Initialization**: Validate target URL, load `uiux-audit.config.yaml` or CLI arguments, launch headless Chromium.
2. **Autonomous Exploration**: Discover visible interactive elements, classify interaction risk (`SAFE` to `DESTRUCTIVE`), execute safe transitions, capture screenshots, DOM snippets, headings, and landmarks to construct a `StateGraph`.
3. **Fingerprinting & Deduplication**: Compute structural hashes (tag/role signatures, headings, landmarks, normalized routes) to collapse redundant views (e.g. pagination variants) into representative unique `UIState`s.
4. **Deterministic Analysis**:
   - `axe-core`: Full WCAG 2.1 AA automated compliance scan.
   - `Rules Engine`: Heading hierarchy, missing landmarks, touch target sizing (min 44×44px), viewport overflow, missing form labels, dead links, console errors, network failures.
5. **Multi-Viewport & Responsive Scan**: Re-evaluate unique states across desktop, tablet, and mobile viewports.
6. **Journey Testing**: Execute goal-directed user journeys and measure friction, step count, and blockers.
7. **Design System Inference**: Extract computed styles across all states to detect inconsistent button heights, radii, and styles.
8. **Selective AI Reasoning (Optional)**: If enabled, prioritize states by an `interestScore` and invoke `visual-reviewer` and `ux-reviewer` with structured context and screenshots within a strict request budget.
9. **Finding Consolidation & Deduplication**: Merge overlapping findings by state, selector, and category, boosting confidence score when multiple independent sources corroborate.
10. **Autonomous Verification**: Replay reproduction sequences in a clean browser context to confirm or reject findings (`VERIFIED`, `REJECTED`, `PARTIAL`, `UNABLE_TO_VERIFY`).
11. **Code Mapping**: When `--repo <path>` is provided, search the codebase for relevant component files and assign location confidence.
12. **Reporting**: Produce `report.md`, `report.json`, and an interactive dark-theme `report.html`.
