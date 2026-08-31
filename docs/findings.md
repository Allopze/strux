# Finding Model, Verification & Evidence

Every detected defect across deterministic rules, responsive analysis, journeys, design system inference, and AI agents conforms to a unified schema.

---

## 1. Finding Schema

```typescript
type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

type FindingCategory =
  | "UI"
  | "UX"
  | "ACCESSIBILITY"
  | "RESPONSIVE"
  | "CONSISTENCY"
  | "NAVIGATION"
  | "WORKFLOW"
  | "SYSTEM";

type VerificationStatus =
  | "UNVERIFIED"
  | "VERIFIED"
  | "REJECTED"
  | "PARTIAL"
  | "UNABLE_TO_VERIFY";

interface Finding {
  id: string;
  title: string;
  severity: Severity;
  confidence: number;                 // 0.0 to 1.0 (evidence-backed)
  category: FindingCategory;
  description: string;
  impact: string;
  recommendation: string;
  stateId: string;
  url?: string;
  viewport?: { width: number; height: number };
  selector?: string;
  reproductionSteps: Action[];
  evidence: Evidence[];
  ruleId?: string;
  source: "rule" | "ai" | "journey" | "hybrid";
  verificationStatus: VerificationStatus;
  suspectedSourceFiles?: SourceLocation[];
}
```

---

## 2. Severity Classification

- **`CRITICAL`**: Blocks fundamental user workflows, breaks core functionality, causes severe data loss or critical accessibility barriers.
- **`HIGH`**: Significant friction or WCAG Level A/AA failure that heavily impacts a primary task.
- **`MEDIUM`**: Clear friction, minor accessibility violation, touch target discrepancy, or layout inconsistency.
- **`LOW`**: Minor visual inconsistency, design system drift, or non-blocking defect.
- **`INFO`**: Constructive UX recommendation or observation.

---

## 3. Independent Verification Engine

The **`FindingVerifier`** prevents hallucinations and false alarms. It operates autonomously by:
1. Re-opening a clean browser context.
2. Navigating to the finding's target URL and replaying the exact `reproductionSteps`.
3. Re-evaluating the physical DOM condition (bounding box calculations, accessibility violations, heading order, element visibility, dead links).
4. Updating `verificationStatus` to `VERIFIED` or `REJECTED`. Unverified or rejected findings are clearly marked and segregated in the final report.

---

## 4. Confidence & Consolidation

Findings targeting the same component or state are deduplicated. When a deterministic rule, an AI agent, and the verifier all corroborate a finding, the finding source becomes `hybrid` and its confidence score is boosted towards 1.0.
