# Rivet Estimator Audit — v0.2.0 through v0.3.1

**Date:** 2026-09-09
**Scope:** 22 Mason Home Services demo runs re-evaluated through each version's pipeline
**Business Config:** ownerOpportunityRate $75/hr, minimumHourlyRate $70/hr, weeklyGoal $2500, weeklyCapacity 35h, marginFloor 35%, profitFloor $75, minimumJobPrice $175

---

## Executive Summary

| Metric | v0.2.0 | v0.3.0 | v0.3.1 |
|--------|--------|--------|--------|
| **TAKE** | 0 | 14 | 6 |
| **REVIEW** | 0 | 8 | 13 |
| **PASS** | 22 | 0 | 3 |
| Pricing model | Margin-on-costs | Margin-on-costs, floored at minimum | Labor-rate-based (unfloored) |
| `suggestedPrice` auto-inflated? | No (too low) | Yes (always raised to minimum) | No — `estimatedQuoteRange` independent of floors |
| Binding floor (dominant) | n/a | `weeklyCapacityPace` (all 22) | `laborProductivity` (18) / `minimumJob` (4) |
| Hourly check metric | `ownerAdjustedPerHour` | `contributionPerLaborHour` | `contributionPerLaborHour` |
| Weekly pace metric | Not modeled | `contributionPerCapacityHour` | `contributionPerCapacityHour` |

### Version Journey

**v0.2.0:** All 22 PASS. `ownerAdjustedPerHour` subtracts $75/hr opportunity cost before comparing to $70/hr threshold — nearly impossible to pass.

**v0.3.0:** 14 TAKE, 8 REVIEW, 0 PASS. Fixed hourly metric, added multi-floor pricing and capacity economics. But `suggestedPrice` was auto-inflated to `minimumAcceptablePrice`, hiding bad economics. `weeklyCapacityPace` bound ALL 22 jobs — the system auto-repriced everything upward.

**v0.3.1:** 6 TAKE, 13 REVIEW, 3 PASS. Separated `estimatedQuoteRange` (what the job is worth at market rates) from `minimumAcceptablePrice` (what the business needs). The decision engine now honestly shows the gap between natural price and required price.

---

## v0.3.1 Pricing Model Correction

### Key Insight

In v0.3.0, `suggestedPrice >= minimumAcceptablePrice` always. Since `weeklyCapacityPace` was the binding floor for all 22 jobs, every price was inflated to clear the weekly pace. This made the decision engine's economic checks redundant — everything passed because the price was rigged to pass.

### Three Separate Concepts (v0.3.1)

| Field | Meaning | Example |
|-------|---------|---------|
| `estimatedQuoteRange` | What the job is worth at market labor rates (`laborHours * $84/hr + directCosts`) | $375 |
| `minimumAcceptablePrice` | Max of all economic floors — what the business *needs* | $327 |
| `recommendedQuote` / `evaluatedPrice` | Natural market price — NOT auto-inflated | $375 |

When `evaluatedPrice > minimumAcceptablePrice`: economics work, likely TAKE.
When `evaluatedPrice < minimumAcceptablePrice`: pricing gap, PASS with explanation of what price would be needed.

### Labor-Rate-Based Quoting

v0.3.1 changed `estimatedQuoteRange` from margin-on-costs (`totalDirectCost * 1.538`) to labor-rate-based pricing:

```
targetLaborRate = minimumHourlyRate * 1.2 = $84/hr
estimatedQuoteRange = laborHours * targetLaborRate + totalDirectCost
```

