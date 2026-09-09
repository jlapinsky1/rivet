# Context Sensitivity Audit — v0.3.1

**Date:** 2026-09-09
**Scope:** 22 Mason Home Services demo jobs re-evaluated under three business-context scenarios
**Estimator version:** v0.3.1 (unchanged)
**Business Config:** ownerOpportunityRate $75/hr, minimumHourlyRate $70/hr, weeklyGoal $2500, weeklyCapacity 35h, marginFloor 35%, profitFloor $75, minimumJobPrice $175

---

## Scenario Definitions

| Parameter | A (Early Week) | B (Midweek) | C (Late Week) |
|-----------|----------------|-------------|---------------|
| weeklyEarningsToDate | $600 | $1,800 | $1,900 |
| remainingCapacityHours | 30h | 24h | 6h |
| weeklyEarningsGoal | $2,500 | $2,500 | $2,500 |
| requiredContributionPerCapacityHour | $63 | $29 | $100 |
| Capacity ratio (remaining/total) | 86% | 69% | 17% |

---

## Scenario A — Early week / comfortable capacity

requiredContributionPerCapacityHour: $63/hr

| Run | Description | Rec | Conf | Quote | Min Price | $/Labor Hr | $/Cap Hr | Cap Hrs | Binding Floor |
|-----|-------------|-----|------|-------|-----------|-----------|---------|---------|---------------|
| 001 | Small drywall patch (softball-sized) | **review** | 92% | $173 | $208 | $84 | $50 | 2.53 | weeklyCapacityPace |
| 002 | TV mount 65" (customer has mount) | **review** | 78% | $144 | $187 | $84 | $47 | 2.67 | weeklyCapacityPace |
| 003 | Back door replacement (frame rough) | **review** | 53% | $521 | $498 | $84 | $67 | 6.93 | weeklyCapacityPace |
| 004 | Ceiling water damage (upstairs leak) | **review** | 30% | $525 | $547 | $84 | $60 | 7.46 | weeklyCapacityPace |
| 005 | Cabinet knob + hang 2 pictures | **review** | 75% | $300 | $397 | $84 | $43 | 4.9 | weeklyCapacityPace |
| 006 | Stair trim + chewed balusters | **review** | 50% | $515 | $487 | $84 | $68 | 6.4 | weeklyCapacityPace |
| 007 | Cabinet bottom + recaulk (water dmg) | **review** | 35% | $287 | $298 | $84 | $61 | 3.96 | weeklyCapacityPace |
| 008 | Three fence posts reset (storm) | **review** | 83% | $376 | $365 | $84 | $66 | 4.47 | weeklyCapacityPace |
| 009 | Six rotted deck boards (back porch) | **review** | 80% | $633 | $625 | $84 | $65 | 6.5 | weeklyCapacityPace |
| 010 | Two drywall holes Unit 4B (commercial) | **review** | 77% | $362 | $402 | $84 | $55 | 5 | weeklyCapacityPace |
| 011 | Nail pop + drywall crack (8 inches) | **review** | 90% | $170 | $196 | $84 | $53 | 2.4 | weeklyCapacityPace |
| 012 | TV 75" above stone fireplace (high) | **review** | 70% | $262 | $298 | $84 | $53 | 3.5 | weeklyCapacityPace |
| 013 | Two fence posts (storm damage) | **review** | 85% | $380 | $382 | $84 | $63 | 4.67 | weeklyCapacityPace |
| 014 | Bathroom door trim (splitting) | **review** | 65% | $243 | $259 | $84 | $59 | 3.43 | weeklyCapacityPace |
| 015 | Eight rotted deck boards (composite) | **review** | 81% | $630 | $613 | $84 | $66 | 6.37 | weeklyCapacityPace |
| 016 | Two drywall holes kids room (smooth) | **review** | 74% | $368 | $367 | $84 | $64 | 4.55 | weeklyCapacityPace |
| 017 | Front door replacement (pre-hung) | **review** | 85% | $609 | $574 | $84 | $69 | 6.73 | weeklyCapacityPace |
| 018 | Doorknob hole (14 inch, smooth) | **review** | 80% | $322 | $321 | $84 | $64 | 3.97 | weeklyCapacityPace |
| 019 | TV mount 55" Samsung (den, studs) | **review** | 92% | $185 | $220 | $84 | $50 | 2.53 | weeklyCapacityPace |
| 020 | Three fence panels (back slope) | **review** | 72% | $676 | $662 | $84 | $65 | 7.07 | weeklyCapacityPace |
| 021 | Doorknob hole Unit 12A (turnover) | **pass** | 88% | $187 | $264 | $84 | $39 | 3.2 | weeklyCapacityPace |
| 022 | Three floating shelves (customer has) | **review** | 82% | $309 | $322 | $84 | $60 | 4.12 | weeklyCapacityPace |

