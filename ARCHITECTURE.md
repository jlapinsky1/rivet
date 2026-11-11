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
Send $ask / Look first / Pass  (internal: take | take_at_price | review | pass)
      ↓
┌─────────────────────────────────────────┐
│         Feedback Loop (4-part)          │
│                                         │
│  1. estimation_runs   (immutable)       │
│  2. adjustment_entries (append-only)    │
│  3. owner_decisions   (with snapshot)   │
│  4. actual_outcomes   (with quotedPrice)│
└─────────────────────────────────────────┘
      ↓
buildFeedbackRecord → "Who was right?"
      ↓
Future: calibration tuning from actuals
```

---

## File Structure

```
src/
  estimator/
    types.ts          — All types (ExtractionResult, EconomicJob, OwnerDecision, FeedbackRecord, DecisionSnapshot, etc.)
    components.ts     — ~25 reusable task components with labor/material baselines
    assemblies.ts     — 15 validated assemblies (common known jobs)
    modifiers.ts      — 12 condition modifiers (confined_access, water_damage, etc.)
    baselines.ts      — Legacy baselines (kept for reference)
    extract.ts        — AI extraction client + keyword stub for tests
    estimator.ts      — Dual-path estimator (assembly OR component) + calibration → EconomicJob
    decision.ts       — Universal decision engine (Send / Look first / Pass)
    weekContext.ts    — This-week earned $, hours left, needed $/schedule hour
    truckCopy.ts      — Truck labels: Send $X, Look first: {thing}, Pass
    simulate.ts       — Monday / midweek / Friday replay (npm run sim)
    applyLiveRecommendations.ts — Recompute pending recs from live week clock
    decisionFeedback.ts — When a rec miss needs a reason
    tuningReport.ts   — Weekly miss rollup (`npm run tune-report`)
    diagnostics.ts    — Decision Lab analysis helpers (summarizeDecisionLab)
    persistence.ts    — Supabase persistence: estimation runs, adjustments, outcomes, owner decisions, feedback record builder
    index.ts          — Barrel export
  estimator/__tests__/
    estimator.test.ts — Assemblies, components, modifiers, calibration, EconomicJob, capacity-hour economics, multi-floor pricing, dedup, normalization (52 tests)
    decision.test.ts  — Thresholds, review triggers, DecisionContext, labor-vs-capacity distinction, graduated pricing gaps (25 tests)
    pipeline.test.ts  — E2E both paths, shared overhead, adjustment logging, junk regression (15 tests)
  lib/
    supabase.ts       — Supabase client singleton
  admin/
    types.ts          — WorkItem UI type + account data (imports from demo/seed)
    useGoalData.ts    — Hook: weekly earnings, capacity, pace from work items context
    DecisionLab.tsx   — Internal evaluation page (access-gated, reads Supabase)
    WorkDetailDrawer.tsx — Job detail panel with price editing, adjustment logging, owner decision recording
    screens.tsx       — UI screens (Mason Home Services branding)
    RivetApp.tsx      — Admin app entry with Supabase auth
    RivetDashboard.tsx — Main dashboard shell with sidebar
  demo/
    seed.ts           — Seed data generator (runs real pipeline, exports workItems/runs/adjustments/outcomes/ownerDecisions)
    customers.ts      — 13 residential + 2 commercial customers (Nashville TN)
    seedSupabase.ts   — Script to push estimation runs/adjustments/outcomes to Supabase
  pages/
    HostedQuoteForm.jsx — Route wrapper for /request/:slug
    VerticalQuoteForm.jsx — Quote request form (embed-aware via ?embed=1, posts rivet-resize/rivet-submitted)
public/
  embed.js            — Drop-in embeddable quote form script (inline + popup modes)
netlify/
  functions/
    extract.ts        — Server-side Claude API call (ANTHROPIC_API_KEY never in browser)
supabase/
  schema.sql          — All table DDL (dev-only, no RLS)
  migrations/
    022_feedback_loop.sql — owner_decisions table + quoted_price on actual_outcomes
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

### `applyCalibration(estimate, config, calibration, travelDistanceMiles, context?): EconomicJob`

Calibration bounded 0.7–1.5, min 3 samples. Owner labor is opportunity cost, NOT in `totalDirectCost`.

