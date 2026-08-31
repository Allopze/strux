# UI State Model & Deduplication

In modern Single Page Applications (SPAs) and dynamic web apps, **URL ≠ Screen**. A single route `/vehicles` may display vastly different UI states:

- `VehicleList/default` (active table)
- `VehicleList/search-results` (filtered grid)
- `VehicleList/empty-state` (zero items)
- `VehicleList/delete-modal-open` (confirmation dialog overlay)
- `VehicleList/validation-error` (inline form error)

The auditor models the application as a directed graph of **UI States** connected by **Interactions**.

---

## 1. UIState Interface

```typescript
interface UIState {
  id: string;                      // Stable unique identifier (nanoid)
  fingerprint: string;             // Structural SHA-256 hash
  url: string;                     // Full browser URL at capture time
  normalizedUrl: string;           // Route without pagination / volatile params
  title: string;                   // Document title
  screenshotPath?: string;         // High-res state capture
  domSnippet?: string;             // Sanitized hierarchical DOM structure
  interactiveElements: InteractiveElement[];
  headings: Array<{ level: number; text: string }>;
  landmarks: Array<{ role: string; label?: string }>;
  viewport: { width: number; height: number };
  actionsToReach: Action[];        // Step-by-step reproduction trajectory
  parentStateId?: string;
  depth: number;
  timestamp: number;
  consoleEntries: ConsoleEntry[];
  networkFailures: NetworkFailure[];
  metadata: Record<string, unknown>;
}
```

---

## 2. Structural Fingerprinting

A fingerprint captures the **structural and semantic composition** of a state rather than volatile data contents. This prevents 300 pages of a paginated table from consuming hundreds of redundant analysis passes.

Components of the hash:

1. **Normalized Route**: Pathname + stable query params + SPA hash route (strips `page`, `offset`, `sort`, `t`, timestamps, etc.).
2. **Interactive Element Signature**: Set of visible `tag:role:type` controls sorted alphabetically.
3. **Heading Hierarchy**: Sequence of visible heading levels (e.g. `h1,h2,h3`).
4. **Landmark Regions**: Sorted list of visible ARIA landmarks (e.g. `banner,main,navigation`).

```typescript
const fingerprint = sha256([
  `url:${normalizedUrl}`,
  `elements:${elementSignature}`,
  `headings:${headingStructure}`,
  `landmarks:${landmarkStructure}`
].join('||')).slice(0, 16);
```

---

## 3. State Deduplication Strategy

When two states produce identical fingerprints:
1. They are grouped into the same cluster.
2. The representative state with the **shallowest reproduction trajectory** (fewest actions from root) is preserved.
3. All redundant duplicate states are logged and excluded from heavy deterministic and AI analysis.
