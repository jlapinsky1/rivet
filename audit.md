# Rivet Estimator v0.3.0 Audit

**Date:** 2026-09-09
**Scope:** 22 Mason Home Services demo runs re-evaluated through the v0.3.0 pipeline
**Business Config:** ownerOpportunityRate $75/hr, minimumHourlyRate $70/hr, weeklyGoal $2500, weeklyCapacity 35h, marginFloor 35%, profitFloor $75, minimumJobPrice $175
**Decision Context:** Tuesday mid-week — $875 earned, 22h remaining, $74/hr required pace

---

## Executive Summary

| Metric | v0.2.0 (Before) | v0.3.0 (After) |
|--------|-----------------|-----------------|
| **TAKE** | 0 | 14 |
| **REVIEW** | 0 | 8 |
| **PASS** | 22 | 0 |
| Pricing floor system | Single margin-based | 5 independent floors |
| Binding floor | n/a | `weeklyCapacityPace` (all 22) |
| Hourly check metric | `ownerAdjustedPerHour` | `contributionPerLaborHour` |
| Weekly pace metric | Not modeled | `contributionPerCapacityHour` |
| Return trip modeling | Not modeled | Modeled from condition `returnTripRisk` |
| Confidence overlap dedup | Not present | Active (water_damage + extent_of_water_damage) |
| Risk flag dedup | Not present | Active (`[...new Set()]`) |
| Numeric precision | Floating-point noise | Rounded to 2 decimal places |

### Root Cause of All-Pass in v0.2.0

The decision engine checked `ownerAdjustedPerHour` (contribution profit minus owner opportunity cost, divided by labor hours) against `minimumHourlyRate`. This metric subtracts $75/hr from the profit *before* comparing to the $70/hr threshold, making it nearly impossible to pass. The pricing formula also didn't account for capacity-hour economics, so `suggestedPrice` was too low to generate adequate per-hour returns.

### What Changed

1. **Hourly acceptance** now checks `contributionPerLaborHour` (contribution profit / labor hours) — the owner opportunity cost is no longer subtracted before comparison
2. **Pricing floors** enforce five independent minimums, with `suggestedPrice` floored at `max(all floors)`
3. **Weekly pace** uses `contributionPerCapacityHour` (contribution profit / total schedule hours consumed) with graduated severity instead of binary pass/fail
4. **Capacity hours** properly model labor + travel + procurement + return trips

---

## Before: v0.2.0 Results (from Decision Lab export 2026-09-09)

All 22 runs recommended **PASS**. Every job was rejected.