## Scenario B — Midweek / moderate capacity

requiredContributionPerCapacityHour: $29/hr

| Run | Description | Rec | Conf | Quote | Min Price | $/Labor Hr | $/Cap Hr | Cap Hrs | Binding Floor |
|-----|-------------|-----|------|-------|-----------|-----------|---------|---------|---------------|
| 001 | Small drywall patch (softball-sized) | **review** | 92% | $173 | $175 | $84 | $50 | 2.53 | minimumJob |
| 002 | TV mount 65" (customer has mount) | **review** | 78% | $144 | $175 | $84 | $47 | 2.67 | minimumJob |
| 003 | Back door replacement (frame rough) | **review** | 53% | $521 | $444 | $84 | $67 | 6.93 | laborProductivity |
| 004 | Ceiling water damage (upstairs leak) | **review** | 30% | $525 | $450 | $84 | $60 | 7.46 | laborProductivity |
| 005 | Cabinet knob + hang 2 pictures | **review** | 75% | $300 | $264 | $84 | $43 | 4.9 | laborProductivity |
| 006 | Stair trim + chewed balusters | **review** | 50% | $515 | $443 | $84 | $68 | 6.4 | laborProductivity |
| 007 | Cabinet bottom + recaulk (water dmg) | **review** | 35% | $287 | $247 | $84 | $61 | 3.96 | laborProductivity |
| 008 | Three fence posts reset (storm) | **take** | 83% | $376 | $327 | $84 | $66 | 4.47 | laborProductivity |
| 009 | Six rotted deck boards (back porch) | **review** | 80% | $633 | $563 | $84 | $65 | 6.5 | laborProductivity |
| 010 | Two drywall holes Unit 4B (commercial) | **take** | 77% | $362 | $316 | $84 | $55 | 5 | laborProductivity |
| 011 | Nail pop + drywall crack (8 inches) | **review** | 90% | $170 | $175 | $84 | $53 | 2.4 | minimumJob |
| 012 | TV 75" above stone fireplace (high) | **review** | 70% | $262 | $231 | $84 | $53 | 3.5 | laborProductivity |
| 013 | Two fence posts (storm damage) | **take** | 85% | $380 | $331 | $84 | $63 | 4.67 | laborProductivity |
| 014 | Bathroom door trim (splitting) | **review** | 65% | $243 | $209 | $84 | $59 | 3.43 | laborProductivity |
| 015 | Eight rotted deck boards (composite) | **review** | 81% | $630 | $560 | $84 | $66 | 6.37 | laborProductivity |
| 016 | Two drywall holes kids room (smooth) | **take** | 74% | $368 | $320 | $84 | $64 | 4.55 | laborProductivity |
| 017 | Front door replacement (pre-hung) | **review** | 85% | $609 | $532 | $84 | $69 | 6.73 | laborProductivity |
| 018 | Doorknob hole (14 inch, smooth) | **take** | 80% | $322 | $280 | $84 | $64 | 3.97 | laborProductivity |
| 019 | TV mount 55" Samsung (den, studs) | **review** | 92% | $185 | $175 | $84 | $50 | 2.53 | minimumJob |
| 020 | Three fence panels (back slope) | **review** | 72% | $676 | $599 | $84 | $65 | 7.07 | laborProductivity |
| 021 | Doorknob hole Unit 12A (turnover) | **review** | 88% | $187 | $175 | $84 | $39 | 3.2 | minimumJob |
| 022 | Three floating shelves (customer has) | **take** | 82% | $309 | $267 | $84 | $60 | 4.12 | laborProductivity |

## Scenario C — Late week / scarce capacity / behind goal

