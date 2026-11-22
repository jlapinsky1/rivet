# Rivet Estimation Engine — Full Technical Reference

This document describes the complete math, data architecture, and self-healing calibration
system behind every quote Rivet produces. It is written to be challenged — take it to domain
experts, compare it against industry labor databases (RSMeans, Craftsman, NAHB), and pressure-
test the economic model against your own P&L.

---

## Table of Contents

1. [Pipeline Overview](#1-pipeline-overview)
2. [Stage 1 — AI Extraction](#2-stage-1--ai-extraction)
3. [Stage 2 — Deterministic Estimation](#3-stage-2--deterministic-estimation)
4. [Stage 3 — Calibration Application](#4-stage-3--calibration-application)
5. [Stage 4 — Economics Layer](#5-stage-4--economics-layer)
6. [Stage 5 — Decision Context (Weekly Capacity Model)](#6-stage-5--decision-context-weekly-capacity-model)
7. [Stage 6 — Recommendation Engine](#7-stage-6--recommendation-engine)
8. [Stage 7 — Owner Decision Capture](#8-stage-7--owner-decision-capture)
9. [Stage 8 — Actual Outcomes Recording](#9-stage-8--actual-outcomes-recording)
10. [Stage 9 — Self-Healing Calibration](#10-stage-9--self-healing-calibration)
11. [Data Architecture](#11-data-architecture)
12. [Configuration Parameters](#12-configuration-parameters)
13. [Known Limitations and Open Questions](#13-known-limitations-and-open-questions)

---

## 1. Pipeline Overview

Every booking flows through nine deterministic stages. The only non-deterministic step is
Stage 1 (the LLM extraction). Everything after that is pure math — reproducible, auditable,
and tunable without retraining a model.

```
Customer description + photos
         │
         ▼
 [Stage 1] AI Extraction ──────────────────── LLM (Claude)
         │  trade contexts, assembly match,
         │  tasks, conditions, unknowns,
         │  materialSupplyStatus, confidence
         │
         ▼
 [Stage 2] Deterministic Estimation ────────── estimator.ts
         │  Assembly path  OR  Component path
         │  → laborHours { low, expected, high }
         │  → materialCost { low, expected, high }
         │  → confidence score
         │
         ▼
 [Stage 3] Calibration Application ─────────── applyCalibration()
         │  Scales estimate by learned multipliers
         │  (no-op until ≥ 3 close-outs exist)
         │
         ▼
 [Stage 4] Economics Layer ─────────────────── applyCalibration() cont.
         │  + travel cost
         │  + material markup
         │  + 5 pricing floors
         │  → recommendedQuote, minimumAcceptablePrice
         │
         ▼
 [Stage 5] Decision Context ────────────────── buildDecisionContext()
         │  Weekly earnings to date
         │  Remaining capacity hours
         │  Required $/schedule-hour to hit goal
         │
         ▼
 [Stage 6] Recommendation Engine ───────────── deriveRecommendation()
         │  take | take_at_price | review | pass
         │  + human-readable reasons
         │
         ▼
 Contractor sees quote + recommendation
         │
         ├── [Stage 7] Owner decision recorded ── owner_decisions table
         │
         └── [Stage 8] Job close-out ───────────── actual_outcomes table
                           │
                           ▼
                  [Stage 9] recomputeCalibration()
                           Updates business_assembly_calibration cache
                           → next estimate auto-corrects
```

---

## 2. Stage 1 — AI Extraction

**Input:** free-text customer description + optional photos
**Output:** `ExtractionResult` struct

The LLM is asked to produce a structured JSON object. It never touches pricing math —
it only classifies what the job is and what uncertainties exist.

### 2.1 Extraction fields

| Field | Type | Purpose |
|-------|------|---------|
| `tradeContexts` | `string[]` | Trade families involved (e.g. `["carpentry", "drywall"]`). First element is used as the calibration key. |
| `assemblyCandidate` | `string \| null` | Best-matching known assembly code (e.g. `exterior_door_replacement`). Null if no strong match. |
| `assemblyConfidence` | `number 0–1` | LLM's confidence that the assembly candidate is correct. Must exceed `ASSEMBLY_CONFIDENCE_THRESHOLD` (0.75) to trigger the assembly path. |
| `tasks` | `ExtractedTask[]` | For the component path: discrete work units with component code, quantity, complexity, source. |
| `conditions` | `string[]` | Site conditions that modify labor or material (see §3.4). |
| `unknowns` | `string[]` | Things the LLM cannot determine from the description — each one carries a −0.05 confidence penalty. |
| `materialSupplyStatus` | `customer_supplied \| contractor_supplied \| unknown` | Who buys the materials. |
| `overallConfidence` | `number 0–1` | LLM's self-assessed confidence across all extracted tasks. |

### 2.2 Assembly confidence threshold

```
ASSEMBLY_CONFIDENCE_THRESHOLD = 0.75
```

If `assemblyConfidence >= 0.75` AND `assemblyCandidate` is a known code, the system takes
the **assembly path** (§3.2). Otherwise it falls through to the **component path** (§3.3).

The assembly path is faster and more accurate for well-understood job types. The component
path handles novel jobs but produces wider ranges.

---

## 3. Stage 2 — Deterministic Estimation

**Input:** `ExtractionResult`
**Output:** `EstimatorOutput` — `laborHours`, `materialCost`, `confidence`, `breakdown`, `riskFlags`

All values are `Range` objects: `{ low, expected, high }`. Internal arithmetic never rounds
until the final output boundary.

### 3.1 Range arithmetic rules

```
addRange(a, b)        = { low: a.low + b.low, expected: a.exp + b.exp, high: a.high + b.high }
scaleRange(r, f)      = { low: r.low * f, expected: r.exp * f, high: r.high * f }
subtractRange(a, b)   = { low: a.low - b.high, expected: a.exp - b.exp, high: a.high - b.low }
  ↑ Note: low − high and high − low. Subtraction widens the range (conservative).
clampRange(r)         = floor all three at 0 (no negative hours or costs)
orderRange(r)         = ensure low ≤ expected ≤ high after modifiers
```

### 3.2 Assembly path

Used when a known assembly is matched with high confidence.

Each assembly has pre-calibrated ranges in `assemblies.ts`:

```typescript
{
  code: 'exterior_door_replacement',
  laborHours:   { low: 2.0, expected: 3.5, high: 5.5 },
  materialCost: { low: 150, expected: 250, high: 500 },
}
```

The assembly ranges are the **starting point**. Condition modifiers (§3.4) are then applied
multiplicatively on top.

**Assembly overhead:** No separate project setup/cleanup overhead is added in the assembly
path — it is baked into the assembly's `laborHours` range.

### 3.3 Component path

Used for novel or multi-trade jobs where no single assembly matches.

**Project overhead (added once, not per task):**
```
setup_hours   = 0.25 h (fixed)
cleanup_hours = 0.20 h (fixed, high = 0.30)
```

**Per-task labor formula:**
```
expectedHours = max(minimumHours, baseHours + hoursPerUnit × qty)

complexityFactor = 1.30  if complexity === 'high'
                   0.85  if complexity === 'low'
                   1.00  otherwise

scaledExpected = expectedHours × complexityFactor

taskLabor = {
  low:      scaledExpected × 0.75,
  expected: scaledExpected,
  high:     scaledExpected × 1.35,
}
```

If the task was `source === 'inferred'` (LLM inferred it rather than observed it):
```
taskLabor.high  *= 1.15
taskMaterial.high *= 1.15
```

**Per-task material formula:**
```
taskMaterial = {
  low:      allowancePerUnit × qty × 0.70,
  expected: allowancePerUnit × qty,
  high:     allowancePerUnit × qty × 1.40,
}
```

**Component-path range widening:**
After all tasks are summed, the component path applies a 10% high-end widening to reflect
higher structural uncertainty compared to a matched assembly:
```
totalLaborHours.high   *= 1.10
totalMaterialCost.high *= 1.10
```

**Coverage check:**
- If `recognizedTasks < totalTasks × 0.5`: `confidence -= 0.15`, flag `poor_component_coverage`
- If `totalTasks === 0`: confidence capped at 0.20, fallback range applied `{low:2, expected:5, high:14}`

### 3.4 Condition modifiers

Applied in both paths. Each condition in `extraction.conditions` triggers a modifier from
`modifiers.ts`. Modifiers multiply the ranges in place:

```
laborHours.low      *= mod.laborMultiplier
laborHours.expected *= mod.laborMultiplier
laborHours.high     *= mod.laborHighMultiplier  (or laborMultiplier if no separate high)

materialCost.*      *= mod.materialMultiplier

confidence          += mod.confidenceDelta  (typically negative)
```

Example conditions and their approximate multipliers (exact values in `modifiers.ts`):

| Condition | Labor effect | Material effect | Confidence delta |
|-----------|-------------|-----------------|-----------------|
| `confined_access` | ×1.20–1.35 high | — | −0.05 |
| `overhead_work` | ×1.15–1.25 | — | −0.05 |
| `water_damage` | ×1.25–1.50 high | ×1.30 | −0.10 |
| `unknown_substrate` | ×1.0–1.30 high | — | −0.10 |
| `finish_matching` | — | ×1.25 | −0.05 |
| `special_order_material` | — | ×1.40 | −0.10 |
| `multiple_visits_required` | ×1.40 | — | −0.10 |

### 3.5 Material supply status

```
customer_supplied → materialCost *= 0.30  (contractor only provides consumables + hardware)
                    riskFlag: customer_supplied_compatibility
unknown           → materialCost.high *= 1.25
                    confidence -= 0.05
```

### 3.6 Unknown confidence penalty

Each entry in `extraction.unknowns` normally costs −0.05 confidence. Exception: if a
condition already captures the same uncertainty (e.g. `water_damage` condition already
implies unknown extent), the unknown is deduplicated and no extra penalty is charged.

```
finalConfidence = clamp(baseConfidence + conditionDeltas + unknownPenalties, 0.05, 1.0)
```

---

## 4. Stage 3 — Calibration Application

**Input:** `EstimatorOutput` from Stage 2 + `BusinessCalibration | null`
**Function:** `applyCalibration()` in `estimator.ts`

This is where the system heals itself. If enough completed jobs exist, the raw estimate
is scaled by learned multipliers before any economic calculation.

### 4.1 When calibration is applied

```
MIN_SAMPLE_SIZE = 3

if (calibration != null && calibration.sampleSize >= 3) {
  laborMult    = clamp(calibration.laborMultiplier,    0.70, 1.50)
  materialMult = clamp(calibration.materialMultiplier, 0.70, 1.50)
} else {
  laborMult    = 1.0  // no correction
  materialMult = 1.0
}
```

The clamp range `[0.70, 1.50]` is applied **inside the estimator** as a sanity check.
The calibration cache also clamps at `[0.50, 2.0]` before storing. The estimator's tighter
clamp is an additional guard against extreme cached values corrupting a quote.

### 4.2 Calibrated labor and material

```
laborHours   = scaleRange(estimate.laborHours,   laborMult)
materialCost = scaleRange(estimate.materialCost, materialMult)
             = scaleRange(rawMaterial,           1 + materialMarkupPercent/100)
```

The markup is applied on top of the calibrated material cost (see §5.1).

---

## 5. Stage 4 — Economics Layer

Still inside `applyCalibration()`. Converts hours and material cost into a full economic
picture including travel, markup, floors, and profit metrics.

### 5.1 Direct costs (cash out of pocket)

```
materialCost  = calibratedMaterial × (1 + materialMarkupPercent / 100)
travelCost    = distanceMiles × mileageRate × 2       ← round trip
helperCost    = $0  (helper model reserved for future use)

totalDirectCost = materialCost + travelCost + helperCost
```

**Example:** 15 miles, $200 materials, 20% markup, $0.70/mile rate
```
materialCost = $200 × 1.20 = $240
travelCost   = 15 × $0.70 × 2 = $21
totalDirect  = $261
```

### 5.2 Capacity hours

Capacity hours represent the total time the job "uses up" in the contractor's week —
not just wrench time, but everything the job requires.

```
travelHours       = (distanceMiles × 2) / 30     ← assumes 30 mph average
procurementHours  = 0.50                          ← fixed: materials run + prep
returnTripHours   = oneWayTravel × 2  if returnTripRisk === 'high'
                  = oneWayTravel × 1  if returnTripRisk === 'medium'
                  = 0                 if returnTripRisk === 'low' or none

capacityHours = laborHours.expected + travelHours + procurementHours + returnTripHours
```

`returnTripRisk` is set by the worst condition modifier that carries a `returnTripRisk`
value (e.g. `water_damage` = high, `unknown_substrate` = medium).

Capacity hours are only used for the `weeklyCapacityPace` floor and the
`contributionPerCapacityHour` metric. They do not affect the quote price directly.

### 5.3 Five pricing floors

The system computes five independent floors and uses the highest one as `minimumAcceptablePrice`.
The name of the winning floor is stored in `pricingFloors.binding` for diagnostics.

```
marginFactor = 1 / (1 − marginFloorPercent / 100)

floor_1_minimumJob      = minimumJobPrice                              (e.g. $175)

floor_2_margin          = totalDirectCost.expected × marginFactor
                        = direct / (1 − margin%)
                        ← ensures the margin% is preserved on direct costs

floor_3_absoluteProfit  = totalDirectCost.expected + profitFloorAbsolute
                        ← at least $X above break-even

floor_4_laborProductivity = totalDirectCost.expected
                           + (laborHours.expected × minimumHourlyRate)
                        ← pays the owner minimumHourlyRate for every labor hour

floor_5_weeklyCapacityPace = totalDirectCost.expected
                           + (capacityHours × requiredContributionPerCapacityHour)
                        ← keeps earnings on pace to hit weekly goal
                        ← 0 if no decision context available

minimumAcceptablePrice = max(floor_1, floor_2, floor_3, floor_4, floor_5)
```

**Example** (15 miles, 3h labor, $240 materials, $261 direct, $70/hr min rate, 35% margin floor, $75 absolute profit floor):
```
floor_1 (minimum job)       = $175
floor_2 (margin 35%)        = $261 / 0.65         = $401.54
floor_3 (absolute profit)   = $261 + $75           = $336
floor_4 (labor productivity)= $261 + (3 × $70)     = $471
floor_5 (weekly pace)       = depends on context

minimumAcceptablePrice = $471  (binding: laborProductivity)
```

### 5.4 Recommended quote

The recommended quote is computed independently of the floors — it represents what the
job is worth at market rates:

```
targetLaborRate  = minimumHourlyRate × 1.20   ← 20% premium over floor rate
laborRevenue     = laborHours × targetLaborRate

estimatedQuoteRange = {
  low:      laborRevenue.low  + totalDirectCost.low,
  expected: laborRevenue.exp  + totalDirectCost.expected,
  high:     laborRevenue.high + totalDirectCost.high,
}

recommendedQuote = max(estimatedQuoteRange.expected, minimumJobPrice)
evaluatedPrice   = recommendedQuote
```

If `evaluatedPrice < minimumAcceptablePrice`, the recommendation engine flags a repricing
(§7.1) — the job is worth taking but needs a higher price to be safe.

### 5.5 Profit metrics

All computed at `evaluatedPrice`:

```
contributionProfit       = evaluatedPrice − totalDirectCost
contributionMargin       = contributionProfit / evaluatedPrice        (0.0–1.0)
contributionPerLaborHour = contributionProfit / laborHours.expected   ($/labor-hr)
contributionPerCapacityHour = contributionProfit.expected / capacityHours  ($/schedule-hr)

ownerAdjustedProfit  = contributionProfit − (laborHours × ownerOpportunityRate)
ownerAdjustedPerHour = ownerAdjustedProfit / laborHours.expected
```

`ownerAdjustedProfit` is an **analytical signal only** — it is not used in any acceptance
threshold. It answers: "if the owner valued his own time at $X/hr, is this worth doing?"
It is displayed in the job drawer but does not affect recommendations.

---

## 6. Stage 5 — Decision Context (Weekly Capacity Model)

**Function:** `buildDecisionContext()` in `weekContext.ts`
**Input:** all current work items for this business + settings

This stage answers: "where are we in the week, and how urgently do we need this job?"

### 6.1 Committed statuses

Only jobs in these statuses count toward current-week earnings and capacity:
```
{ completed, scheduled, in_progress, approved }
```

`completed` jobs only count if their `completedAt` (or `createdAt`) falls in the current
Mon–Sun local week. Scheduled/in_progress/approved always count — they are on the board.

### 6.2 Week context computation

```
earned           = sum of job.profit  for all committed in-week jobs
committedHours   = sum of job.capacityHours (or hoursNum) for committed jobs

remainingCapacityHours = max(0, weeklyHours − committedHours)

gap = max(0, weeklyEarningsGoal − earned)

requiredContributionPerCapacityHour =
  gap / remainingCapacityHours   if remainingCapacityHours > 0
  0                              otherwise
```

**Example:** Goal $2,500. Earned $1,200 so far. 20h committed of 35h capacity.
```
remaining = 35 − 20 = 15h
gap       = $2,500 − $1,200 = $1,300
required  = $1,300 / 15h = $86.67 per schedule hour
```

This `required` value feeds directly into `floor_5_weeklyCapacityPace` (§5.3).

---

## 7. Stage 6 — Recommendation Engine

**Function:** `deriveRecommendation()` in `decision.ts`
**Output:** `take | take_at_price | review | pass` + human-readable reasons

### 7.1 Decision logic (sequential gates)

The engine evaluates gates in order. Any gate can set `forcePass`, `forceReview`, or `reprice`.

```
pricingGap = minimumAcceptablePrice − evaluatedPrice

Gate 1: Capacity
  if job.capacityHours > remainingCapacityHours → forcePass
  (doesn't fit this week regardless of price)

Gate 2: Pricing gap
  if pricingGap > 0 → reprice
  (job is worth taking but evaluatedPrice is below the minimum)

Gate 3: Absolute profit
  if contributionProfit.expected < profitFloorAbsolute AND pricingGap <= 0 → forcePass

Gate 4: Hourly rate
  if contributionPerLaborHour.expected < minimumHourlyRate AND pricingGap <= 0 → forcePass

Gate 5: Margin
  if contributionMargin.expected < marginFloorPercent/100 AND pricingGap <= 0 → forcePass

Gate 6: Confidence
  if confidence < confidenceThreshold → flag caution (does not force pass alone)

Gate 7: Risk flags
  if riskFlags contain structural/water_damage/unknown_substrate → forceReview
  (look first before sending a number)

Gate 8: Weekly pace (informational)
  contributionPerCapacityHour vs requiredContributionPerCapacityHour → check/caution
```

### 7.2 Final outcome

```
if forcePass:    recommendation = 'pass'
elif forceReview: recommendation = 'review'
elif reprice:    recommendation = 'take_at_price'  → suggestedPrice = minimumAcceptablePrice
else:            recommendation = 'take'
```

Note: `forcePass` takes priority over `forceReview`. A job that is both too risky and
unprofitable is a `pass`, not a `review`.

### 7.3 Price outputs

```
askPrice      = minimumAcceptablePrice  if take_at_price
              = evaluatedPrice          otherwise
walkAwayPrice = max(minimumJob, margin, absoluteProfit, laborProductivity floors)
              ← business-only floor, ignores weekly pace
              ← the lowest price the contractor can accept without losing money
```

---

## 8. Stage 7 — Owner Decision Capture

Every time a contractor acts on a recommendation, that decision is recorded in
`owner_decisions` with full situational context.

### 8.1 Owner actions

| Action | Meaning |
|--------|---------|
| `approved` | Took the job at Rivet's suggested price |
| `approved_adjusted` | Took it but changed the price |
| `declined` | Passed on the job |
| `reviewed_later` | Deferred decision |

### 8.2 DecisionSnapshot

The snapshot captures the state of the contractor's week at decision time — not estimation
time. These can differ: a job estimated Monday morning might be decided Thursday afternoon
when the week looks very different.

```typescript
{
  dayOfWeek:                      number,   // 0=Sun, 6=Sat
  weekNumber:                     number,   // ISO week
  hourOfDay:                      number,   // 0-23 local
  remainingCapacityHours:         number,
  hoursWorkedThisWeek:            number,
  jobsCompletedThisWeek:          number,
  weeklyEarningsToDate:           number,
  weeklyEarningsGoal:             number,
  gapToWeeklyGoal:                number,   // negative = already exceeded goal
  requiredContributionPerCapacityHour: number,
  queueDepth:                     number,
  queueTotalValue:                number,
  queueTotalHours:                number,
}
```

### 8.3 Three write paths

All three paths POST to `/api/record-owner-decision`:

| Path | Trigger |
|------|---------|
| WorkDetailDrawer (UI) | Contractor approves/declines via the job drawer in the Rivet dashboard |
| RequestQueue (admin) | Admin approves/declines from the booking queue |
| rivet-agents (chat) | Contractor advisor agent calls `accept_work`, `reject_work`, or `update_work_price` |

The endpoint looks up the `estimation_run_id` via `work_items.source_booking_id` for paths
that only have a booking ID.

### 8.4 Reason codes

When a contractor overrides Rivet's recommendation, they must select a reason:

| Code | Description |
|------|-------------|
| `SYSTEM_TOO_LOW` | Rivet underpriced it |
| `SYSTEM_TOO_HIGH` | Rivet overpriced it |
| `SCOPE_CHANGED` | Scope is different from what Rivet saw |
| `NEW_CUSTOMER_INFO` | Learned something that changes the job |
| `OWNER_EXPERIENCE` | Experience says the estimate is wrong |
| `MATERIAL_COST_DIFFERENT` | Real material cost differs |
| `SITE_CONDITION_DIFFERENT` | Site is better/worse than described |
| `REC_SHOULD_HAVE_PASSED` | Rivet said take, owner disagrees |
| `REC_DONT_WANT_CUSTOMER` | Business decision, not price |
| `REC_SHOULD_HAVE_SENT` | Rivet said pass/review, owner took it anyway |
| `OTHER` | Free text |

These feed the weekly tuning report (not covered here) which surfaces patterns in
systematic estimation errors.

---

## 9. Stage 8 — Actual Outcomes Recording

After a job is completed, the contractor records what actually happened via the close-out
form in WorkDetailDrawer. This is the signal that trains the calibration.

### 9.1 Write path

```
POST /api/record-job-actuals
{
  workItemId:         string,    // required
  businessId:         string,    // required
  actualLaborHours:   number,    // required, > 0
  actualMaterialCost: number,    // optional, defaults to 0
  finalRevenue:       number,    // optional, defaults to quoted price
  notes:              string,    // optional
}
```

### 9.2 What gets written

```sql
INSERT INTO actual_outcomes (
  estimation_run_id,
  actual_labor_hours,       -- the signal that heals labor estimates
  actual_material_cost,     -- the signal that heals material estimates
  actual_procurement_hours, -- always 0 for now
  final_revenue,
  return_trips,             -- always 0 for now
  quoted_price,
  recorded_at,
  notes
)
```

### 9.3 Revenue-only placeholder (automatic)

When a booking is marked completed (before the contractor fills in real hours),
`completeJobCore.js` automatically writes a revenue-only row with `actual_labor_hours = 0`.
This row is **excluded** from calibration by `.gt('actual_labor_hours', 0)` filters —
it only contributes to revenue tracking. The contractor's real close-out row replaces the
signal role.

---

## 10. Stage 9 — Self-Healing Calibration

This is the core loop that makes estimates improve over time without human intervention.

### 10.1 Trigger

After a successful `actual_outcomes` insert in `/api/record-job-actuals`:

```javascript
const family = run.project_family ?? 'general_handyman';
await Promise.all([
  recomputeCalibration(supabase, businessId, family),  // trade-specific
  recomputeCalibration(supabase, businessId, 'all'),   // global fallback
]);
```

### 10.2 recomputeCalibration() — step by step

**Step 1:** Load all estimation runs for this business matching this trade family.
```sql
SELECT id, baseline_estimate
FROM estimation_runs
WHERE business_id = $1
  AND project_family = $2   -- omitted for 'all' key
```

**Step 2:** Load all actual outcomes with real labor hours (exclude revenue-only rows).
```sql
SELECT estimation_run_id, actual_labor_hours, actual_material_cost
FROM actual_outcomes
WHERE estimation_run_id IN (...)
  AND actual_labor_hours > 0
```

**Step 3:** Compute raw multipliers from matched (run, outcome) pairs.
```
For each outcome:
  estLabor    = run.baseline_estimate.laborHours.expected
  estMaterial = run.baseline_estimate.materialCost.expected

  if estLabor > 0:
    laborRatios.push(actual_labor_hours / estLabor)

  if estMaterial > 0 AND actual_material_cost > 0:
    materialRatios.push(actual_material_cost / estMaterial)

rawLaborMultiplier    = mean(laborRatios)
rawMaterialMultiplier = mean(materialRatios)
```

A multiplier > 1.0 means jobs in this trade consistently take longer / cost more than
estimated. A multiplier < 1.0 means estimates are running high.

**Step 4:** Bayesian shrinkage — blend toward 1.0 when data is sparse.

```
n      = laborRatios.length
weight = min(n / 10, 1.0)

blendedLaborMultiplier    = weight × rawLaborMultiplier    + (1 − weight) × 1.0
blendedMaterialMultiplier = weight × rawMaterialMultiplier + (1 − weight) × 1.0

clamp both to [0.50, 2.0]
```

The `weight` formula means:
- 1 job:  10% of learned correction applied, 90% stays at 1.0 (essentially no change)
- 3 jobs: 30% applied
- 5 jobs: 50% applied
- 10+ jobs: 100% — full trust in the data

This prevents one anomalous job from permanently skewing estimates for an entire trade.

**Why this works:** Early jobs may not be representative. A new contractor taking
only the easiest plumbing jobs will generate labor ratios < 1.0 even if the assembly
ranges are correct — the shrinkage ensures the system doesn't overcorrect while data is
thin.

**Step 5:** Assign confidence tier.

```
n < 3:   confidence = 'insufficient'   → calibration NOT applied at estimation time
n 3–5:   confidence = 'low'            → 30–50% blend
n 6–9:   confidence = 'medium'         → 60–90% blend
n ≥ 10:  confidence = 'high'           → full trust
```

**Step 6:** Upsert the cache.
```sql
INSERT INTO business_assembly_calibration
  (business_id, calibration_key, labor_multiplier, material_multiplier,
   sample_size, confidence, computed_at)
VALUES (...)
ON CONFLICT (business_id, calibration_key) DO UPDATE SET ...
```

### 10.3 Specificity hierarchy at estimation time

The estimation pipeline tries the most specific key first:

```javascript
// processBooking.js
const calibration =
  await loadBusinessCalibration(supabase, businessId, projectFamily)  // e.g. 'plumbing'
  ?? await loadBusinessCalibration(supabase, businessId, 'all');       // global fallback
```

`loadBusinessCalibration()` does a single point-lookup on the indexed cache table:
```sql
SELECT labor_multiplier, material_multiplier, sample_size, confidence
FROM business_assembly_calibration
WHERE business_id = $1 AND calibration_key = $2
```

Returns `null` if no row exists OR if `confidence = 'insufficient'`.
If `null`, the estimator uses `laborMult = materialMult = 1.0` — no correction.

### 10.4 What the cache looks like after 15 carpentry jobs

```
business_id:         'biz_abc123'
calibration_key:     'carpentry'
labor_multiplier:    1.23        ← carpentry jobs take 23% longer than estimated
material_multiplier: 1.08        ← materials run 8% over
sample_size:         15
confidence:          'high'
computed_at:         '2026-11-22T14:30:00Z'
```

The next carpentry estimate will automatically scale:
```
estimatedLaborHours × 1.23 = corrected hours fed into pricing
estimatedMaterial × 1.08   = corrected material fed into pricing
```

---

## 11. Data Architecture

### 11.1 Core tables in the feedback loop

```
estimation_runs
  id, business_id, project_family
  extraction           (JSONB — full LLM output)
  baseline_estimate    (JSONB — EstimatorOutput before calibration)
  calibration_applied  (JSONB — { laborMultiplier, materialMultiplier, sampleSize } | null)
  economic_job         (JSONB — full EconomicJob)
  recommendation       (take | take_at_price | review | pass)
  reasons              (JSONB array)
  confidence

work_items
  id, business_id, estimation_run_id
  source_booking_id    (FK → bookings.id — links residential bookings to their estimation run)
  op_status, price, profit, hours_num

owner_decisions
  id, estimation_run_id, business_id
  rivet_recommendation, owner_action
  rivet_price, owner_price, quoted_price
  reason_code, reason_text
  decision_snapshot    (JSONB — DecisionSnapshot)
  decided_at

actual_outcomes
  id, estimation_run_id
  actual_labor_hours    (0 = revenue-only placeholder, excluded from calibration)
  actual_material_cost
  final_revenue
  quoted_price
  recorded_at

business_assembly_calibration    ← the self-healing cache
  business_id, calibration_key
  labor_multiplier, material_multiplier
  sample_size, confidence
  computed_at
  UNIQUE (business_id, calibration_key)
```

### 11.2 The four-part feedback loop

```
Part 1 — Estimation
  estimation_runs row created
  baseline_estimate = raw output of estimateHandymanJob()
  calibration_applied = whatever the cache said at that moment
  economic_job = applyCalibration() output

Part 2 — Adjustment
  adjustment_entries rows (append-only)
  each price change = one row: field, systemValue, newValue, reasonCode

Part 3 — Decision
  owner_decisions row
  captures: what recommendation was given, what the owner did, full snapshot

Part 4 — Actuals
  actual_outcomes row (from close-out form or agent tool)
  actual_labor_hours > 0 triggers recomputeCalibration()
```

### 11.3 Idempotency guarantees

Every write path checks before inserting:
- `booking_completions`: checked by `booking_id` before insert
- `actual_outcomes`: checked by `estimation_run_id` (revenue-only placeholder never overwrites a row with real hours)
- `owner_decisions`: no uniqueness constraint — multiple decisions per run are valid
- `business_assembly_calibration`: upsert on `(business_id, calibration_key)`

---

## 12. Configuration Parameters

All parameters are stored in `businesses.settings` JSONB and loaded via `economicsFromSettings()`.
Defaults apply when a parameter is missing or zero.

| Parameter | Settings key | Default | What it controls |
|-----------|-------------|---------|-----------------|
| Owner opportunity rate | `ownerOpportunityRate` | $75/hr | `ownerAdjustedProfit` calculation. Does NOT affect acceptance thresholds. |
| Helper cash rate | `helperRate` | $30/hr | Reserved for future helper-on-job modeling. Currently unused. |
| Mileage rate | `mileageRate` | $0.70/mi | `travelCost = miles × rate × 2`. Increase if fuel costs are high. |
| Material markup | `materialMarkup` | 20% | Applied on top of estimated material cost. Covers procurement overhead + small-margin materials. |
| Minimum job price | `minimumPrice` | $175 | Floor 1. No job quoted below this regardless of estimate. |
| Minimum hourly rate | `minimumHourlyRate` | $70/hr | Floor 4 (labor productivity). Also sets `targetLaborRate = minimumHourlyRate × 1.20` for the recommended quote. |
| Absolute profit floor | `minimumJobProfit` | $75 | Floor 3. Minimum dollars of contribution profit per job. |
| Margin floor | `minimumMargin` | 35% | Floor 2. Minimum contribution margin. `floor = directCost / (1 − margin%)`. |
| Confidence threshold | `confidenceThreshold` | 0.70 | Below this, recommendation engine flags caution. Does not force a pass alone. |
| Weekly earnings goal | `weeklyGoal` | $2,500 | Used for Floor 5 and decision context. |
| Weekly capacity hours | `weeklyHours` | 35h | Total hours available per week. Drives remaining capacity calculation. |

**Tuning guide:**

- If the system is consistently recommending prices your market won't accept → lower
  `minimumHourlyRate` or `minimumMargin`
- If you're winning every job but margins are thin → raise `minimumHourlyRate` or
  `marginFloorPercent`
- If estimates are consistently off before you have close-out data → the assembly/component
  ranges in `assemblies.ts` and `components.ts` need domain validation (see §13)
- If the system is too aggressive at recommending `pass` based on weekly pace → raise
  `weeklyEarningsGoal` to match realistic expectations, or raise `weeklyCapacityHours`

---

## 13. Known Limitations and Open Questions

### 13.1 Assembly and component ranges are unvalidated

Every `laborHours` range in `assemblies.ts` and every `hoursPerUnit` in `components.ts`
carries `validationStatus: 'needs_domain_validation'`. These values are engineering
estimates, not empirically derived from a job database.

**Recommendation:** Cross-reference against:
- **RSMeans Residential Cost Data** — industry standard for unit labor hours
- **Craftsman Estimating** — widely used by independent contractors
- **NHBA Cost of Construction Survey** — framing/structural
- Real job data once calibration has ≥ 10 samples per trade

The calibration engine will correct systematic bias over time, but it cannot correct a
range that is so wide it is useless. Tight, accurate starting ranges mean calibration
converges faster.

### 13.2 Single-trade calibration key

Currently, calibration is keyed by `project_family` (the first trade context from the
LLM extraction). A job tagged `['plumbing', 'carpentry']` calibrates only the `plumbing`
key. The architecture of `business_assembly_calibration` supports per-assembly keys
(`calibration_key` = assembly code), but the write path in `recomputeCalibration()` only
uses trade family today.

**Future improvement:** When `estimation_runs.baseline_estimate.assemblyUsed` is set,
recompute a third, more specific key: the assembly code itself. Add a third lookup in
`processBooking.js`:
```javascript
await loadBusinessCalibration(supabase, businessId, assemblyCode)
  ?? await loadBusinessCalibration(supabase, businessId, projectFamily)
  ?? await loadBusinessCalibration(supabase, businessId, 'all')
```

### 13.3 Mean is sensitive to outliers

The raw multiplier is a simple mean. With 3–5 samples, one outlier job (e.g. a
multi-day emergency repair logged as 3 hours because the contractor forgot to split it)
can move the mean significantly. Bayesian shrinkage reduces this problem but doesn't
eliminate it.

**Alternative approaches to evaluate:**
- **Trimmed mean** (drop highest/lowest): robust to single outliers
- **Median**: fully robust, but slower to respond to real shifts
- **Exponential weighted mean**: more recent jobs count more (useful if labor costs shift
  with inflation or the contractor improves)
- **Per-assembly P50/P90** instead of single multiplier: captures skew better for jobs
  with high variance (e.g. water damage repair)

### 13.4 Travel time model is approximate

```
travelHours = (miles × 2) / 30
```

30 mph is a reasonable average for mixed urban/suburban driving. This model ignores:
- Rush hour
- Interstate vs surface streets
- Actual Google Maps travel time (which is available on the booking record)

**Improvement:** Store actual drive time from Google Maps on the booking and use it
instead of the formula.

### 13.5 Procurement hours are fixed

`procurementHours = 0.50` for every job regardless of scope. A simple fence repair needs
15 minutes at the lumber yard; a full bathroom remodel needs 3 hours across multiple
suppliers. This is a known oversimplification.

**Improvement:** Add a `procurementComplexity` field to assemblies/components that scales
procurement hours (e.g. `low = 0.25`, `standard = 0.50`, `high = 1.5`).

### 13.6 Helper model not implemented

`helperCashRatePerHour` is set in config but `helperLaborCost` is always $0.
If the contractor uses helpers, every job's direct cost is understated.

### 13.7 No seasonal or demand adjustment

The current model has no awareness of seasonal demand swings (summer = busy, winter =
slow for many trades) or geographic market rate variation. The weekly capacity model
partially compensates for this — a slow week makes the system more aggressive — but
doesn't model it explicitly.

### 13.8 Confidence score is additive, not Bayesian

The confidence score accumulated through Stages 1 and 2 is a sum of deltas:
```
confidence = assemblyConfidence + conditionDeltas + unknownPenalties
```

This is a heuristic, not a calibrated probability. A confidence of 0.72 does not mean
"72% chance the actual cost falls within the range." It means "fewer penalty flags were
triggered than a job scoring 0.60."

**For now:** Treat confidence as an ordinal signal (higher = more reliable) rather than
a probability. The 0.70 threshold for caution is similarly heuristic and should be tuned
against historical accuracy data once enough actuals are recorded.

---

*Last updated: 2026-11-22. Source of truth: `src/estimator/estimator.ts`, `src/estimator/decision.ts`, `src/estimator/weekContext.ts`, `netlify/functions/_shared/supabase.js` (recomputeCalibration, loadBusinessCalibration), `netlify/functions/record-job-actuals.js`.*