| Run | Description | Rec | Conf | Suggested Price | Reason |
|-----|-------------|-----|------|----------------|--------|
| 001 | Small drywall patch | pass | 92% | ~$110 | ownerAdjustedPerHour below $70 minimum |
| 002 | TV mount (customer supplied) | pass | 78% | ~$53 | ownerAdjustedPerHour below $70 minimum |
| 003 | Back door replacement | pass | 53% | ~$360 | ownerAdjustedPerHour below $70 minimum |
| 004 | Ceiling water damage repair | pass | 30% | ~$320 | ownerAdjustedPerHour below $70 minimum |
| 005 | Cabinet knob + pictures | pass | 75% | ~$115 | ownerAdjustedPerHour below $70 minimum |
| 006 | Stair trim + balusters | pass | 50% | ~$275 | ownerAdjustedPerHour below $70 minimum |
| 007 | Cabinet bottom + recaulk | pass | 35% | ~$135 | ownerAdjustedPerHour below $70 minimum |
| 008 | Three fence posts reset | pass | 83% | ~$250 | ownerAdjustedPerHour below $70 minimum |
| 009 | Six rotted deck boards | pass | 80% | ~$430 | ownerAdjustedPerHour below $70 minimum |
| 010 | Two drywall holes (commercial) | pass | 77% | ~$245 | ownerAdjustedPerHour below $70 minimum |
| 011 | Nail pop + crack | pass | 90% | ~$105 | ownerAdjustedPerHour below $70 minimum |
| 012 | TV above stone fireplace | pass | 70% | ~$175 | ownerAdjustedPerHour below $70 minimum |
| 013 | Two fence posts | pass | 85% | ~$265 | ownerAdjustedPerHour below $70 minimum |
| 014 | Bathroom door trim | pass | 65% | ~$150 | ownerAdjustedPerHour below $70 minimum |
| 015 | Eight rotted deck boards | pass | 81% | ~$430 | ownerAdjustedPerHour below $70 minimum |
| 016 | Two drywall holes (kids room) | pass | 74% | ~$225 | ownerAdjustedPerHour below $70 minimum |
| 017 | Front door replacement | pass | 85% | ~$400 | ownerAdjustedPerHour below $70 minimum |
| 018 | Doorknob hole (medium) | pass | 80% | ~$210 | ownerAdjustedPerHour below $70 minimum |
| 019 | TV mount (55 inch) | pass | 92% | ~$145 | ownerAdjustedPerHour below $70 minimum |
| 020 | Three fence panels | pass | 72% | ~$440 | ownerAdjustedPerHour below $70 minimum |
| 021 | Doorknob hole (commercial) | pass | 88% | ~$145 | ownerAdjustedPerHour below $70 minimum |
| 022 | Three floating shelves | pass | 82% | ~$195 | ownerAdjustedPerHour below $70 minimum |

**Diagnosis:** The metric `ownerAdjustedPerHour` subtracts $75/hr opportunity cost from contribution profit before dividing by labor hours. For a $110 job with 1.5h labor and $47 direct cost: contribution profit = $63, owner cost = $112, owner-adjusted profit = -$49, ownerAdjustedPerHour = -$33. This is below $70, so the engine says PASS — even though the job earns $42/hr in *actual cash* contribution.

---

## After: v0.3.0 Results

### Full Results Table