**Capacity Hours** (v0.3.0):
```
capacityHours = laborHours.expected + travelHours + procurementHours + returnTripHours
```
- `travelHours` = roundtrip at 30 mph
- `returnTripHours` = modeled from condition `returnTripRisk` (high = full roundtrip, medium = one-way)
- Does NOT include passive elapsed time

**Two Productivity Metrics**:
- `contributionPerLaborHour` = contributionProfit / laborHours (Range) — how productive is the hands-on work
- `contributionPerCapacityHour` = contributionProfit.expected / capacityHours (scalar) — profit per schedule hour consumed

**Multi-Floor Pricing** (v0.3.0):
```
minimumAcceptablePrice = max(
  minimumJobPrice,
  directCost × marginFactor,
  directCost + profitFloorAbsolute,
  directCost + laborHours × minimumHourlyRate,
  directCost + capacityHours × requiredContributionPerCapacityHour  [if context provided]
)
```
`suggestedPrice` range is floored at `minimumAcceptablePrice`. The `pricingFloors` object exposes all floor values and identifies the binding constraint.

**Confidence Overlap Dedup** (v0.3.0): When an unknown (e.g., `extent_of_water_damage`) is already covered by an active condition's confidence penalty (e.g., `water_damage`), the redundant -0.05 deduction is skipped. Tracked in `CONDITION_RELATED_UNKNOWNS` map.

**Risk Flag Dedup**: `[...new Set(riskFlags)]` applied at output boundary.

**Numeric Normalization**: All money and hour outputs rounded to ≤2 decimal places at output boundary.

---

## Decision Engine: `src/estimator/decision.ts`

Universal — works for any vertical. Truck copy is **Send $ask**, **Look first: {thing}**, or **Pass**. Internal codes stay `take` | `take_at_price` | `review` | `pass`.