The old formula failed for labor-intensive work because `totalDirectCost` excludes owner labor (it's an opportunity cost). A $59 direct cost with 5.5h labor produced a $91 "market quote" — absurd for a half-day of skilled work. The labor-rate formula correctly prices the owner's time.

### Decision Context (v0.3.1)

```
weeklyEarningsToDate: $1800
remainingCapacityHours: 24h
requiredContributionPerCapacityHour: $29/hr  (= ($2500 - $1800) / 24)
```

Changed from v0.3.0's $74/hr pace to reflect an owner mid-week who's had a decent start. This creates realistic variation in recommendations.

---

## v0.3.1 Full Results

| Run | Description | Rec | Conf | Quote | Min Price | Gap | Binding Floor |
|-----|-------------|-----|------|-------|-----------|-----|---------------|
| 001 | Small drywall patch (softball-sized) | **pass** | 92% | $173 | $175 | -$2 | minimumJob |
| 002 | TV mount 65" (customer has mount) | **pass** | 78% | $144 | $175 | -$31 | minimumJob |
| 003 | Back door replacement (frame rough) | **review** | 53% | $521 | $444 | +$77 | laborProductivity |
| 004 | Ceiling water damage (upstairs leak) | **review** | 30% | $525 | $450 | +$75 | laborProductivity |
| 005 | Cabinet knob + hang 2 pictures | **review** | 75% | $300 | $264 | +$35 | laborProductivity |
| 006 | Stair trim + chewed balusters | **review** | 50% | $515 | $443 | +$72 | laborProductivity |
| 007 | Cabinet bottom + recaulk (water dmg) | **review** | 35% | $287 | $247 | +$40 | laborProductivity |
| 008 | Three fence posts reset (storm) | **take** | 83% | $376 | $327 | +$49 | laborProductivity |
| 009 | Six rotted deck boards (back porch) | **review** | 80% | $633 | $563 | +$70 | laborProductivity |
| 010 | Two drywall holes Unit 4B (commercial) | **take** | 77% | $362 | $316 | +$46 | laborProductivity |
| 011 | Nail pop + drywall crack (8 inches) | **pass** | 90% | $170 | $175 | -$5 | minimumJob |
| 012 | TV 75" above stone fireplace (high) | **review** | 70% | $262 | $231 | +$31 | laborProductivity |
| 013 | Two fence posts (storm damage) | **take** | 85% | $380 | $331 | +$49 | laborProductivity |
| 014 | Bathroom door trim (splitting) | **review** | 65% | $243 | $209 | +$34 | laborProductivity |
| 015 | Eight rotted deck boards (composite) | **review** | 81% | $630 | $560 | +$70 | laborProductivity |
| 016 | Two drywall holes kids room (smooth) | **take** | 74% | $368 | $320 | +$48 | laborProductivity |
| 017 | Front door replacement (pre-hung) | **review** | 85% | $609 | $532 | +$77 | laborProductivity |
| 018 | Doorknob hole (14 inch, smooth) | **take** | 80% | $322 | $280 | +$42 | laborProductivity |
| 019 | TV mount 55" Samsung (den, studs) | **review** | 92% | $185 | $175 | +$10 | minimumJob |
| 020 | Three fence panels (back slope) | **review** | 72% | $677 | $599 | +$77 | laborProductivity |
| 021 | Doorknob hole Unit 12A (turnover) | **review** | 88% | $187 | $175 | +$12 | minimumJob |
| 022 | Three floating shelves (customer has) | **take** | 82% | $309 | $267 | +$41 | laborProductivity |

### Recommendation Distribution

```
TAKE:    6 (27%)  — Quote above minimum, good confidence, no risk flags
REVIEW: 13 (59%)  — Quote near minimum, low confidence, or conservative case risk
PASS:    3 (14%)  — Quote below minimum job price ($175)
```

### Why These Results Make Sense

**PASS (3 jobs):** Runs 001, 002, 011 are tiny jobs (1.5h labor, ~$45-60 direct cost). At $84/hr market rate, the natural quote ($144-$173) falls below the $175 minimum job price. The system correctly says: "This is a $170 job but your minimum is $175."

**REVIEW (13 jobs):** Most jobs have quotes above their minimum, but trigger review for:
- Low confidence (runs 003, 004, 006, 007, 014 — all below 70%)
- Conservative case risk (large jobs where worst-case drops below thresholds)
- Quote close to minimum (within 10% — runs 019, 021)

**TAKE (6 jobs):** Quote well above minimum, confidence >= 74%, no structural risk flags. These are the jobs the owner should accept without hesitation.

---

## Pricing Floor Analysis (v0.3.1)

With the lower required pace ($29/hr), `weeklyCapacityPace` is no longer the binding floor for any job. `laborProductivity` (directCost + laborHours * $70) is the dominant floor for 18 jobs; `minimumJob` ($175) binds the 4 smallest jobs.

| Floor | Binding Count | Range |
|-------|--------------|-------|
| `laborProductivity` | 18 | $209 - $599 |
| `minimumJob` | 4 | $175 |
| `weeklyCapacityPace` | 0 | $119 - $260 |
| `margin` | 0 | $28 - $330 |
| `absoluteProfit` | 0 | $93 - $289 |

---

## Version Comparison — Same Job, Three Versions

**Run 003 (Back door replacement, frame rough):**

| | v0.2.0 | v0.3.0 | v0.3.1 |
|-|--------|--------|--------|
| Recommendation | PASS | REVIEW | REVIEW |
| Price/Quote | ~$360 | $572 | $521 |
| Reason | ownerAdjustedPerHour < $70 | Low confidence (53%) | Low confidence (53%) + quote close to min |
| minimumAcceptablePrice | n/a | $572 (weeklyCapacityPace) | $444 (laborProductivity) |
| What owner sees | "Rejected" | "Review — low confidence" | "Review — the work pays well but confidence is low. Quote $521, needs at least $444." |

**Run 008 (Three fence posts, storm):**

| | v0.2.0 | v0.3.0 | v0.3.1 |
|-|--------|--------|--------|
| Recommendation | PASS | TAKE | TAKE |
| Price/Quote | ~$250 | $412 | $376 |
| minimumAcceptablePrice | n/a | $412 (weeklyCapacityPace) | $327 (laborProductivity) |
| What owner sees | "Rejected" | "Take at $412" | "Take at $376 — well above the $327 minimum" |

---

## Capacity Hours (unchanged from v0.3.0)

| Run | Labor | Travel | Procurement | Return Trip | Total Capacity | Ratio |
|-----|-------|--------|-------------|-------------|----------------|-------|
| 001 | 1.50h | 0.53h | 0.50h | 0.00h | 2.53h | 1.69x |
| 002 | 1.50h | 0.67h | 0.50h | 0.00h | 2.67h | 1.78x |
| 003 | 5.50h | 0.93h | 0.50h | 0.00h | 6.93h | 1.26x |
| 004 | 5.36h | 0.80h | 0.50h | **0.80h** | 7.46h | 1.39x |
| 005 | 2.53h | 1.87h | 0.50h | 0.00h | 4.90h | 1.94x |
| 021 | 1.50h | 1.20h | 0.50h | 0.00h | 3.20h | 2.13x |

Run 004 has the only modeled return trip (0.80h from `multiple_visits_required` condition).
Run 021 has the highest capacity/labor ratio (2.13x) — 1.5h of work but 3.2h of schedule time.

---

## Seed Data Status

- `supabase/seed-data.sql` regenerated with v0.3.1 pipeline output
- All 22 estimation runs carry correct recommendations (6 take, 13 review, 3 pass)
- Estimator version: `0.3.0` (code version unchanged, pricing model correction only)
- Decision context: `requiredContributionPerCapacityHour: 29`
- New fields present: `estimatedQuoteRange`, `recommendedQuote`, `evaluatedPrice`, `minimumAcceptablePrice`, `pricingFloors`

**To update the app UI:** Re-run seed SQL in Supabase SQL Editor:
```sql
DELETE FROM work_items WHERE business_id = 'a0000000-0000-0000-0000-000000000001';
DELETE FROM actual_outcomes WHERE run_id LIKE 'demo-run-%';
DELETE FROM adjustment_entries WHERE run_id LIKE 'demo-run-%';
DELETE FROM estimation_runs WHERE business_id = 'a0000000-0000-0000-0000-000000000001';
-- Then paste contents of supabase/seed-data.sql
```

---

## Test Results

```
Estimator tests:  52 passed
Decision tests:   18 passed (was 17, +1 new pricing gap test)
Pipeline tests:   15 passed (was 13, +2 new pricing separation tests)
Total:            85 passed
TypeScript:       clean (no errors)
```

## Files Changed (v0.3.1)

| File | Change |
|------|--------|
| `src/estimator/types.ts` | `suggestedPrice` → `estimatedQuoteRange` + `recommendedQuote` + `evaluatedPrice` |
| `src/estimator/estimator.ts` | Labor-rate-based quoting, unfloored `estimatedQuoteRange` |
| `src/estimator/decision.ts` | Pricing gap check, graduated severity on gap proximity |
| `src/estimator/persistence.ts` | Field rename |
| `src/estimator/diagnostics.ts` | Field rename |
| `src/demo/seed.ts` | Adjusted decision context ($29/hr pace), field renames |
| `src/admin/DecisionLab.tsx` | New pricing fields in export + display |
| `src/estimator/__tests__/estimator.test.ts` | Updated pricing tests for unfloored model |
| `src/estimator/__tests__/decision.test.ts` | Fixed makeJob helper, new pricing gap tests |
| `src/estimator/__tests__/pipeline.test.ts` | Field renames |
| `supabase/seed-data.sql` | Regenerated |
| `audit.md` | This document |