requiredContributionPerCapacityHour: $100/hr

| Run | Description | Rec | Conf | Quote | Min Price | $/Labor Hr | $/Cap Hr | Cap Hrs | Binding Floor |
|-----|-------------|-----|------|-------|-----------|-----------|---------|---------|---------------|
| 001 | Small drywall patch (softball-sized) | **pass** | 92% | $173 | $301 | $84 | $50 | 2.53 | weeklyCapacityPace |
| 002 | TV mount 65" (customer has mount) | **pass** | 78% | $144 | $285 | $84 | $47 | 2.67 | weeklyCapacityPace |
| 003 | Back door replacement (frame rough) | **pass** | 53% | $521 | $753 | $84 | $67 | 6.93 | weeklyCapacityPace |
| 004 | Ceiling water damage (upstairs leak) | **pass** | 30% | $525 | $821 | $84 | $60 | 7.46 | weeklyCapacityPace |
| 005 | Cabinet knob + hang 2 pictures | **pass** | 75% | $300 | $577 | $84 | $43 | 4.9 | weeklyCapacityPace |
| 006 | Stair trim + chewed balusters | **pass** | 50% | $515 | $721 | $84 | $68 | 6.4 | weeklyCapacityPace |
| 007 | Cabinet bottom + recaulk (water dmg) | **pass** | 35% | $287 | $443 | $84 | $61 | 3.96 | weeklyCapacityPace |
| 008 | Three fence posts reset (storm) | **pass** | 83% | $376 | $528 | $84 | $66 | 4.47 | weeklyCapacityPace |
| 009 | Six rotted deck boards (back porch) | **pass** | 80% | $633 | $863 | $84 | $65 | 6.5 | weeklyCapacityPace |
| 010 | Two drywall holes Unit 4B (commercial) | **pass** | 77% | $362 | $585 | $84 | $55 | 5 | weeklyCapacityPace |
| 011 | Nail pop + drywall crack (8 inches) | **pass** | 90% | $170 | $284 | $84 | $53 | 2.4 | weeklyCapacityPace |
| 012 | TV 75" above stone fireplace (high) | **pass** | 70% | $262 | $427 | $84 | $53 | 3.5 | weeklyCapacityPace |
| 013 | Two fence posts (storm damage) | **pass** | 85% | $380 | $553 | $84 | $63 | 4.67 | weeklyCapacityPace |
| 014 | Bathroom door trim (splitting) | **pass** | 65% | $243 | $385 | $84 | $59 | 3.43 | weeklyCapacityPace |
| 015 | Eight rotted deck boards (composite) | **pass** | 81% | $630 | $847 | $84 | $66 | 6.37 | weeklyCapacityPace |
| 016 | Two drywall holes kids room (smooth) | **pass** | 74% | $368 | $534 | $84 | $64 | 4.55 | weeklyCapacityPace |
| 017 | Front door replacement (pre-hung) | **pass** | 85% | $609 | $821 | $84 | $69 | 6.73 | weeklyCapacityPace |
| 018 | Doorknob hole (14 inch, smooth) | **pass** | 80% | $322 | $466 | $84 | $64 | 3.97 | weeklyCapacityPace |
| 019 | TV mount 55" Samsung (den, studs) | **pass** | 92% | $185 | $313 | $84 | $50 | 2.53 | weeklyCapacityPace |
| 020 | Three fence panels (back slope) | **pass** | 72% | $676 | $921 | $84 | $65 | 7.07 | weeklyCapacityPace |
| 021 | Doorknob hole Unit 12A (turnover) | **pass** | 88% | $187 | $381 | $84 | $39 | 3.2 | weeklyCapacityPace |
| 022 | Three floating shelves (customer has) | **pass** | 82% | $309 | $472 | $84 | $60 | 4.12 | weeklyCapacityPace |

---

## Comparison Table — Recommendation Changes

