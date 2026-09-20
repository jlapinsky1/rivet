# Mason feel-real recs

Generated: 2026-09-20T21:30:22.655Z

Every row was produced by `estimateHandymanJob` → `applyCalibration` → `deriveRecommendation`.
Use the **Feel?** column: Agree / Too high / Too low / Wrong call.

## 1. Stored intake recs (frozen Tuesday week clock)

This is what seed writes and what Mason sees at intake: **$1800 earned, 24h left, $29 needed / schedule hour**.

| Take | Take at price | Review | Pass |
| ---: | ---: | ---: | ---: |
| 7 | 0 | 15 | 0 |

| ID | Status | Title | Rec | Quote | Send $ | Conf | First reason | Feel? |
| --- | --- | --- | --- | ---: | ---: | ---: | --- | --- |
| 1001 | needs_review | Small drywall patch - bedroom | **review** | $185 | — | 92% | Quote around $185 covers the $175 needed for the schedule time this job uses | |
| 1002 | needs_review | Mount 65" TV - living room | **take** | $175 | — | 78% | Quote around $175 covers the $175 needed for the schedule time this job uses | |
| 1003 | needs_review | Replace back door | **review** | $532 | — | 53% | This job is expected to quote around $532 and only needs about $455 to stay on pace | |
| 1004 | needs_review | Water-damaged ceiling drywall | **review** | $525 | — | 30% | This job is expected to quote around $525 and only needs about $450 to stay on pace | |
| 1005 | needs_review | Replace cabinet knob + hang pictures | **review** | $300 | — | 75% | This job is expected to quote around $300 and only needs about $264 to stay on pace | |
| 1006 | needs_review | Stair trim + baluster repair (dog damage) | **review** | $515 | — | 50% | This job is expected to quote around $515 and only needs about $443 to stay on pace | |
| 1007 | needs_review | Kitchen sink cabinet bottom + recaulk | **review** | $287 | — | 35% | This job is expected to quote around $287 and only needs about $247 to stay on pace | |
| 1008 | quoted | Reset 3 fence posts | **take** | $376 | — | 83% | This job is expected to quote around $376 and only needs about $327 to stay on pace | |
| 1009 | scheduled | Replace 6 rotted deck boards | **review** | $633 | — | 80% | This job is expected to quote around $633 and only needs about $563 to stay on pace | |
| 1010 | needs_review | Patch hallway drywall - Unit 4B | **take** | $362 | — | 77% | This job is expected to quote around $362 and only needs about $316 to stay on pace | |
| 2001 | completed | Hallway drywall crack | **review** | $182 | — | 90% | Quote around $182 covers the $175 needed for the schedule time this job uses | |
| 2002 | completed | TV mount above fireplace | **review** | $262 | — | 70% | This job is expected to quote around $262 and only needs about $231 to stay on pace | |
| 2003 | completed | Reset 2 fence posts | **take** | $380 | — | 85% | This job is expected to quote around $380 and only needs about $331 to stay on pace | |
| 2004 | completed | Bathroom door trim replacement | **review** | $243 | — | 65% | This job is expected to quote around $243 and only needs about $209 to stay on pace | |
| 2005 | completed | Replace 8 deck boards (composite) | **review** | $630 | — | 81% | This job is expected to quote around $630 and only needs about $560 to stay on pace | |
| 2006 | completed | Kids room drywall patches (2) | **take** | $368 | — | 74% | This job is expected to quote around $368 and only needs about $320 to stay on pace | |
| 2007 | completed | Front door replacement | **review** | $645 | — | 85% | This job is expected to quote around $645 and only needs about $568 to stay on pace | |
| 2008 | completed | Medium drywall patch - bedroom | **take** | $322 | — | 80% | This job is expected to quote around $322 and only needs about $280 to stay on pace | |
| 2009 | completed | Mount TV in den | **review** | $185 | — | 92% | Quote around $185 covers the $175 needed for the schedule time this job uses | |
| 2010 | completed | Replace 3 fence panels - back slope | **review** | $676 | — | 72% | This job is expected to quote around $676 and only needs about $599 to stay on pace | |
| 2011 | completed | Unit 12A drywall patch | **review** | $199 | — | 88% | This job is expected to quote around $199 and only needs about $178 to stay on pace | |
| 2012 | completed | Install 3 floating shelves | **take** | $309 | — | 82% | This job is expected to quote around $309 and only needs about $267 to stay on pace | |

## 2. Live recs for pending jobs (this week only)

August completed jobs are off the week clock. Committed hours are scheduled / in-progress / approved only.

