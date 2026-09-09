# Handyman Estimator — Architecture

## Context

Rivet is a React/TypeScript application for service businesses. The handyman estimation pipeline is the first vertical — the decision engine, persistence layer, and EconomicJob shape are universal and will serve future verticals.

---

## Core Design Principle

> **Rivet should not need to know every possible handyman job. It should know a manageable set of reusable work components and a smaller set of validated common assemblies.**

---

## 4-Tier Ownership Model

| Tier | Owns | Question it answers |
|------|------|-------------------|
| **AI Prompt** | Trade context + assembly detection + task decomposition + conditions | "What work needs to happen?" |
| **Deterministic Code** (assemblies + components + modifiers) | Validated ranges for known jobs; reusable labor/material baselines for components | "What does that work usually take?" |
| **Business Calibration** | Per-business multipliers learned from completed-job actuals | "What does it take for THIS business?" |
| **Business Economics** (`BusinessEconomicsConfig`) | Owner's rates, margins, thresholds | "What is this business's time and margin worth?" |

These four tiers are strictly separated. The AI never returns hours/costs. Deterministic code never uses business-specific data. Calibration never overwrites global baselines. Economics never changes trade classifications.

---

## Estimation Hierarchy

```
Customer request (description + photos)
      ↓
AI extracts:
  trade contexts
  known assembly candidate (if applicable)
  reusable task components with quantities
  conditions
  unknowns
      ↓
Deterministic estimator
      ↓
Known assembly?
  ├── YES (high confidence) → use assembly baseline
  │                           apply condition modifiers
  │
  └── NO → estimate task components
            project-level setup / cleanup / procurement
            apply condition modifiers
            apply uncertainty widening
      ↓
Business calibration
      ↓
Business economics
      ↓
EconomicJob
      ↓
Universal decision engine
      ↓
Take / Review / Pass
      +
immutable estimation run (persisted, dev-only until RLS)
human edits (persisted, append-only)
actual outcomes (persisted)
```

---

## File Structure

```
src/
  estimator/
    types.ts          — All types (ExtractionResult, EconomicJob, TaskComponentCode, etc.)
    components.ts     — ~25 reusable task components with labor/material baselines
    assemblies.ts     — 15 validated assemblies (common known jobs)
    modifiers.ts      — 12 condition modifiers (confined_access, water_damage, etc.)
    baselines.ts      — Legacy baselines (kept for reference)
    extract.ts        — AI extraction client + keyword stub for tests
    estimator.ts      — Dual-path estimator (assembly OR component) + calibration → EconomicJob
    decision.ts       — Universal decision engine (with DecisionContext)
    persistence.ts    — Supabase persistence (dev-only until RLS)
    index.ts          — Barrel export
  estimator/__tests__/
    estimator.test.ts — Assemblies, components, modifiers, calibration, EconomicJob, tier separation (41 tests)
    decision.test.ts  — Thresholds, review triggers, DecisionContext (14 tests)
    pipeline.test.ts  — E2E both paths, shared overhead, adjustment logging, junk regression (13 tests)
  lib/
    supabase.ts       — Supabase client singleton
  admin/
    types.ts          — WorkItem UI type + account data (imports from demo/seed)
    DecisionLab.tsx   — Internal evaluation page (access-gated, reads Supabase)
    WorkDetailDrawer.tsx — Job detail panel with price editing + adjustment logging
    screens.tsx       — UI screens (Mason Home Services branding)
    RivetApp.tsx      — Admin app entry with Supabase auth
    RivetDashboard.tsx — Main dashboard shell with sidebar
  demo/
    seed.ts           — Seed data generator (runs real pipeline, exports workItems/runs/adjustments/outcomes)
    customers.ts      — 13 residential + 2 commercial customers (Nashville TN)
    seedSupabase.ts   — Script to push estimation runs/adjustments/outcomes to Supabase
netlify/
  functions/
    extract.ts        — Server-side Claude API call (ANTHROPIC_API_KEY never in browser)
supabase/
  schema.sql          — All table DDL (dev-only, no RLS)
```