| Run | Description | Rec | Conf | Price | $/work hr | $/sched hr | Labor | Capacity | Binding Floor |
|-----|-------------|-----|------|-------|-----------|------------|-------|----------|---------------|
| 001 | Small drywall patch (softball-sized) | **take** | 92% | $235 | $125 | $74 | 1.5h | 2.5h | weeklyCapacityPace |
| 002 | TV mount 65" (customer has mount) | **take** | 78% | $216 | $132 | $74 | 1.5h | 2.7h | weeklyCapacityPace |
| 003 | Back door replacement (frame rough) | **review** | 53% | $572 | $93 | $74 | 5.5h | 6.9h | weeklyCapacityPace |
| 004 | Ceiling water damage (upstairs leak) | **review** | 30% | $627 | $103 | $74 | 5.4h | 7.5h | weeklyCapacityPace |
| 005 | Cabinet knob + hang 2 pictures | **take** | 75% | $450 | $143 | $74 | 2.5h | 4.9h | weeklyCapacityPace |
| 006 | Stair trim + chewed balusters | **review** | 50% | $555 | $92 | $74 | 5.2h | 6.4h | weeklyCapacityPace |
| 007 | Cabinet bottom + recaulk (water dmg) | **review** | 35% | $340 | $102 | $74 | 2.9h | 4.0h | weeklyCapacityPace |
| 008 | Three fence posts reset (storm) | **take** | 83% | $412 | $94 | $74 | 3.5h | 4.5h | weeklyCapacityPace |
| 009 | Six rotted deck boards (back porch) | **review** | 80% | $694 | $96 | $74 | 5.0h | 6.5h | weeklyCapacityPace |
| 010 | Two drywall holes Unit 4B (commercial) | **take** | 77% | $455 | $112 | $74 | 3.3h | 5.0h | weeklyCapacityPace |
| 011 | Nail pop + drywall crack (8 inches) | **take** | 90% | $222 | $118 | $74 | 1.5h | 2.4h | weeklyCapacityPace |
| 012 | TV 75" above stone fireplace (high) | **take** | 70% | $336 | $118 | $74 | 2.2h | 3.5h | weeklyCapacityPace |
| 013 | Two fence posts (storm damage) | **take** | 85% | $431 | $99 | $74 | 3.5h | 4.7h | weeklyCapacityPace |
| 014 | Bathroom door trim (splitting) | **review** | 65% | $295 | $106 | $74 | 2.4h | 3.4h | weeklyCapacityPace |
| 015 | Eight rotted deck boards (composite) | **review** | 81% | $681 | $94 | $74 | 5.0h | 6.4h | weeklyCapacityPace |
| 016 | Two drywall holes kids room (smooth) | **take** | 74% | $415 | $98 | $74 | 3.5h | 4.6h | weeklyCapacityPace |
| 017 | Front door replacement (pre-hung) | **take** | 85% | $646 | $91 | $74 | 5.5h | 6.7h | weeklyCapacityPace |
| 018 | Doorknob hole (14 inch, smooth) | **take** | 80% | $363 | $98 | $74 | 3.0h | 4.0h | weeklyCapacityPace |
| 019 | TV mount 55" Samsung (den, studs) | **take** | 92% | $247 | $125 | $74 | 1.5h | 2.5h | weeklyCapacityPace |
| 020 | Three fence panels (back slope) | **review** | 72% | $737 | $95 | $74 | 5.5h | 7.1h | weeklyCapacityPace |
| 021 | Doorknob hole Unit 12A (turnover) | **take** | 88% | $298 | $158 | $74 | 1.5h | 3.2h | weeklyCapacityPace |
| 022 | Three floating shelves (customer has) | **take** | 82% | $365 | $103 | $74 | 3.0h | 4.1h | weeklyCapacityPace |

### Recommendation Distribution

```
TAKE:   14 (64%)  — Good economics + adequate confidence
REVIEW:  8 (36%)  — Good economics but low confidence or conservative case risk
PASS:    0 (0%)   — No jobs fail static thresholds at these prices
```

### Why No PASS?

The multi-floor pricing system ensures `suggestedPrice >= minimumAcceptablePrice`, which is the max of all five floors. Since the price is set high enough to clear every threshold, no job fails the static checks. PASS would occur when:
- A job can't physically fit in the remaining schedule (capacity scarcity)
- The handyman manually prices below the minimum acceptable price
- Context shifts (e.g., only 3 hours left in the week)

This is correct behavior — the engine is now pricing *and* evaluating consistently.

---

## TAKE Jobs (14) — Detail

All TAKE jobs share these characteristics:
- Confidence >= 70% (the `confidenceThreshold`)
- Conservative case doesn't fall below profit thresholds
- No structural or water damage risk flags

| Run | Confidence | $/work hr | $/sched hr | Price | Reason Summary |
|-----|-----------|-----------|------------|-------|----------------|
| 001 | 92% | $125 | $74 | $235 | Clean assembly match, no conditions |
| 002 | 78% | $132 | $74 | $216 | Assembly match, customer-supplied (minor risk only) |
| 005 | 75% | $143 | $74 | $450 | Component path, no risk flags |
| 008 | 83% | $94 | $74 | $412 | Assembly match, no conditions |
| 010 | 77% | $112 | $74 | $455 | Assembly match, commercial (Riverside) |
| 011 | 90% | $118 | $74 | $222 | Assembly match, simplest job in set |
| 012 | 70% | $118 | $74 | $336 | Assembly match, barely above confidence threshold |
| 013 | 85% | $99 | $74 | $431 | Assembly match, clean |
| 016 | 74% | $98 | $74 | $415 | Assembly match, finish matching condition |
| 017 | 85% | $91 | $74 | $646 | Assembly match, full door replacement |
| 018 | 80% | $98 | $74 | $363 | Assembly match, medium drywall |
| 019 | 92% | $125 | $74 | $247 | Assembly match, simplest TV mount |
| 021 | 88% | $158 | $74 | $298 | Assembly match, commercial turnover |
| 022 | 82% | $103 | $74 | $365 | Component path, customer-supplied material |