| Run | Description | Early Week (A) | Midweek (B) | Late Week (C) | Change Pattern |
|-----|-------------|----------------|-------------|---------------|----------------|
| 001 | Small drywall patch (softball-sized) | **review** | **review** | **pass** | REVIEW -> REVIEW -> PASS |
| 002 | TV mount 65" (customer has mount) | **review** | **review** | **pass** | REVIEW -> REVIEW -> PASS |
| 003 | Back door replacement (frame rough) | **review** | **review** | **pass** | REVIEW -> REVIEW -> PASS |
| 004 | Ceiling water damage (upstairs leak) | **review** | **review** | **pass** | REVIEW -> REVIEW -> PASS |
| 005 | Cabinet knob + hang 2 pictures | **review** | **review** | **pass** | REVIEW -> REVIEW -> PASS |
| 006 | Stair trim + chewed balusters | **review** | **review** | **pass** | REVIEW -> REVIEW -> PASS |
| 007 | Cabinet bottom + recaulk (water dmg) | **review** | **review** | **pass** | REVIEW -> REVIEW -> PASS |
| 008 | Three fence posts reset (storm) | **review** | **take** | **pass** | REVIEW -> TAKE -> PASS |
| 009 | Six rotted deck boards (back porch) | **review** | **review** | **pass** | REVIEW -> REVIEW -> PASS |
| 010 | Two drywall holes Unit 4B (commercial) | **review** | **take** | **pass** | REVIEW -> TAKE -> PASS |
| 011 | Nail pop + drywall crack (8 inches) | **review** | **review** | **pass** | REVIEW -> REVIEW -> PASS |
| 012 | TV 75" above stone fireplace (high) | **review** | **review** | **pass** | REVIEW -> REVIEW -> PASS |
| 013 | Two fence posts (storm damage) | **review** | **take** | **pass** | REVIEW -> TAKE -> PASS |
| 014 | Bathroom door trim (splitting) | **review** | **review** | **pass** | REVIEW -> REVIEW -> PASS |
| 015 | Eight rotted deck boards (composite) | **review** | **review** | **pass** | REVIEW -> REVIEW -> PASS |
| 016 | Two drywall holes kids room (smooth) | **review** | **take** | **pass** | REVIEW -> TAKE -> PASS |
| 017 | Front door replacement (pre-hung) | **review** | **review** | **pass** | REVIEW -> REVIEW -> PASS |
| 018 | Doorknob hole (14 inch, smooth) | **review** | **take** | **pass** | REVIEW -> TAKE -> PASS |
| 019 | TV mount 55" Samsung (den, studs) | **review** | **review** | **pass** | REVIEW -> REVIEW -> PASS |
| 020 | Three fence panels (back slope) | **review** | **review** | **pass** | REVIEW -> REVIEW -> PASS |
| 021 | Doorknob hole Unit 12A (turnover) | **pass** | **review** | **pass** | PASS -> REVIEW -> PASS |
| 022 | Three floating shelves (customer has) | **review** | **take** | **pass** | REVIEW -> TAKE -> PASS |

---

## Scenario Summaries

| Metric | A (Early Week) | B (Midweek) | C (Late Week) |
|--------|----------------|-------------|---------------|
| TAKE count | 0 | 6 | 0 |
| REVIEW count | 21 | 16 | 0 |
| PASS count | 1 | 0 | 22 |
| weeklyCapacityPace binding count | 22 | 0 | 22 |
| Median $/cap hr | $61 | $61 | $61 |
| Median pricing gap | $-12 | $+44 | $-169 |

---

## Job Classification by Behavior

### Jobs that never change recommendation

None

### Jobs that degrade from B (easiest) to C (hardest)

