# 🔍 Autonomous UI/UX Auditor

> An evidence-based, reproducible, autonomous UI/UX and accessibility auditor inspired by Strix. Combines Playwright browser automation, axe-core WCAG analysis, deterministic layout rules, multi-viewport verification, source code mapping, and optional AI reasoning.

---

## 🚀 Key Highlights

- **UI State ≠ URL**: Intelligently discovers and deduplicates dynamic states (modals, drawers, filter states, empty states, validation errors) using structural DOM fingerprints.
- **Safety First**: Classifies interaction risks (`SAFE`, `LIKELY_SAFE`, `MUTATING`, `DESTRUCTIVE`) to prevent executing destructive actions (delete, payment, sign out).
- **Two Interaction Modes**:
  1. **Native AI Squad (IDE / Agentic)**: Interacts directly via `@uiux-auditor` in your AI-enabled IDE with zero configuration.
  2. **CLI / CI Pipeline**: Executes autonomously via CLI with optional OpenAI-compatible LLM provider and quality gate flags.
- **Deterministic-First**: Catches real bugs via axe-core, computed styles, overflow detection, touch target sizing, and console tracking without wasting LLM tokens.
- **Autonomous Verifier**: Replays reproduction sequences to verify or reject suspected defects, eliminating false positives.
- **Multi-Format Reporting**: Produces executive Markdown summaries, structured JSON, and self-contained interactive HTML dashboards.
- **Codebase Mapping**: Correlates runtime findings to component source code files with confidence ratings.

---

## 📦 Architecture

```text
                     UI/UX AUDITOR
                           │
               ┌───────────┴───────────┐
               │                       │
        NATIVE AI SQUAD           CLI / CI RUNNER
               │                       │
        @uiux-auditor             LLMProvider
      (.agents / skills)               │
               │                  CommandCode / OpenAI
               └───────────┬───────────┘
                           │
                     ORCHESTRATOR
                           │
          ┌────────────────┼─────────────────┐
          │                │                 │
       Explorer         Analysis          Verifier
          │                │                 │
      Playwright       Rules + AI        Playwright
      DOM / ARIA      (axe/CSS/UX)       Step Replay
          │                │                 │
          └────────────────┼─────────────────┘
                           │
                      Code Mapper
                           │
                       Reporter
                 (Markdown, JSON, HTML)
```

---

## ⚡ Quick Install (Linux / macOS)

### Option A: One-Liner Installer (Recommended)
```bash
curl -fsSL https://raw.githubusercontent.com/allopze/strux/main/install.sh | bash
```
> Installs the `uiux-audit` command into `~/.local/bin/` and sets up Playwright automatically.