**Ask vs walk-away**
- **Ask / Send** = `evaluatedPrice` when it already clears all floors, else `minimumAcceptablePrice` (includes this week's pace).
- **Walk-away / don't go below** = max of min-job, margin, absolute profit, labor productivity. **Does not include** weekly capacity pace.
- Conservative low-end hours/profit does **not** force Look first. That math stays off the truck.

**Look first** only when we can name the check (water travel, substrate, structural, photos don't show the job, unrecognized work). Low confidence without a named risk uses "The photos. We can't tell the full job yet."

**Pass** only when the job will not fit remaining hours, or expected profit / hourly / margin fail **and** the quote is already at or above the floor (cannot raise the send price). A tight Friday does **not** Pass a clear job just because the week-ask is much higher than the normal quote — it Sends the week-ask and keeps the walk-away.

**Week clock** (`weekContext.ts`)
- Live. Not hardcoded to Monday / midweek / Friday. Those three clocks exist only in `npm run sim`.
- Earned + committed hours = completed (this calendar week) + scheduled + in_progress + approved.
- Completed counts only if `completed_at` (else `created_at`) is in the current Monday–Sunday week.
- Quoted / needs_review do not count.
- `completed_at` is written on status change (trigger + `workItemStatusFields`).

**Live display**
- Pending `needs_review` rows recompute via `applyLiveRecommendations` from the live week clock.
- Intake snapshot stays on `estimation_runs.decision_context`.

Replay after any tune: `npm run sim` → `docs/SIMULATION.md`. Refresh Mason in production: `supabase/refresh-mason-production.sql`.

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

## Persistence & Feedback Loop: `src/estimator/persistence.ts`

`work_items` are UUID + RLS. Estimation / feedback tables are `business_id`-scoped (`schema.sql` + 022).

### 4 Tables (append-only / immutable)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `estimation_runs` | Rivet's original estimate (immutable) | extraction, economic_job, recommendation, confidence, decision_context, reasons |
| `adjustment_entries` | What the handyman changed (append-only) | field, systemValue → newValue, reasonCode |
| `owner_decisions` | What the owner decided + situational context | rivetRecommendation, ownerAction, rivetPrice, ownerPrice, quotedPrice, **reason_code**, **decision_snapshot** (JSONB) |
| `actual_outcomes` | What actually happened | actualLaborHours, actualMaterialCost, finalRevenue, **quotedPrice**, returnTrips |

### DecisionSnapshot (JSONB on owner_decisions)

Captures the full situational context at the moment the owner acts — not at estimation time. This is the "it was Thursday, 15 hours left, only needed $1k" data for future tuning.

```ts
{
  // Time
  dayOfWeek: 4,           // Thursday
  weekNumber: 36,
  hourOfDay: 14,          // 2pm

  // Capacity
  remainingCapacityHours: 15,
  hoursWorkedThisWeek: 20,
  jobsCompletedThisWeek: 8,

  // Financial
  weeklyEarningsToDate: 1500,
  weeklyEarningsGoal: 2500,
  gapToWeeklyGoal: 1000,
  requiredContributionPerCapacityHour: 67,

  // Queue
  queueDepth: 3,
  queueTotalValue: 1200,
  queueTotalHours: 12,
}
```

### FeedbackRecord (assembled, not stored)

`buildFeedbackRecord(runId)` and `buildFeedbackRecords(businessId)` assemble the complete 4-part record from all tables:

```
Part 1: Rivet's estimate    → recommendation, confidence, evaluatedPrice, laborHours, materialCost, reasons
Part 2: Human adjustments   → price/hours/material changes with reason codes
Part 3: Owner decision      → action taken, price set, quoted price, situational snapshot
Part 4: Actual outcome      → real labor, real materials, real revenue, return trips

Derived: accuracy metrics   → rivet vs human error on labor and price, who was closer
```

### Batch Query Functions

- `getRunsForBusiness(businessId)` — all estimation runs for a business
- `getAllOutcomes(runIds)` — Map of runId → ActualOutcome
- `getAllAdjustments(runIds)` — Map of runId → AdjustmentEntry[]
- `getAllOwnerDecisions(runIds)` — Map of runId → OwnerDecision
- `buildFeedbackRecords(businessId)` — full 4-part records with accuracy metrics

### Recording Points in the UI

| User Action | Where | What's Recorded |
|-------------|-------|-----------------|
| Owner quotes a Send job at our number | `WorkDetailDrawer` Create Quote | `approved` + snapshot (agree — no extra reason) |
| Owner quotes a Look first job | `WorkDetailDrawer` reason then Create Quote | `approved` / `approved_adjusted` + `REC_LOOK_FIRST_CLEAR` or `REC_SHOULD_HAVE_SENT` |
| Owner quotes a Pass job | `WorkDetailDrawer` reason then Create Quote | `approved` / `approved_adjusted` + `REC_OVERRIDE_PASS` (we missed) |
| Owner declines a Send / Look first | `WorkDetailDrawer` reason then Decline | `declined` + `REC_SHOULD_HAVE_PASSED` or `REC_DONT_WANT_CUSTOMER` |
| Owner declines a Pass | `WorkDetailDrawer` Decline | `declined` + snapshot (agree — no extra reason) |
| Owner changes price any amount | `WorkDetailDrawer` price input | `SYSTEM_TOO_HIGH` / `SYSTEM_TOO_LOW` from direction; >5% still asks why |
| Job completed | `complete-job.js` / `dispatch-complete.js` | actual_outcomes with quotedPrice |
| Monday 14:00 UTC | `weekly-tuning-report` | Miss rollup email to `TUNING_REPORT_EMAIL` (or function log) |

---

## Decision Lab: `src/admin/DecisionLab.tsx`

Internal-only evaluation page under Settings. Access-gated via `localStorage.rivet_lab === '1'` or `?lab=1` URL param.

**Table view**: Date, Customer, Trade, Recommendation, System/Human/Actual labor & materials, System price, Revenue, Confidence, Estimator version.

**Detail view** (click a row): Full pipeline walkthrough — Input, AI Extraction, Estimator breakdown, Calibration, Economics (including pricing floors, $/work hour, $/schedule hour), Decision (reasons + context), Human Adjustments timeline, Actual Outcome with error calculations.

**Filters**: Customer, trade context, recommendation (Send / Look first / Pass), completed vs pending, human-adjusted yes/no, confidence level.

**Export**: JSON and CSV formats, structured for handing to Claude/ChatGPT/domain experts to diagnose systematic errors. Includes absolute/percent errors for labor and material, winner tracking (human vs rivet), pricing floor traces.

**Summary metrics** (completed jobs only): Median labor/material error, human-adjusted ratio, Rivet-closer-than-human ratio, error breakdown by trade context.

**Programmatic diagnostics**: `summarizeDecisionLab(records)` in `src/estimator/diagnostics.ts` produces recommendation distribution, median errors, risk flag frequency, pricing floor distribution, and human-vs-rivet accuracy stats.

---

## Demo Account: Mason Home Services

Seeded account that functions identically to a real customer account. No special code paths — app code never changes between demo and real.

- `src/demo/seed.ts` generates 22 work items (10 pending + 12 completed) through the real estimator pipeline
- `src/demo/customers.ts` provides 13 residential + 2 commercial customers in Nashville TN
- `src/demo/seedSupabase.ts` pushes estimation runs, adjustments, and outcomes to Supabase
- Static data imported in `src/admin/types.ts`; pipeline data persisted via Supabase
- Seed data includes 12 owner decisions with varied situational snapshots (Monday fresh week through Friday nearly-hit-goal, different capacity/earnings states)
- Regenerate with: `npx tsx supabase/generate-seed-sql.ts` → `supabase/seed-data.sql` and `supabase/refresh-mason-production.sql`
- Production refresh is Mason-only (`business_id` `a0000000-0000-0000-0000-000000000001`). Run `023_work_item_completed_at.sql` first if that column is missing.

Business config: ownerOpportunityRate $75, helperRate $30, mileage $0.70, materialMarkup 20%, minimumJobPrice $175, minimumHourlyRate $70, profitFloor $75, marginFloor 35%, confidenceThreshold 0.70, weeklyGoal $2500, weeklyCapacity 35h.

---

## UI Integration: `src/admin/WorkDetailDrawer.tsx`

Truck CTAs are **Create Quote** and **Decline**. Pass jobs can still be quoted (that is the override).

| They do | We write |
|---------|----------|
| Send + quote at our number | `approved` — agree, no extra reason |
| Look first + quote | `approved` / `approved_adjusted` + `REC_LOOK_FIRST_CLEAR` or `REC_SHOULD_HAVE_SENT` |
| Pass + quote | `approved` / `approved_adjusted` + `REC_OVERRIDE_PASS` (we missed) |
| Decline a Send / Look first | `declined` + `REC_SHOULD_HAVE_PASSED` or `REC_DONT_WANT_CUSTOMER` |
| Decline a Pass | `declined` — agree, no extra reason |
| Any price move | `SYSTEM_TOO_HIGH` / `SYSTEM_TOO_LOW` from direction; >5% still asks why |

`reason_code` lives on `owner_decisions`. Weekly rollup: `npm run tune-report` and `weekly-tuning-report` (Monday 14:00 UTC).

Every action also stores a `DecisionSnapshot` (time, capacity, financials, queue). Save failures do not block the quote.

---

## Tests

Estimator / decision / pipeline / week / sim / live recs / truck copy / decisionFeedback / tuningReport. Run `npm test`.

### `src/estimator/__tests__/estimator.test.ts`

- Assembly invariants (15+ assemblies, valid ranges, trade contexts, validation status)
- Component invariants (20+ components, valid baselines, carpentry components present)
- Condition modifier invariants
- Assembly path: known assembly → correct range, low confidence → fallback, unknown assembly → fallback
- Component path: sum components, shared overhead, quantity scaling, complexity, unknown components, no tasks fallback, poor coverage, inferred widening
- Conditions applied: water damage, customer supplied, unknown material, unknowns reduce confidence
- Calibration: multiplier with samples, skip when < 3, bounded, no overwrite
- EconomicJob: totalDirectCost, contributionProfit, ownerAdjustedProfit, minimum price, valid ranges
- Tier separation: AI no hours/prices, calibration no overwrite, economics no trade change
- **Capacity-hour economics**: same profit different capacity → different rates, return trip adds capacity, weekly pace floor uses capacityHours
- **Multi-floor pricing**: minimumAcceptablePrice = max of all floors, suggestedPrice >= floor, binding floor identified, owner labor excluded from floors
- **Risk flag & confidence dedup**: flags deduplicated, water_damage + extent_of_water_damage no double-penalty
- **Numeric normalization**: money ≤2 decimals, hours ≤2 decimals

### `src/estimator/__tests__/decision.test.ts`

- Static thresholds: good job → Take, low contributionPerLaborHour → Pass, low margin → Pass, low profit → Pass
- Review / Look first: named risk or photos unclear — not conservative low-end hours
- DecisionContext: job that does not fit remaining hours → Pass; week-ask above quote → Send that ask
- Reasons: populated and match recommendation
- **Labor-hour vs capacity-hour**: same profit different capacity → different assessment
- **Pricing gap**: Send the week-ask (take_at_price), do not Pass solely because Friday is tight
- Walk-away is the no-week-pace floor

### `src/estimator/__tests__/pipeline.test.ts`

- Assembly path E2E: small drywall patch, exterior door with water damage, TV mount, calibration scaling
- Component path E2E: weird custom job (dog-chewed balusters), mixed carpentry+plumbing, fence with posts, unknown job
- Shared overhead: multiple components don't multiply setup/cleanup
- Adjustment logging: systemValue preserved, timestamps
- Service type regression: all Handyman, no Junk Removal

### Other estimator tests

- `weekContext.test.ts` — this-week completed vs booked; quoted does not count
- `simulate.test.ts` / `truckCopy.test.ts` — Monday/midweek/Friday clocks and truck labels
- `decisionFeedback.test.ts` — when a rec miss must ask why
- `tuningReport.test.ts` — weekly miss rollup and suggested tunes
- `liveRecommendations.test.ts` — pending jobs recompute from the live week clock

---

## Embeddable Quote Form

Drop-in script for clients to embed a "Request a Quote" form on their website. Follows the Calendly pattern — one script tag, zero configuration beyond the business slug.

### Files

| File | Purpose |
|------|---------|
| `public/embed.js` | Client-facing embed script (inline + popup modes) |
| `src/pages/VerticalQuoteForm.jsx` | Quote request form (detects `?embed=1` for iframe mode) |
| `src/pages/HostedQuoteForm.jsx` | Route wrapper at `/request/:slug` → renders `VerticalQuoteForm` |
| `netlify.toml` | CORS headers on `embed.js`, `X-Frame-Options` + CSP for `/request/*` |

### Usage

**Inline mode** — renders iframe in a container:
```html
<div id="rivet-quote"></div>
<script src="https://myrivet.io/embed.js" data-business="mason-home-services"></script>
```

**Popup mode** — renders a trigger button that opens a modal:
```html
<script src="https://myrivet.io/embed.js"
        data-business="mason-home-services"
        data-mode="popup"
        data-button-text="Request a Quote"
        data-button-color="#22c55e"></script>
```

### Data Attributes

| Attribute | Required | Default | Description |
|-----------|----------|---------|-------------|
| `data-business` | Yes | — | Business slug |
| `data-mode` | No | `inline` | `inline` or `popup` |
| `data-target` | No | `#rivet-quote` | CSS selector for inline container |
| `data-button-text` | No | `Request a Quote` | Popup button label |
| `data-button-color` | No | `#22c55e` | Popup button background color |

### postMessage Protocol

The iframe communicates with the parent via `window.postMessage`:

| Message Type | Direction | Payload | Purpose |
|-------------|-----------|---------|---------|
| `rivet-resize` | iframe → parent | `{ type, height: number }` | Auto-resize iframe to content height |
| `rivet-submitted` | iframe → parent | `{ type }` | Form submitted successfully |
| `rivet-close` | iframe → parent | `{ type }` | User wants to close (popup mode) |

`VerticalQuoteForm` uses a `ResizeObserver` on `document.body` to detect height changes and post `rivet-resize` messages to the parent window. Only active when `?embed=1` is present.

### Netlify Headers

```toml
# embed.js — CORS for cross-origin script loading
Access-Control-Allow-Origin: *
Cache-Control: public, max-age=3600

# /request/* — allow iframe embedding from any origin
X-Frame-Options: ALLOWALL
Content-Security-Policy: frame-ancestors *
```

The global `X-Frame-Options: DENY` on `/*` is overridden by the route-specific `/request/*` rule (Netlify processes more-specific rules first).

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
- `complete-job` flow does not yet auto-populate `quotedPrice` on `actual_outcomes` from `bookings.approved_quote` — requires wiring in `completeJobCore.js`
- `buildFeedbackRecords` loads all runs for a business — may need pagination for high-volume accounts

---

## Agent Framework

Rivet's AI capabilities run through a structured agent framework. The UI, MCP, and any other channel are just consumers — the power is the pricing engine and agent backend.

### Design Philosophy

**Code is plumbing. Logic lives in `.md` resource files.**

TypeScript files define registration, routing, and the main loop. All rules, question patterns, decision heuristics, and business logic are written in Markdown files inside skill directories. This means:
- Adding a new capability = write a `.md` file, not TypeScript
- Logic is readable and editable by non-engineers
- Skills compose: one agent can hold multiple skills

### Cascade

```
Main Loop (loop.ts)
  └── Agent (agents/*.ts)         ← scoped function, model, skill list, tool allowlist
        └── Skill (skills/*.ts)   ← instructions + resources map
              └── Resources.md    ← ALL logic/rules/patterns (Markdown, not code)
              └── Tools           ← optional, filtered by agent allowlist
```

### Multi-Model Routing

| Model | When | Cost | Pattern |
|-------|------|------|---------|
| `claude-haiku-4-5-20251001` | Single-pass, focused tasks | ~$0.001/call | Pre-inject all skill content into system prompt; single API call; no tool use |
| `claude-sonnet-4-6` | Tool-use loops, deep reasoning | ~$0.01–0.10/call | Tool-use loop with `skill_resource` for dynamic loading; `complete_task` control tool to exit |

**Haiku path**: All skill content (instructions + all resources) pre-loaded into the system prompt. No tool calls. One API call. Use when the task is well-defined and content is bounded.

**Sonnet path**: Tool-use loop (max 12 iterations, 24 tool calls). Agent loads skill resources on-demand via `skill_resource` tool. Exits via `complete_task` control signal or when `stop_reason !== 'tool_use'`.

### File Structure

```
netlify/functions/
  agent.ts                          ← Netlify entry point; POST router; bootstraps via side-effect imports
  _shared/agent/
    types.ts                        ← Core types: Agent, Skill, AgentTool, AgentContext, AgentResult, MODELS
    loop.ts                         ← THE one main loop (Haiku + Sonnet paths)
    registry/
      agentRegistry.ts              ← registerAgent / getAgent / listAgents
      skillRegistry.ts              ← registerSkill / catalogText / loadSkillBody / preloadContent
      toolRegistry.ts               ← addTool / anthropicTools / executeTool (enforces allowlist)
    tools/
      index.ts                      ← Side-effect import: registers all built-in tools
      skillResource.ts              ← skill_resource tool (Sonnet): load, list, resource actions
      completeTask.ts               ← complete_task control tool: exits Sonnet loop
    agents/
      jobAdvisor.ts                 ← Job Advisor agent (Haiku, scope-clarifier skill)
    skills/
      scopeClarifier.ts             ← First live skill; question-patterns.md holds all logic
```

### Registration Pattern

All registration happens as side effects on import. No explicit wiring needed in the router.

```typescript
// agent.ts (router)
import './_shared/agent/tools/index';        // registers skill_resource + complete_task
import './_shared/agent/agents/jobAdvisor';  // registers scope-clarifier skill + job-advisor agent

// agents/jobAdvisor.ts
registerSkill(scopeClarifierSkill);
registerAgent(jobAdvisor);
```

The router calls `getAgent('job-advisor')` and `runAgent(agent, message, context)`. That's it.

### Tool Allowlist Enforcement

Each agent declares `tools: string[]`. The registry rejects any tool call not in that list:

```typescript
// executeTool in toolRegistry.ts
if (!allowlist.includes(name)) {
  return { content: `Tool '${name}' not in allowlist`, isError: true };
}
```

Haiku agents set `tools: []` — no tool use, all skill content pre-injected.

### How to Add a New Agent

1. **Write the resource file** — `skills/mySkill/resources/my-rules.md` with all logic
2. **Create the skill** — `skills/mySkill.ts` exports a `Skill` with `instructions` and `resources` map
3. **Create the agent** — `agents/myAgent.ts`, call `registerSkill(...)` and `registerAgent(...)`, declare `model`, `skills`, `tools`
4. **Import in router** — `import './_shared/agent/agents/myAgent'` in `agent.ts`
5. **Add a task case** — handle `task: 'my-task'` in the router switch, call `runAgent`

### Live Skills

#### `scope-clarifier`
- **Purpose**: Generate specific clarifying questions for a review job before the owner contacts the customer
- **Model**: Haiku (single-pass)
- **Resource**: `resources/question-patterns.md` — per-trade question patterns (deck, drywall, fence, door, TV mount, general), always-add rules, photo judgment
- **Output**: `{ questions: string[], context: string }` — 3–5 specific questions + 1–2 sentence context

### UI Integration Pattern

The UI is just a distribution channel. Hooks call `/.netlify/functions/agent` and consume the result:

```
WorkDetailDrawer (review job)
  └── useJobAdvisor hook            ← fires once when drawer opens for a review job
        └── POST /.netlify/functions/agent { task: 'clarify-scope', businessId, jobTitle, ... }
              └── job-advisor agent → scope-clarifier skill → question-patterns.md
                    └── returns { questions, context }
        └── renders questions as "What to find out" checklist
```

**`src/hooks/useJobAdvisor.ts`** — React hook; `enabled` controls whether the call fires (review jobs only); fires once on mount; returns `{ advice, loading, error }`.

The same agent endpoint is callable from MCP, Claude connectors, or any other channel with no code changes.

---

## Ask Rivet — Conversational Agent

A floating chat panel ("Ask Rivet") lets contractors manage their entire pipeline through natural language, mirroring the UI-based workflow without opening any drawer or clicking any button.

### How it connects

```
Contractor UI (React)
  └── AskRivetPanel.tsx + useAskRivet.ts
        └── fetch POST rivet-agents/chat   ← SSE stream
              └── contractor-advisor agent (Sonnet, tool-use loop)
                    ├── skill: contractor-advisor/SKILL.md
                    ├── resources: workflow-stages.md, priority-signals.md
                    └── tools: list_work_items, get_work_item_detail,
                                refresh_scope, price_materials, re_estimate_job,
                                send_estimate, email_client, accept_work,
                                reject_work, update_work_price, add_contractor_note
```

The UI calls `rivet-agents` directly (not via Netlify Functions) to avoid SSE timeout constraints on serverless functions.

### SSE stream format

```
event: text   data: <token>              — streaming response text
event: tool   data: <label>             — tool being called (UI shows thinking label)
event: chips  data: ["chip1","chip2"]   — contextual follow-up suggestions
event: id     data: <conversation_uuid> — persist to localStorage
event: done   data:                     — stream complete
```

### Chip system

The contractor-advisor skill instructs the agent to end every response with:
```
<chips>["Send the Acme Corp estimate", "What else needs attention?"]</chips>
```

The UI renders chips as pill buttons below each assistant message. Clicking sends it as the next user message — contractors rarely need to type. Initial chips shown on empty conversation:
- "What should I work on this week?"
- "Any estimates I need to send?"
- "Are there jobs waiting on customer info?"
- "Show me what's approved and ready to schedule"

### Frontend files

| File | Purpose |
|------|---------|
| `src/admin/useAskRivet.ts` | Hook: state management, SSE consumption, localStorage persistence |
| `src/admin/AskRivetPanel.tsx` | Chat panel UI: messages, chips, thinking indicator, input row |
| `src/admin/RivetDashboard.tsx` | Mounts panel + FAB trigger button |
| `src/admin/admin.css` | Panel styles (dark theme, chip pills, streaming cursor) |

### Conversation persistence

Conversations saved to `contractor_conversations` Supabase table (in `rivet-agents`). `conversationId` returned as `event: id` and stored in browser `localStorage`. On panel open, `GET /conversation/{id}` restores history.

### Actions available to the agent

Every action available in the UI is also available to the agent:

| Workflow step | UI action | Agent tool |
|--------------|-----------|-----------|
| Review incoming job | Scope analysis panel | `refresh_scope` |
| Price materials | Materials BOM panel | `price_materials` |
| Re-run estimate | Re-estimate button | `re_estimate_job` |
| Send estimate to customer | Send Estimate button | `send_estimate` |
| Email customer | Email button | `email_client` |
| Accept job | Accept button | `accept_work` |
| Decline job | Decline button | `reject_work` |
| Adjust price | Price field | `update_work_price` |
| Add note | Notes field | `add_contractor_note` |
| Browse pipeline | Work items list | `list_work_items` |
| View job detail | Job drawer | `get_work_item_detail` |