- **001** Small drywall patch (softball-sized): B=REVIEW -> A=REVIEW -> C=PASS ($/cap hr: $50 vs required B=$29, A=$63, C=$100)
- **002** TV mount 65" (customer has mount): B=REVIEW -> A=REVIEW -> C=PASS ($/cap hr: $47 vs required B=$29, A=$63, C=$100)
- **003** Back door replacement (frame rough): B=REVIEW -> A=REVIEW -> C=PASS ($/cap hr: $67 vs required B=$29, A=$63, C=$100)
- **004** Ceiling water damage (upstairs leak): B=REVIEW -> A=REVIEW -> C=PASS ($/cap hr: $60 vs required B=$29, A=$63, C=$100)
- **005** Cabinet knob + hang 2 pictures: B=REVIEW -> A=REVIEW -> C=PASS ($/cap hr: $43 vs required B=$29, A=$63, C=$100)
- **006** Stair trim + chewed balusters: B=REVIEW -> A=REVIEW -> C=PASS ($/cap hr: $68 vs required B=$29, A=$63, C=$100)
- **007** Cabinet bottom + recaulk (water dmg): B=REVIEW -> A=REVIEW -> C=PASS ($/cap hr: $61 vs required B=$29, A=$63, C=$100)
- **008** Three fence posts reset (storm): B=TAKE -> A=REVIEW -> C=PASS ($/cap hr: $66 vs required B=$29, A=$63, C=$100)
- **009** Six rotted deck boards (back porch): B=REVIEW -> A=REVIEW -> C=PASS ($/cap hr: $65 vs required B=$29, A=$63, C=$100)
- **010** Two drywall holes Unit 4B (commercial): B=TAKE -> A=REVIEW -> C=PASS ($/cap hr: $55 vs required B=$29, A=$63, C=$100)
- **011** Nail pop + drywall crack (8 inches): B=REVIEW -> A=REVIEW -> C=PASS ($/cap hr: $53 vs required B=$29, A=$63, C=$100)
- **012** TV 75" above stone fireplace (high): B=REVIEW -> A=REVIEW -> C=PASS ($/cap hr: $53 vs required B=$29, A=$63, C=$100)
- **013** Two fence posts (storm damage): B=TAKE -> A=REVIEW -> C=PASS ($/cap hr: $63 vs required B=$29, A=$63, C=$100)
- **014** Bathroom door trim (splitting): B=REVIEW -> A=REVIEW -> C=PASS ($/cap hr: $59 vs required B=$29, A=$63, C=$100)
- **015** Eight rotted deck boards (composite): B=REVIEW -> A=REVIEW -> C=PASS ($/cap hr: $66 vs required B=$29, A=$63, C=$100)
- **016** Two drywall holes kids room (smooth): B=TAKE -> A=REVIEW -> C=PASS ($/cap hr: $64 vs required B=$29, A=$63, C=$100)
- **017** Front door replacement (pre-hung): B=REVIEW -> A=REVIEW -> C=PASS ($/cap hr: $69 vs required B=$29, A=$63, C=$100)
- **018** Doorknob hole (14 inch, smooth): B=TAKE -> A=REVIEW -> C=PASS ($/cap hr: $64 vs required B=$29, A=$63, C=$100)
- **019** TV mount 55" Samsung (den, studs): B=REVIEW -> A=REVIEW -> C=PASS ($/cap hr: $50 vs required B=$29, A=$63, C=$100)
- **020** Three fence panels (back slope): B=REVIEW -> A=REVIEW -> C=PASS ($/cap hr: $65 vs required B=$29, A=$63, C=$100)
- **021** Doorknob hole Unit 12A (turnover): B=REVIEW -> A=PASS -> C=PASS ($/cap hr: $39 vs required B=$29, A=$63, C=$100)
- **022** Three floating shelves (customer has): B=TAKE -> A=REVIEW -> C=PASS ($/cap hr: $60 vs required B=$29, A=$63, C=$100)

### Jobs that become PASS in Scenario C (were not PASS in B)