---

## REVIEW Jobs (8) — Detail

Every REVIEW is triggered by **confidence below 70%** or **conservative case risk**, not by pricing failures.

| Run | Confidence | Trigger | Risk Flags | Price |
|-----|-----------|---------|------------|-------|
| 003 | **53%** | Low confidence + unknown substrate | unknown_substrate, customer_supplied_compatibility | $572 |
| 004 | **30%** | Low confidence + water damage + return trip | hidden_water_damage | $627 |
| 006 | **50%** | Low confidence (custom component job, finish matching) | — | $555 |
| 007 | **35%** | Low confidence + water damage | hidden_water_damage | $340 |
| 009 | **80%** | Conservative case falls below thresholds | — | $694 |
| 014 | **65%** | Low confidence (just below 70%) | — | $295 |
| 015 | **81%** | Conservative case falls below thresholds | — | $681 |
| 020 | **72%** | Conservative case falls below thresholds | — | $737 |

**Review triggers breakdown:**
- 5 jobs: confidence below 70% threshold (runs 003, 004, 006, 007, 014)
- 3 jobs: conservative estimate may fall below profit thresholds (runs 009, 015, 020)
- 2 jobs: structural/water risk flags (runs 003, 004 overlap with low confidence)

---

## Pricing Floor Analysis

All 22 jobs are bound by `weeklyCapacityPace`. This means the weekly schedule pace ($74/hr required) is the tightest constraint for every job.

### Pricing Floor Comparison (all 22 jobs)

| Run | Min Job | Margin | Abs Profit | Labor Prod | Capacity Pace | **Binding** |
|-----|---------|--------|------------|------------|---------------|-------------|
| 001 | $175 | $73 | $122 | $152 | **$235** | weeklyCapacityPace |
| 002 | $175 | $28 | $93 | $123 | **$216** | weeklyCapacityPace |
| 003 | $175 | $91 | $134 | $444 | **$572** | weeklyCapacityPace |
| 004 | $175 | $115 | $150 | $450 | **$627** | weeklyCapacityPace |
| 005 | $175 | $134 | $162 | $264 | **$450** | weeklyCapacityPace |
| 006 | $175 | $125 | $156 | $443 | **$555** | weeklyCapacityPace |
| 007 | $175 | $72 | $122 | $247 | **$340** | weeklyCapacityPace |
| 008 | $175 | $126 | $157 | $327 | **$412** | weeklyCapacityPace |
| 009 | $175 | $328 | $288 | $563 | **$694** | weeklyCapacityPace |
| 010 | $175 | $131 | $160 | $316 | **$455** | weeklyCapacityPace |
| 011 | $175 | $68 | $119 | $149 | **$222** | weeklyCapacityPace |
| 012 | $175 | $118 | $152 | $231 | **$336** | weeklyCapacityPace |
| 013 | $175 | $132 | $161 | $331 | **$431** | weeklyCapacityPace |
| 014 | $175 | $63 | $116 | $209 | **$295** | weeklyCapacityPace |
| 015 | $175 | $323 | $285 | $560 | **$681** | weeklyCapacityPace |
| 016 | $175 | $121 | $154 | $320 | **$415** | weeklyCapacityPace |
| 017 | $175 | $227 | $222 | $532 | **$646** | weeklyCapacityPace |
| 018 | $175 | $107 | $145 | $280 | **$363** | weeklyCapacityPace |
| 019 | $175 | $91 | $134 | $164 | **$247** | weeklyCapacityPace |
| 020 | $175 | $330 | $289 | $599 | **$737** | weeklyCapacityPace |
| 021 | $175 | $94 | $136 | $166 | **$298** | weeklyCapacityPace |
| 022 | $175 | $94 | $136 | $267 | **$365** | weeklyCapacityPace |