---

## Assemblies: `src/estimator/assemblies.ts`

Validated assemblies represent common, known handyman jobs. Each carries a direct labor/material range. They are the reframed versions of the original 5 job family classifications.

15 assemblies across 5 trade contexts:

| Trade Context | Assemblies |
|--------------|------------|
| **exterior_door_replacement** | STANDARD_EXTERIOR_DOOR, OVERSIZED_EXTERIOR_DOOR, FRENCH_DOOR_REPLACEMENT |
| **drywall_repair** | SMALL_DRYWALL_PATCH, MEDIUM_DRYWALL_PATCH, DRYWALL_SECTION_REPLACEMENT |
| **deck_repair** | DECK_BOARD_REPLACEMENT, DECK_STRUCTURAL_REPAIR, DECK_SECTION_REBUILD |
| **fence_repair** | FENCE_POST_RESET, FENCE_PANEL_REPLACEMENT, FENCE_SECTION_REBUILD |
| **tv_wall_mounting** | STANDARD_TV_MOUNT, TV_MOUNT_ABOVE_FIREPLACE, TV_MOUNT_CONCEALED_WIRING |

Assemblies may include a conceptual `components` list but use their own validated aggregate range directly. All marked `needs_domain_validation`.

Assembly path is used when `assemblyConfidence >= 0.75`.

---

## Task Components: `src/estimator/components.ts`

~25 reusable handyman work actions. Each defines transparent deterministic baseline data:

```ts
{
  code: "install_board_or_trim",
  labor: { baseHours: 0.25, hoursPerUnit: 0.20, minimumHours: 0.50 },
  materials: { allowancePerUnit: 5 },
  validationStatus: "needs_domain_validation"
}
```

Component categories:

| Category | Components |
|----------|-----------|
| **Setup/Teardown** | site_setup, protect_work_area, cleanup |
| **Demolition** | remove_existing_material, demolition_light |
| **Measurement** | measure_and_layout |
| **Carpentry** | cut_and_fit_material, install_board_or_trim, install_structural_lumber, install_decking, minor_framing, build_stairs, set_post, repair_railing |
| **Drywall/Finishing** | install_sheet_material, patch_surface, tape_and_mud, sand_and_finish, paint_or_touchup |
| **Fastening/Sealing** | fasten_or_anchor, seal_or_caulk |
| **Fixtures** | install_fixture, replace_fixture, mount_object |
| **Assembly** | assemble_item |

For the component path, hours are computed as: `max(minimumHours, baseHours + hoursPerUnit × quantity)`, then scaled by complexity (low: 0.85×, standard: 1.0×, high: 1.3×).

---

## Condition Modifiers: `src/estimator/modifiers.ts`

12 deterministic modifiers applied to both assembly and component estimates:

| Condition | Effect |
|-----------|--------|
| `confined_access` | +15% labor, +25% high-end |
| `overhead_work` | +15% labor |
| `second_floor_access` | +10% labor, risk flag |
| `steep_terrain` | +10% labor |
| `occupied_workspace` | +10% labor |
| `finish_matching` | +15% labor, +10% material |
| `customer_supplied_material` | 70% material reduction, compatibility risk |
| `unknown_substrate` | +20% high-end, -10% confidence |
| `near_electrical` | -5% confidence, risk flag |
| `water_damage` | +40% high-end, +15% material, -10% confidence, risk flag |
| `special_order_material` | +20% material |
| `multiple_visits_required` | +10% labor, return trip risk |

---

## Shared Project Overhead

Multiple task components do NOT each pay separate setup/cleanup. The estimator applies project-level shared overhead:

```
projectSetupHours = 0.25
projectCleanupHours = 0.20
procurementHours = 0.50
```

Task components estimate **incremental work** only. Site_setup and cleanup tasks from AI extraction are absorbed by project overhead.

---

## AI Extraction: `src/estimator/extract.ts` + `netlify/functions/extract.ts`