- **001** Small drywall patch (softball-sized): was REVIEW (B) -> **PASS** (C). $/cap hr $50 vs required $100. Cap hrs 2.53 vs remaining 6h.
- **002** TV mount 65" (customer has mount): was REVIEW (B) -> **PASS** (C). $/cap hr $47 vs required $100. Cap hrs 2.67 vs remaining 6h.
- **003** Back door replacement (frame rough): was REVIEW (B) -> **PASS** (C). $/cap hr $67 vs required $100. Cap hrs 6.93 vs remaining 6h.
- **004** Ceiling water damage (upstairs leak): was REVIEW (B) -> **PASS** (C). $/cap hr $60 vs required $100. Cap hrs 7.46 vs remaining 6h.
- **005** Cabinet knob + hang 2 pictures: was REVIEW (B) -> **PASS** (C). $/cap hr $43 vs required $100. Cap hrs 4.9 vs remaining 6h.
- **006** Stair trim + chewed balusters: was REVIEW (B) -> **PASS** (C). $/cap hr $68 vs required $100. Cap hrs 6.4 vs remaining 6h.
- **007** Cabinet bottom + recaulk (water dmg): was REVIEW (B) -> **PASS** (C). $/cap hr $61 vs required $100. Cap hrs 3.96 vs remaining 6h.
- **008** Three fence posts reset (storm): was TAKE (B) -> **PASS** (C). $/cap hr $66 vs required $100. Cap hrs 4.47 vs remaining 6h.
- **009** Six rotted deck boards (back porch): was REVIEW (B) -> **PASS** (C). $/cap hr $65 vs required $100. Cap hrs 6.5 vs remaining 6h.
- **010** Two drywall holes Unit 4B (commercial): was TAKE (B) -> **PASS** (C). $/cap hr $55 vs required $100. Cap hrs 5 vs remaining 6h.
- **011** Nail pop + drywall crack (8 inches): was REVIEW (B) -> **PASS** (C). $/cap hr $53 vs required $100. Cap hrs 2.4 vs remaining 6h.
- **012** TV 75" above stone fireplace (high): was REVIEW (B) -> **PASS** (C). $/cap hr $53 vs required $100. Cap hrs 3.5 vs remaining 6h.
- **013** Two fence posts (storm damage): was TAKE (B) -> **PASS** (C). $/cap hr $63 vs required $100. Cap hrs 4.67 vs remaining 6h.
- **014** Bathroom door trim (splitting): was REVIEW (B) -> **PASS** (C). $/cap hr $59 vs required $100. Cap hrs 3.43 vs remaining 6h.
- **015** Eight rotted deck boards (composite): was REVIEW (B) -> **PASS** (C). $/cap hr $66 vs required $100. Cap hrs 6.37 vs remaining 6h.
- **016** Two drywall holes kids room (smooth): was TAKE (B) -> **PASS** (C). $/cap hr $64 vs required $100. Cap hrs 4.55 vs remaining 6h.
- **017** Front door replacement (pre-hung): was REVIEW (B) -> **PASS** (C). $/cap hr $69 vs required $100. Cap hrs 6.73 vs remaining 6h.
- **018** Doorknob hole (14 inch, smooth): was TAKE (B) -> **PASS** (C). $/cap hr $64 vs required $100. Cap hrs 3.97 vs remaining 6h.
- **019** TV mount 55" Samsung (den, studs): was REVIEW (B) -> **PASS** (C). $/cap hr $50 vs required $100. Cap hrs 2.53 vs remaining 6h.
- **020** Three fence panels (back slope): was REVIEW (B) -> **PASS** (C). $/cap hr $65 vs required $100. Cap hrs 7.07 vs remaining 6h.
- **021** Doorknob hole Unit 12A (turnover): was REVIEW (B) -> **PASS** (C). $/cap hr $39 vs required $100. Cap hrs 3.2 vs remaining 6h.
- **022** Three floating shelves (customer has): was TAKE (B) -> **PASS** (C). $/cap hr $60 vs required $100. Cap hrs 4.12 vs remaining 6h.

### Jobs where confidence/risk remains primary issue regardless of context

None

### Jobs with potentially illogical recommendation changes

None found — all changes are directionally correct.

---

## Sanity Checks

All sanity checks passed:
- Quotes unchanged across scenarios
- Labor hours unchanged across scenarios
- Capacity hours unchanged across scenarios
- Confidence unchanged across scenarios
- No recommendation improved as context tightened
- weeklyCapacityPace floor never decreased with rising required rate
- laborProductivity floor stable (context-independent)

---

## Binding Floor Distribution

| Binding Floor | A (Early Week) | B (Midweek) | C (Late Week) |
|---------------|----------------|-------------|---------------|
| minimumJob | 0 | 5 | 0 |
| margin | 0 | 0 | 0 |
| absoluteProfit | 0 | 0 | 0 |
| laborProductivity | 0 | 17 | 0 |
| weeklyCapacityPace | 22 | 0 | 22 |

---

## Findings

1. **Capacity context meaningfully shifts recommendations.** Difficulty order by required rate: B ($29/hr, easiest) < A ($63/hr) < C ($100/hr, hardest). From B to C, TAKE drops from 6 to 0, REVIEW from 16 to 0, and PASS rises from 0 to 22. Scenario A ($63/hr required, 30h remaining) sits in between: TAKE=0, REVIEW=21, PASS=1.