- Earned this week: $420
- Hours left (35 − committed): 30h
- Needed $/schedule hour: $69.33

| Take | Take at price | Review | Pass |
| ---: | ---: | ---: | ---: |
| 5 | 4 | 13 | 0 |

Pending `needs_review` rows are recomputed. Other statuses keep the stored label.

| ID | Status | Title | Rec | Quote | Send $ | Conf | First reason | Feel? |
| --- | --- | --- | --- | ---: | ---: | ---: | --- | --- |
| 1001 | needs_review | Small drywall patch - bedroom | **take_at_price** | $235 | $235 | 92% | Send $235 instead of ~$185 to cover on-site time, travel, and this week's earnings pace | |
| 1002 | needs_review | Mount 65" TV - living room | **take_at_price** | $203 | $203 | 78% | Send $203 instead of ~$175 to cover on-site time, travel, and this week's earnings pace | |
| 1003 | needs_review | Replace back door | **review** | $532 | — | 53% | Send $550 instead of ~$532 to cover on-site time, travel, and this week's earnings pace | |
| 1004 | needs_review | Water-damaged ceiling drywall | **review** | $525 | — | 30% | Send $592 instead of ~$525 to cover on-site time, travel, and this week's earnings pace | |
| 1005 | needs_review | Replace cabinet knob + hang pictures | **take_at_price** | $427 | $427 | 75% | Send $427 instead of ~$300 to cover on-site time, travel, and this week's earnings pace | |
| 1006 | needs_review | Stair trim + baluster repair (dog damage) | **review** | $515 | — | 50% | Send $525 instead of ~$515 to cover on-site time, travel, and this week's earnings pace | |
| 1007 | needs_review | Kitchen sink cabinet bottom + recaulk | **review** | $287 | — | 35% | Send $322 instead of ~$287 to cover on-site time, travel, and this week's earnings pace | |
| 1008 | quoted | Reset 3 fence posts | **take** | $376 | — | 83% | This job is expected to quote around $376 and only needs about $327 to stay on pace | |
| 1009 | scheduled | Replace 6 rotted deck boards | **review** | $633 | — | 80% | This job is expected to quote around $633 and only needs about $563 to stay on pace | |
| 1010 | needs_review | Patch hallway drywall - Unit 4B | **take_at_price** | $432 | $432 | 77% | Send $432 instead of ~$362 to cover on-site time, travel, and this week's earnings pace | |
| 2001 | completed | Hallway drywall crack | **review** | $182 | — | 90% | Quote around $182 covers the $175 needed for the schedule time this job uses | |
| 2002 | completed | TV mount above fireplace | **review** | $262 | — | 70% | This job is expected to quote around $262 and only needs about $231 to stay on pace | |
| 2003 | completed | Reset 2 fence posts | **take** | $380 | — | 85% | This job is expected to quote around $380 and only needs about $331 to stay on pace | |
| 2004 | completed | Bathroom door trim replacement | **review** | $243 | — | 65% | This job is expected to quote around $243 and only needs about $209 to stay on pace | |
| 2005 | completed | Replace 8 deck boards (composite) | **review** | $630 | — | 81% | This job is expected to quote around $630 and only needs about $560 to stay on pace | |
| 2006 | completed | Kids room drywall patches (2) | **take** | $368 | — | 74% | This job is expected to quote around $368 and only needs about $320 to stay on pace | |
| 2007 | completed | Front door replacement | **review** | $645 | — | 85% | This job is expected to quote around $645 and only needs about $568 to stay on pace | |
| 2008 | completed | Medium drywall patch - bedroom | **take** | $322 | — | 80% | This job is expected to quote around $322 and only needs about $280 to stay on pace | |
| 2009 | completed | Mount TV in den | **review** | $185 | — | 92% | Quote around $185 covers the $175 needed for the schedule time this job uses | |
| 2010 | completed | Replace 3 fence panels - back slope | **review** | $676 | — | 72% | This job is expected to quote around $676 and only needs about $599 to stay on pace | |
| 2011 | completed | Unit 12A drywall patch | **review** | $199 | — | 88% | This job is expected to quote around $199 and only needs about $178 to stay on pace | |
| 2012 | completed | Install 3 floating shelves | **take** | $309 | — | 82% | This job is expected to quote around $309 and only needs about $267 to stay on pace | |

## How to re-seed Mason in Supabase

1. Apply `supabase/migrations/023_work_item_completed_at.sql` if `completed_at` is missing.
2. `npx tsx supabase/generate-seed-sql.ts`
3. Production: run `supabase/refresh-mason-production.sql` (Mason-only wipe + inserts).