The capacity pace floor ranges from $216 (simple TV mount) to $737 (three fence panels on a slope). It always exceeds the other four floors because the $74/hr required capacity pace, multiplied by total schedule hours, dominates.

---

## Capacity Hours Breakdown

| Run | Labor | Travel | Procurement | Return Trip | Total Capacity | Ratio (Cap/Labor) |
|-----|-------|--------|-------------|-------------|----------------|-------------------|
| 001 | 1.50h | 0.53h | 0.50h | 0.00h | 2.53h | 1.69x |
| 002 | 1.50h | 0.67h | 0.50h | 0.00h | 2.67h | 1.78x |
| 003 | 5.50h | 0.93h | 0.50h | 0.00h | 6.93h | 1.26x |
| 004 | 5.36h | 0.80h | 0.50h | **0.80h** | 7.46h | 1.39x |
| 005 | 2.53h | 1.87h | 0.50h | 0.00h | 4.90h | 1.94x |
| 006 | 5.16h | 0.73h | 0.50h | 0.00h | 6.40h | 1.24x |
| 007 | 2.86h | 0.60h | 0.50h | 0.00h | 3.96h | 1.38x |
| 008 | 3.50h | 0.47h | 0.50h | 0.00h | 4.47h | 1.28x |
| 009 | 5.00h | 1.00h | 0.50h | 0.00h | 6.50h | 1.30x |
| 010 | 3.30h | 1.20h | 0.50h | 0.00h | 5.00h | 1.52x |
| 011 | 1.50h | 0.40h | 0.50h | 0.00h | 2.40h | 1.60x |
| 012 | 2.20h | 0.80h | 0.50h | 0.00h | 3.50h | 1.59x |
| 013 | 3.50h | 0.67h | 0.50h | 0.00h | 4.67h | 1.33x |
| 014 | 2.40h | 0.53h | 0.50h | 0.00h | 3.43h | 1.43x |
| 015 | 5.00h | 0.87h | 0.50h | 0.00h | 6.37h | 1.27x |
| 016 | 3.45h | 0.60h | 0.50h | 0.00h | 4.55h | 1.32x |
| 017 | 5.50h | 0.73h | 0.50h | 0.00h | 6.73h | 1.22x |
| 018 | 3.00h | 0.47h | 0.50h | 0.00h | 3.97h | 1.32x |
| 019 | 1.50h | 0.53h | 0.50h | 0.00h | 2.53h | 1.69x |
| 020 | 5.50h | 1.07h | 0.50h | 0.00h | 7.07h | 1.29x |
| 021 | 1.50h | 1.20h | 0.50h | 0.00h | 3.20h | 2.13x |
| 022 | 2.95h | 0.67h | 0.50h | 0.00h | 4.12h | 1.40x |

**Key observations:**
- Capacity/labor ratio ranges from 1.22x (large jobs where travel is proportionally small) to 2.13x (small commercial job with long drive)
- Run 004 (ceiling water damage) is the only job with modeled return trip hours (0.80h) due to `multiple_visits_required` condition
- Run 005 (cabinet knob + pictures) has the highest travel proportion (1.87h travel for 2.53h labor) — a far drive for a quick job
- Run 021 (commercial turnover) has the highest capacity/labor ratio (2.13x) — 1.5h of work but 3.2h of schedule time due to far commercial property

---

## Confidence Overlap Dedup in Action