### What AI Returns

```json
{
  "tradeContexts": ["finish_carpentry"],
  "assemblyCandidate": null,
  "assemblyConfidence": 0,
  "tasks": [
    { "component": "remove_existing_material", "quantity": 1, "complexity": "standard", "confidence": 0.85, "source": "observed" },
    { "component": "install_board_or_trim", "quantity": 1, "complexity": "standard", "confidence": 0.90, "source": "inferred" },
    { "component": "repair_railing", "quantity": 2, "complexity": "standard", "confidence": 0.80, "source": "observed" }
  ],
  "conditions": ["finish_matching"],
  "unknowns": ["exact_trim_profile", "paint_match"],
  "materialSupplyStatus": "contractor_supplied",
  "overallConfidence": 0.75
}
```

The AI must NOT return: labor hours, material costs, prices, profit, or Take/Review/Pass.

### 3-Phase Prompt

1. **Visual Extraction** — observe materials, dimensions, conditions
2. **Scope Identification** — detect known assembly OR decompose into task components + conditions
3. **Structured Output** — JSON with tradeContexts, assemblyCandidate, tasks, conditions, unknowns

### Test/Dev Stub

`extractJobFactsStub()` uses keyword matching to produce the same `ExtractionResult` shape. Used in tests and when API is unavailable.

---

## Estimator: `src/estimator/estimator.ts`

### `estimateHandymanJob(extraction: ExtractionResult): EstimatorOutput`

Dual-path:

**Assembly path** (when `assemblyCandidate` is known + confidence >= 0.75):
1. Look up assembly's validated labor/material range
2. Apply condition modifiers
3. Apply material supply adjustments
4. Reduce confidence per unknown

**Component path** (for unusual/custom jobs):
1. Add project-level shared overhead (setup + cleanup)
2. For each task: compute `max(minimumHours, baseHours + hoursPerUnit × qty) × complexityFactor`
3. Sum all component labor/material ranges
4. Flag unknown components (`unsupported_task_component`)
5. Check component coverage (< 50% recognized → `poor_component_coverage`)
6. Widen ranges slightly (component-composed jobs have more uncertainty)
7. Apply condition modifiers
8. Apply material supply adjustments
9. Reduce confidence per unknown

### `applyCalibration(estimate, config, calibration, travelDistanceMiles): EconomicJob`

Same as before — calibration bounded 0.7–1.5, min 3 samples. Owner labor is opportunity cost, NOT in `totalDirectCost`.

---

## Decision Engine: `src/estimator/decision.ts`

Universal — works for any vertical. Same thresholds as before.

New risk flag handling:
- `no_tasks_extracted` → forced Review (never auto-Pass)
- `poor_component_coverage` → forced Review
- `unsupported_task_component` → noted in reasons (confidence drop handles severity)
- `hidden_water_damage`, `structural_*`, `unknown_substrate` → forced Review

---

## Confidence / Review Behavior

| Scenario | Confidence | Range Width |
|----------|-----------|-------------|
| Known assembly + strong observations | Higher (~0.85) | Narrower |
| Custom component-composed job | Moderate (~0.65-0.75) | Somewhat wider |
| Poor component coverage / unknown work | Low (~0.20) | Wide, forced Review |

---

## Calibration

Business calibration is separate from global component/assembly baselines.

Currently supports family-level calibration. Architecture supports future component-level calibration:

```
install_trim:
  Mike multiplier = 0.85

drywall_finish:
  Mike multiplier = 1.20
```

Component-level calibration is not implemented for MVP.

---

## Persistence: `src/estimator/persistence.ts`

**DEV-ONLY until RLS is implemented.** CRUD for estimation runs (immutable), adjustment entries (append-only), actual outcomes.

Batch query functions for Decision Lab:
- `getRunsForBusiness(businessId)` — all estimation runs for a business
- `getAllOutcomes(runIds)` — Map of runId → ActualOutcome
- `getAllAdjustments(runIds)` — Map of runId → AdjustmentEntry[]