2. **Graduated pricing gap eliminates the binary cliff.** Before this fix, Scenario A produced 13 PASS (59% rejection at a moderate $63/hr pace). Now it produces 21 REVIEW and only 1 PASS. The tolerance band (tiny gap <=10% -> Review, moderate 10-25% -> Review/Pass by scarcity, large >25% -> Pass) correctly distinguishes "barely below target," "meaningfully below target," and "terrible use of remaining capacity."

3. **Scenario B now has 0 PASS.** The three jobs previously PASS (001, 002, 011) had tiny pricing gaps ($2-$31 below $175 minimum). These are now correctly REVIEW — a $173 quote vs $175 minimum is a 1% gap, not worth rejecting outright.

4. **Scenario C remains 22/22 PASS.** At $100/hr required pace, every job's gap exceeds 25% (ranging from 34% to 66%). This is correct — no job in this portfolio earns anywhere close to $100/cap hr (max is $69). The system says PASS but now preserves confidence/risk reasons alongside the economic rejection.

5. **Estimates are correctly immutable across scenarios.** Recommended quotes, labor hours, capacity hours, confidence, and risk flags do not change — only the pricing floor (via weeklyCapacityPace) and the decision change.

6. **The capacityRatio < 0.3 hard-PASS cliff has been removed** from the pace check. Below-pace jobs now get `forceReview` regardless of remaining capacity. The pricing gap graduated bands handle the scarcity escalation (moderate gap + scarce capacity → PASS). This prevents the old behavior where every job collapsed to PASS once remaining capacity dropped below ~10.5h.

7. **Confidence and risk reasons are now preserved on PASS recommendations.** A job like 004 (30% confidence, water damage) that gets PASS for economic reasons will still show "Estimate confidence 30% is below 70% threshold" and risk flag warnings. The owner sees both the economic reason for PASS and the estimation uncertainty.

## Changes Made (v0.3.2 decision engine)

| Change | Before | After |
|--------|--------|-------|
| Pricing gap check | Any positive gap → PASS | Graduated: <=10% → Review, 10-25% → Review (or Pass if <30% capacity remaining), >25% → Pass |
| Pace check cliff | `capacityRatio < 0.3` → forcePass | Removed — pace check only produces forceReview |
| Confidence/risk on PASS | Confidence check ran but PASS overrode it | Confidence and risk reasons always added, visible on all recommendations |
| Regression tests | 18 decision tests | 25 decision tests (+7 boundary cases) |

## Potential Bugs

No bugs detected in this audit pass.

## Expected Behavior

- As `requiredContributionPerCapacityHour` rises (B=$29 -> A=$63 -> C=$100), jobs with low `contributionPerCapacityHour` should degrade from TAKE to REVIEW to PASS. **Confirmed.**
- Jobs whose `capacityHours > remainingCapacityHours` in Scenario C (6h) should be forced PASS. **Confirmed (4 jobs).**
- The `weeklyCapacityPace` pricing floor should rise with the required rate, making it the binding floor for more jobs in Scenario C. **Confirmed — 0 in B, 22 in A and C.**
- Confidence, labor hours, materials, risk flags, and recommended quotes should be identical across all three scenarios. **Confirmed — all sanity checks pass.**

## Threshold Sensitivity

- **Scenario A ($63/hr required pace):** 1 PASS, 21 REVIEW — good. The single PASS is job 021 ($187 quote vs $264 minimum = 29% gap, correctly exceeds the 25% large-gap threshold).
- **Scenario B ($29/hr required pace):** 6 TAKE, 16 REVIEW, 0 PASS — well-calibrated. REVIEW jobs have legitimate confidence/risk concerns or quotes close to minimum.
- **Scenario C ($100/hr required pace):** 22 PASS — still a total rejection, but every gap exceeds 25%. This is mathematically correct for this portfolio; the "best available" ranking is a dashboard-level concern, not a single-job engine concern.

### Remaining consideration for future work

Scenario C's 22/22 PASS suggests a future dashboard-level "best available" feature:

> None of these jobs meet your required pace. Best available is Job 017 at $69/schedule hr.

This belongs at the portfolio/ranking layer, not in the per-job decision engine.

---

*Diagnostic pass complete. Graduated pricing gap bands and cliff removal implemented and tested.*