**Run 004** (ceiling water damage):
- Condition `water_damage` already applies -10% confidence with description "hidden extent unknown"
- Unknown `extent_of_water_damage` would normally apply an additional -5%
- v0.3.0 dedup detects the overlap and skips the redundant penalty
- Breakdown includes: `CONF_DEDUP: Unknowns already covered by conditions (no extra penalty): extent_of_water_damage`
- Final confidence: 30% (was 25% without dedup — a 5 percentage point improvement)

---

## New Metrics Exposed

### Per-Job (EconomicJob)

| Field | Type | Description |
|-------|------|-------------|
| `contributionPerLaborHour` | Range | Contribution profit / labor hours — work productivity |
| `contributionPerCapacityHour` | number | Contribution profit / capacity hours — schedule productivity |
| `minimumAcceptablePrice` | number | Scalar floor = max(all pricing floors) |
| `pricingFloors` | object | All 5 floor values + binding constraint name |
| `travelHours` | number | Roundtrip travel at 30 mph |
| `returnTripHours` | number | Return trip capacity from condition modifiers |

### Decision Engine Reasons

Plain-English reasons now distinguish **"work hour"** (labor productivity) from **"schedule hour"** (capacity productivity):

- *"Earns $125 per **work hour**, meets $70 minimum"* — labor check
- *"This job earns about $74 per **schedule hour**, above the $74/hr pace needed"* — capacity check

---

## Seed Data Status

- `supabase/seed-data.sql` regenerated with v0.3.0 pipeline output
- All 22 estimation runs carry correct recommendations (14 take, 8 review)
- All 22 work items carry matching recommendation values
- Estimator version bumped to `0.3.0` in all records
- Decision context includes `requiredContributionPerCapacityHour: 74`
- Pricing floors and new economic fields are present in all `economic_job` JSON

**To update the app UI:** Re-run seed SQL in Supabase SQL Editor:
```sql
-- Clear existing demo data
DELETE FROM work_items WHERE business_id = 'a0000000-0000-0000-0000-000000000001';
DELETE FROM actual_outcomes WHERE run_id LIKE 'demo-run-%';
DELETE FROM adjustment_entries WHERE run_id LIKE 'demo-run-%';
DELETE FROM estimation_runs WHERE business_id = 'a0000000-0000-0000-0000-000000000001';

-- Then paste contents of supabase/seed-data.sql
```

---

## Files Changed (v0.3.0)

| File | Lines Changed | What |
|------|--------------|------|
| `src/estimator/types.ts` | +33 | PricingFloors type, EconomicJob extension, DecisionContext rename, version bump |
| `src/estimator/estimator.ts` | +219 -30 | Multi-floor pricing, return trip modeling, capacity calc, rounding, confidence dedup, risk flag dedup |
| `src/estimator/decision.ts` | +44 -12 | contributionPerLaborHour checks, graduated weekly pace severity, plain-English reasons |
| `src/estimator/diagnostics.ts` | +120 (new) | summarizeDecisionLab() helper |
| `src/estimator/index.ts` | +5 | Re-exports for PricingFloors + diagnostics |
| `src/estimator/__tests__/estimator.test.ts` | +159 | 11 new tests (capacity, pricing, dedup, normalization) |
| `src/estimator/__tests__/decision.test.ts` | +129 -14 | Updated field names + 3 new labor-vs-capacity tests |
| `src/demo/seed.ts` | +4 -4 | Field rename + context passing |
| `src/admin/DecisionLab.tsx` | +62 -12 | Enhanced export, pricing floors display, work/schedule hour terminology |
| `ARCHITECTURE.md` | +85 -20 | Capacity hours, multi-floor pricing, decision engine, test counts |
| `CLAUDE.md` | +12 -4 | Invariants, test counts |
| `supabase/seed-data.sql` | regenerated | All 22 runs with v0.3.0 output |

## Test Results

```
Estimator tests:  52 passed (was 41)
Decision tests:   17 passed (was 14)
Pipeline tests:   13 passed (unchanged)
Total:            82 passed
TypeScript:       clean (no errors)
Build:            clean
```