---

## Decision Lab: `src/admin/DecisionLab.tsx`

Internal-only evaluation page under Settings. Access-gated via `localStorage.rivet_lab === '1'` or `?lab=1` URL param.

**Table view**: Date, Customer, Trade, Recommendation, System/Human/Actual labor & materials, System price, Revenue, Confidence, Estimator version.

**Detail view** (click a row): Full pipeline walkthrough — Input, AI Extraction, Estimator breakdown, Calibration, Economics, Decision (reasons + context), Human Adjustments timeline, Actual Outcome with error calculations.

**Filters**: Customer, trade context, recommendation (Take/Review/Pass), completed vs pending, human-adjusted yes/no, confidence level.

**Export**: JSON and CSV formats, structured for handing to Claude/ChatGPT/domain experts to diagnose systematic errors.

**Summary metrics** (completed jobs only): Median labor/material error, human-adjusted ratio, Rivet-closer-than-human ratio, error breakdown by trade context.

---

## Demo Account: Mason Home Services

Seeded account that functions identically to a real customer account. No special code paths — app code never changes between demo and real.

- `src/demo/seed.ts` generates 22 work items (10 pending + 12 completed) through the real estimator pipeline
- `src/demo/customers.ts` provides 13 residential + 2 commercial customers in Nashville TN
- `src/demo/seedSupabase.ts` pushes estimation runs, adjustments, and outcomes to Supabase
- Static data imported in `src/admin/types.ts`; pipeline data persisted via Supabase

Business config: ownerOpportunityRate $75, helperRate $30, mileage $0.70, materialMarkup 20%, minimumJobPrice $175, minimumHourlyRate $70, profitFloor $75, marginFloor 35%, confidenceThreshold 0.70, weeklyGoal $2500, weeklyCapacity 35h.

---

## UI Integration: `src/admin/WorkDetailDrawer.tsx`

Price changes > 5% require a reason code. Small changes auto-log as `OWNER_EXPERIENCE`.

---

## Tests (68 total)

### `src/estimator/__tests__/estimator.test.ts` (41 tests)

- Assembly invariants (15+ assemblies, valid ranges, trade contexts, validation status)
- Component invariants (20+ components, valid baselines, carpentry components present)
- Condition modifier invariants
- Assembly path: known assembly → correct range, low confidence → fallback, unknown assembly → fallback
- Component path: sum components, shared overhead, quantity scaling, complexity, unknown components, no tasks fallback, poor coverage, inferred widening
- Conditions applied: water damage, customer supplied, unknown material, unknowns reduce confidence
- Calibration: multiplier with samples, skip when < 3, bounded, no overwrite
- EconomicJob: totalDirectCost, contributionProfit, ownerAdjustedProfit, minimum price, valid ranges
- Tier separation: AI no hours/prices, calibration no overwrite, economics no trade change

### `src/estimator/__tests__/decision.test.ts` (14 tests)

Same as before — static thresholds, review triggers, DecisionContext, reasons.

### `src/estimator/__tests__/pipeline.test.ts` (13 tests)

- Assembly path E2E: small drywall patch, exterior door with water damage, TV mount, calibration scaling
- Component path E2E: weird custom job (dog-chewed balusters), mixed carpentry+plumbing, fence with posts, unknown job
- Shared overhead: multiple components don't multiply setup/cleanup
- Adjustment logging: systemValue preserved, timestamps
- Service type regression: all Handyman, no Junk Removal

---

## Known Limitations

- All baselines/components marked `needs_domain_validation`
- Calibration learning is manual for MVP (no auto-recompute from outcomes)
- Only 15 assemblies; unrecognized jobs use component path
- Component-level calibration not implemented yet
- Supabase persistence is dev-only — no RLS, no tenant isolation
- Helper labor cost is 0 for MVP (owner-only assumption)
- DecisionContext defaults to zero when unavailable
- Netlify Function required for AI extraction (`netlify dev` for local)