### Option B: Debian / Ubuntu Package (`.deb`)
Download the latest `.deb` from [Releases](https://github.com/allopze/strux/releases):
```bash
sudo dpkg -i uiux-audit_0.1.0_amd64.deb
```

### Option C: From Source / NPM
```bash
git clone https://github.com/allopze/strux.git
cd strux
npm install
npm run build
npm link
```

---

## ⚡ CLI Usage

```bash
# 1. Start interactive agent chat REPL
npx uiux-audit chat http://localhost:3000

# 2. Interactive visual login (OAuth, 2FA, JWT, credentials)
npx uiux-audit login http://localhost:3000

# 3. Run audit with interactive login prompt
npx uiux-audit audit http://localhost:3000 --login

# 4. Run audit with Live Terminal Dashboard
npx uiux-audit audit http://localhost:3000

# 5. Interactively browse findings in terminal (keyboard navigation)
npx uiux-audit inspect

# 6. Initialize configuration and native AI squad
npx uiux-audit init http://localhost:3000

# 7. Check environment requirements
npx uiux-audit doctor

# 8. Run audit with source code repository mapping
npx uiux-audit audit http://localhost:3000 --repo .

# 9. Run audit with HTML report generation
npx uiux-audit audit http://localhost:3000 --html

# 10. Run audit with AI reasoning (OpenAI/CommandCode compatible)
COMMANDCODE_API_KEY="your-key" \
COMMANDCODE_BASE_URL="https://api.example.com/v1" \
COMMANDCODE_MODEL="model-name" \
npx uiux-audit audit http://localhost:3000 --provider commandcode

# 11. Run with saved Playwright storage state authentication
npx uiux-audit audit http://localhost:3000 --storage-state ./auth/storageState.json

# 12. CI/CD quality gate: fail if CRITICAL or HIGH findings exist
npx uiux-audit audit http://localhost:3000 --fail-on high --max-findings 10

# 13. Create or update defect baseline
npx uiux-audit audit http://localhost:3000 --update-baseline

# 14. Audit against baseline (suppress known findings, alert on regressions)
npx uiux-audit audit http://localhost:3000 --baseline .uiux-audit-baseline.json
```

---

## 🤖 Mode A: Native AI Squad (Zero-Config)

Interact with the lead auditor agent directly in your AI coding environment:

```text
@uiux-auditor

Audita completamente la aplicación disponible en http://localhost:3000.
Usa uiux-audit.config.yaml.
Explora todos los estados seguros posibles.
Ejecuta las reglas deterministas.
Analiza UI, UX, accesibilidad, responsive y consistencia.
Verifica todos los hallazgos HIGH y CRITICAL.
Genera el reporte.
```

The orchestrator autonomously delegates and coordinates specialized sub-agent skills located in `.agents/skills/`:
- `@ui-explorer`: Dynamic state discovery
- `@visual-reviewer`: Visual hierarchy & contrast analysis
- `@ux-reviewer`: Cognitive load & feedback evaluation
- `@accessibility-reviewer`: WCAG 2.1 AA audits
- `@responsive-reviewer`: Breakpoint & mobile touch analysis
- `@consistency-reviewer`: Cross-screen design system consistency
- `@journey-tester`: End-to-end task flow testing
- `@finding-verifier`: False-positive elimination

---

## 🧠 Mode B: Automated CLI / Provider Mode

Configure via environment variables:

```env
COMMANDCODE_API_KEY=your-api-key
COMMANDCODE_BASE_URL=https://api.commandcode.com/v1
COMMANDCODE_MODEL=commandcode-large
```

The system implements the `LLMProvider` interface with automatic retries, exponential backoff, rate limiting, and structured JSON output validation using Zod.

---

## ⚙️ Configuration (`uiux-audit.config.yaml`)

```yaml
target:
  url: http://localhost:3000

repo:
  path: .

# auth:
#   storageState: ./auth/storageState.json

exploration:
  maxStates: 500
  maxDepth: 10
  maxActionsPerState: 25
  maxRuntimeMinutes: 30

viewports:
  desktop:
    width: 1440
    height: 900
  tablet:
    width: 768
    height: 1024
  mobile:
    width: 390
    height: 844

audit:
  ui: true
  ux: true
  accessibility: true
  responsive: true
  consistency: true
  console: true

verification:
  enabled: true
  maxRetries: 2

ai:
  enabled: false
  provider: commandcode
  maxRequests: 100
  maxRequestsPerState: 3

reports:
  markdown: true
  json: true
  html: true
  outputDir: ./uiux-audit-results

journeys:
  - name: Crear vehículo
    goal: Crear correctamente un nuevo vehículo desde el formulario
    start: /vehiculos
```

---

## 🧪 Testing & Validation

A fixture application with intentional defects is provided under `examples/test-app`:

```bash
# Run unit tests (fingerprint, classifier, dedup, findings, sanitizer)
npm test

# Run end-to-end audit integration test against the fixture app
npm run test:audit
```

---

## 📄 Artifacts & Reports

Audit results are generated in the output directory:

```text
uiux-audit-results/
├── report.md          # Comprehensive executive summary & categorized findings
├── report.json        # Machine-readable structured dataset
├── report.html        # Interactive filtering & inspection dashboard
├── screenshots/       # High-res state evidence captures
└── states/            # Discovered state metadata
```
