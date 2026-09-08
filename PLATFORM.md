# Rivet — Profitability & Operations Platform

This document covers the operational platform powering Rivet. It answers four questions every job should pass through:

1. **Am I on pace to hit my financial goal?**
2. **Should I accept this job?**
3. **How accurate were my estimates?**
4. **Can I group or schedule jobs better?**

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Database Schema](#database-schema)
- [Phase 1: Goal Tracking & Pace Dashboard](#phase-1-goal-tracking--pace-dashboard)
- [Phase 2: Decision Engine](#phase-2-decision-engine)
- [Phase 3: Estimate Accuracy & Learning](#phase-3-estimate-accuracy--learning)
- [Phase 4: Route & Schedule Optimization](#phase-4-route--schedule-optimization)
- [Stripe Payment Workflow](#stripe-payment-workflow)
- [Commercial Marketing & SEO](#commercial-marketing--seo)
- [Commercial Workflow](#commercial-workflow)
- [How It All Connects](#how-it-all-connects)
- [Test Coverage](#test-coverage)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Admin Dashboard                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │ Dashboard │  │ Requests │  │ Learning │  │Settings│ │
│  │(Goal/Pace)│  │(Decision)│  │(Accuracy)│  │        │ │
│  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └────────┘ │
│        │              │              │                   │
│  ┌─────┴──────────────┴──────────────┴─────────────┐    │
│  │              Utility Layer (client-side)          │    │
│  │  goalEngine · decisionEngine · varianceAnalysis  │    │
│  │  calibrationEngine · routeContext · routeScoring  │    │
│  │  batchingEngine · similarityGroups                │    │
│  └──────────────────────┬───────────────────────────┘    │
│                         │                                │
│  ┌──────────────────────┴───────────────────────────┐    │
│  │           Supabase Repository Layer               │    │
│  │  business_goals · goal_snapshots · bookings       │    │
│  │  calibration_records · location/travel_cache      │    │
│  └───────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

All calculations run **client-side** for display. The one exception is `decision_context` attached to approved quotes — that is **validated server-side** in the `approve-quote` Netlify function so a manipulated browser request cannot save fictional data into the historical snapshot.

The admin layout uses `max-w-5xl` (desktop-first) for the new operational tabs. The existing customer-facing booking flow remains mobile-first (`max-w-lg`).

---

## Database Schema

### Migration 002: Business Goals

```
business_goals
├── goal_type        TEXT  ('cash_profit' | 'owner_adjusted_profit' | 'revenue')
├── target_amount    NUMERIC(10,2)
├── start_date / end_date  DATE
├── working_days_config    JSONB  (e.g. {"days": [1,2,3,4,5]})
├── daily_capacity_limit   INTEGER (default 4)
├── minimum_margin         NUMERIC (default 0.55)
├── minimum_job_profit     NUMERIC (default 75)
├── pipeline_weights       JSONB  (status → weight mapping)
└── active                 BOOLEAN (partial unique index: one active per goal_type)

goal_snapshots
├── goal_id           UUID → business_goals
├── snapshot_date     DATE
├── completed_profit / booked_profit / pipeline_profit  NUMERIC
├── pct_achieved      NUMERIC
├── pace_status       TEXT
├── jobs_completed    INTEGER
└── avg_daily_profit / required_daily_profit  NUMERIC
```

### Migration 003: Decision Context

Adds `decision_context JSONB` to `quote_snapshots` — stores the full decision engine output at the moment a quote was approved.

### Migration 004: Calibration

```
calibration_records
├── metric / dimension / dimension_value  TEXT
├── previous_value / suggested_value / approved_value  NUMERIC
├── sample_size      INTEGER
├── confidence       TEXT ('weak' | 'strong' | 'very_strong')
├── owner_decision   TEXT ('pending' | 'accepted' | 'rejected' | 'deferred')
├── supporting_job_ids  UUID[]
└── decided_at / effective_date
```

### Migration 005: Route Cache

```
location_cache
├── address_hash       TEXT (SHA-256 of normalized address — no full PII)
├── lat / lng          NUMERIC
└── formatted_address  TEXT (partial only)

travel_cache
├── origin_hash / destination_hash  TEXT (directional: A→B ≠ B→A)
├── distance_miles     NUMERIC
└── duration_minutes   INTEGER

bookings (new columns)
├── geocoded_lat / geocoded_lng  NUMERIC
├── geocoding_status    TEXT ('pending' | 'success' | 'failed')
└── geocoding_error     TEXT
```

All tables have RLS policies restricting access to admin users.

### Migration 012: Support Notes

```
support_notes
├── booking_id   UUID → bookings
├── admin_id     UUID → auth.users
├── body         TEXT
└── created_at   TIMESTAMPTZ
```

Admin-only timestamped notes attached to completed bookings. Used by the Completed tab support view.

### Migration 013: Dispatch

Adds dispatch authentication and event tracking for the crew-facing Dispatch interface.

```
dispatch_tokens
├── booking_id    UUID → bookings
├── token_hash    TEXT UNIQUE
├── expires_at    TIMESTAMPTZ
└── revoked_at    TIMESTAMPTZ

dispatch_events
├── booking_id    UUID → bookings
├── event_type    TEXT
├── payload       JSONB
└── created_at    TIMESTAMPTZ
```

### Migration 014: Distance Fields

```
bookings (new columns)
├── distance_miles           NUMERIC(8,1)   — straight-line miles, set by geocode-booking
└── travel_minutes_one_way   INTEGER        — estimated one-way travel time
```

Populated by the `geocode-booking` Netlify function. Used by `estimateBuilder.js` to display accurate travel time in the admin quote panel instead of the hardcoded 60-minute default.

---

## Phase 1: Goal Tracking & Pace Dashboard

### How It Works

You set a financial goal (e.g. "$15,000 cash profit this month"). The system tracks your progress against that goal in real-time using actual booking data.

### Key Concepts

**Three Profit Types:**

| Goal Type | What It Measures |
|-----------|-----------------|
| `cash_profit` | Revenue minus all direct costs (disposal, fuel, paid labor, payment fees, other) |
| `owner_adjusted_profit` | Cash profit minus the value of your own labor hours |
| `revenue` | Total money collected from customers |

The system reuses `calculateActuals()` from the existing completion pipeline — no duplicate profit logic.

**Two Projections:**

| Projection | Definition |
|-----------|-----------|
| **Committed** | Completed jobs at 100% + Scheduled jobs at 100%. This is money you can count on. |
| **Weighted** | Committed + pipeline jobs weighted by status. A pending_review job counts at 15%, a quote_sent at 50%, etc. |

The distinction matters: scheduled jobs are committed (the customer confirmed), so they count at 100%. Pipeline jobs might cancel, so they're discounted.

**Default Pipeline Weights:**

```
pending_review  → 0.15  (15% likely to convert)
quote_sent      → 0.50  (50%)
scheduled       → 1.00  (100% — committed)
completed       → 1.00  (100%)
```

These are configurable per goal.

### Pace Status

The system compares `% of goal achieved` against `% of time elapsed`:

| Condition | Status | Meaning |
|-----------|--------|---------|
| pctAchieved >= 100% | `achieved` | Goal met. Tracks stretch progress above target. |
| ratio >= 1.10 | `ahead` | More than 10% ahead of pace |
| ratio >= 0.90 | `on_pace` | Within 10% of where you should be |
| ratio >= 0.70 | `at_risk` | 70-90% of target pace |
| ratio < 0.70 | `behind` | Less than 70% of target pace |

**Missing Actuals:** If a completed job has no actuals entered, `extractProfit()` returns `null` (not zero). The system tracks `jobsMissingActuals` separately and generates an alert. Missing data never silently drags down your numbers.

### Dashboard UI (`Dashboard.jsx`)

- **GoalSetup**: Form to create/edit goals with all parameters
- **MonthlyScorecard**: Progress bar with pace color, two-column metrics grid (target, completed, booked, pipeline, remaining, avg daily, required daily, projected EOP, jobs completed, working days left)
- **TodayView**: How much profit you need today, what's booked, remaining daily target, capacity utilization
- **WeekView**: Weekly target vs completed vs booked
- **AlertsPanel**: Color-coded alerts (behind_pace, goal_reached, missing_actuals, unused_capacity)

### Files

| File | Purpose |
|------|---------|
| `src/utils/goalEngine.js` | All calculation logic (10 exported functions) |
| `src/utils/goalDefaults.js` | Constants, colors, labels |
| `src/pages/Dashboard.jsx` | Full dashboard page |
| `src/utils/__tests__/goalEngine.test.js` | 38 tests |

---

## Phase 2: Decision Engine

This is the core of the platform. When you open a pending job request, the decision engine evaluates it and gives you a clear **Take**, **Review**, or **Pass** recommendation with a 0-100 score.

### Three Rule Tiers

The engine uses three tiers of rules, evaluated in order of priority:

#### Tier 1: Hard Rules (Auto-Pass)

Hard rules represent absolute deal-breakers. If **any** hard rule fails, the recommendation is **Pass** regardless of score.

| Rule | Condition for Pass | Rationale |
|------|-------------------|-----------|
| `negative_profit` | Expected profit < $0 | Never take a loss |
| `prohibited_material` | Unresolved blocker (hazmat, critical missing inputs) | Safety/legal liability |
| `dual_floor` | Both below minimum profit AND below minimum margin | A $40 job at 45% margin fails both floors — not worth the truck roll |

The `dual_floor` is important: a $500 job at 52% margin (below the 55% target) is still worth reviewing because the absolute profit is strong. A $40 job at 45% margin fails both tests — that's a Pass. Either condition alone triggers a Review (gate rule), not a Pass.

#### Tier 2: Gate Rules (Force Review)

Gate rules don't kill a job, but they prevent auto-Take. If any gate rule triggers, the recommendation is **Review** at most, even if the score is high enough for Take.

| Rule | Trigger | Why It's a Gate |
|------|---------|-----------------|
| `below_min_profit` | Profit < minimum_job_profit setting | Low-dollar jobs need manual review for strategic value |
| `below_target_margin` | Margin < minimum_margin setting | A $500/52% job is fine — but you should look at it |
| `low_confidence` | Estimate confidence is low | AI uncertainty means you should sanity-check |
| `capacity_conflict` | Job would exceed daily capacity limit | Operational bottleneck needs manual scheduling decision |

#### Tier 3: Soft Rules (Score Contribution)

Soft rules contribute bonuses or penalties to the composite score. Each has a weight that determines its maximum influence:

| Rule | Weight | Bonus | Penalty |
|------|--------|-------|---------|
| `goal_pace` | 0.20 | +0.15 if behind pace (need the work) | -0.05 if ahead (can be selective) |
| `job_rating` | 0.25 | +0.20 for excellent rating | -0.15 for poor rating |
| `confidence_score` | 0.15 | +0.05 for high confidence | -0.10 for low confidence |
| `profit_vs_daily_target` | 0.15 | +0.10 if covers 75%+ of daily target | none |
| `travel_efficiency` | 0.10 | +0.05 for ≤30 min travel | -0.05 for >60 min |
| `schedule_utilization` | 0.15 | +0.05 for available capacity | -0.10 at capacity |

### Scoring Algorithm

```
1. Start compositeScore = 0.50 (neutral baseline)

2. Evaluate all hard rules:
   → Any failure? recommendation = Pass, stop.

3. Evaluate all gate rules:
   → Any trigger? cap recommendation at Review.

4. Evaluate all soft rules:
   → Accumulate bonuses/penalties to compositeScore
   → Clamp to [0, 1]

5. Convert to 0-100 scale:
   score = Math.round(compositeScore * 100)

6. Map to recommendation:
   score >= 65  → Take  (unless gate-capped to Review)
   score 40-64  → Review
   score < 40   → Pass
```

### Decision Output

The engine returns a rich `Decision` object:

```javascript
{
  recommendation: 'take' | 'review' | 'pass',
  score: 0-100,
  headline: "Strong job: excellent rating, good margin",
  reasons: ["Profit $285 exceeds daily target", "30 min travel, efficient"],
  positiveFactors: ["Excellent job rating", "High confidence estimate"],
  negativeFactors: ["Slightly below target margin"],
  blockers: [],                    // hard rule failures
  goalContribution: {
    dailyPct: 0.75,               // covers 75% of daily profit target
    weeklyPct: 0.18,              // covers 18% of weekly target
  },
  suggestedMinPrice: 200,         // minimum price to hit target margin
  priceForTargetMargin: 200,      // totalCosts / (1 - minimumMargin)
  confidence: 0.85,
  ruleResults: [...],             // every rule's individual result
  goalContext: { paceStatus, requiredDailyProfit, ... },
  scheduleContext: { todayJobCount, capacityRemaining, ... },
  evaluatedAt: "2026-07-19T..."
}
```

### Suggested Minimum Price

The engine calculates what price you'd need to charge to hit your target margin:

```
totalDirectCosts = disposalCost + fuelCost + paidLabor + paymentFees + otherCosts
suggestedMinPrice = totalDirectCosts / (1 - minimumMargin)
```

This rounds to the nearest $5 for clean pricing. If the current quote is below this price, it appears as a warning.

### Goal Integration

When an active goal exists, the decision engine pulls in pace context:

- If you're **behind pace**, the `goal_pace` rule adds a +0.15 bonus — you need the work, so marginal jobs score higher
- If you're **ahead**, it subtracts -0.05 — you can afford to be selective
- The `goalContribution` field shows what percentage of your daily/weekly target this single job covers

### Server-Side Validation

When a quote is approved, the `decision_context` is attached to the quote snapshot. The `approve-quote` Netlify function accepts this context and stores it alongside the quote — creating an immutable audit trail of *why* each job was accepted.

A manipulated browser request cannot save fictional decision data because the server validates the context against the actual booking data.

### Files

| File | Purpose |
|------|---------|
| `src/utils/decisionRules.js` | DECISION_RULES array — all rule definitions |
| `src/utils/decisionEngine.js` | `evaluateDecision()` — orchestrator |
| `src/utils/__tests__/decisionEngine.test.js` | 15 tests |
| `src/pages/RequestQueue.jsx` | DecisionCard UI in job detail view |
| `netlify/functions/approve-quote.js` | Server-side snapshot with decision_context |

### Decision Card in the UI

When you open a pending request, the DecisionCard appears at the top:

- Large colored badge: green (Take), amber (Review), red (Pass)
- Score (0-100)
- Headline explaining the recommendation
- Positive and negative factors as bullet points
- Blockers (if any) shown in red
- Goal contribution (% of daily/weekly target)
- Suggested minimum price if current price is low
- Collapsible "Rule Breakdown" showing each rule's individual result

---

## Phase 3: Estimate Accuracy & Learning

After completing jobs and entering actuals, the system compares your estimates to reality and identifies patterns.

### Variance Analysis

For every completed job, the system extracts estimated vs actual pairs for seven metrics:

| Metric | Estimated From | Actual From |
|--------|---------------|-------------|
| Price | `recommendedPrice` | `finalAmount` |
| Cash Profit | `estimatedProfit` | calculated from actuals |
| Margin | `estimatedMargin` | calculated from actuals |
| Travel Minutes | `estimatedTravelMinutes` | `actualTravelMinutes` |
| On-Site Minutes | `estimatedOnSiteHours × 60` | `actualOnSiteMinutes` |
| Truck Volume % | `estimatedVolumePct` | `actualTruckVolumePct` |
| Disposal Cost | `disposalAllowance` | `disposalCost` |

For each metric, the system calculates:

- **Average Error** (signed): Are you consistently over or under?
- **Absolute Average Error**: How far off on average?
- **Median Error**: Typical error (resistant to outliers)
- **MAPE**: Mean Absolute Percentage Error (skipped when denominator < $10 or < 5 minutes to avoid misleading percentages)
- **Overestimate Rate**: % of jobs where you guessed too high
- **Underestimate Rate**: % of jobs where you guessed too low

### Similarity Groups

The system groups jobs by seven dimensions to find where your estimates are weakest:

| Dimension | Groups |
|-----------|--------|
| Access Type | Curbside, Upstairs, Backyard, etc. |
| Quantity | A few items, A room worth, etc. |
| Heavy Items | Yes / No |
| Stairs | None, 1 flight, 2+ flights |
| Distance Band | 0-10mi, 10-20mi, 20-30mi, 30+mi |
| Volume Band | Light (<25%), Medium (25-60%), Heavy (60%+) |
| Load Count | Based on estimated truck loads |

You can select any dimension and any metric to see grouped accuracy. Example: "My on-site time estimates for Upstairs jobs are 35% too low on average."

### Calibration Engine

When the system detects consistent directional bias, it generates calibration suggestions:

```
Trigger: signed bias > 15% AND sample size >= 5
```

Key design decisions:

- Uses **signed bias** (not MAPE alone) to determine direction. MAPE says "you're inaccurate." Signed bias says "you're consistently underestimating by 25%."
- **Maximum adjustment cap: 30%** per suggestion. Even if you're 80% off, the system suggests at most a 30% correction. This prevents over-correction from outliers.
- **Confidence levels**: weak (5-9 jobs), strong (10-19), very_strong (20+)
- **Owner must explicitly accept** every calibration. No automatic changes.
- Calibration records track `settings_version` and `effective_date` for rollback capability
- Historical quote snapshots are never retroactively recalculated — they're immutable

**Calibration Flow:**

1. System detects: "On-site time for Upstairs jobs is underestimated by 22% (12 jobs, strong confidence)"
2. Suggestion appears: Current 60 min → Suggested 73 min
3. Owner clicks Accept / Reject / Defer
4. If accepted, the record is stored with effective_date. Owner manually adjusts settings.
5. Future estimates reflect the adjustment. Old quotes remain unchanged.

### Learning Dashboard UI (`LearningDashboard.jsx`)

- **Accuracy Summary**: Table of all 7 metrics with sample size, avg error, signed bias, MAPE, over/underestimate rates
- **Accuracy by Group**: Two dropdowns (dimension + metric), shows grouped accuracy table
- **Calibration Suggestions**: Pending suggestions with Accept/Reject/Defer buttons, confidence badges, reasoning text
- **Calibration History**: Table of past decisions with dates

### Files

| File | Purpose |
|------|---------|
| `src/utils/varianceAnalysis.js` | `computeMetrics`, `aggregateVarianceMetrics`, `computeJobVariance`, `VARIANCE_FIELDS` |
| `src/utils/similarityGroups.js` | `SIMILARITY_DIMENSIONS`, `groupJobsByDimension`, `categorizeDistance`, `categorizeVolume` |
| `src/utils/calibrationEngine.js` | `generateCalibrationSuggestions`, `getConfidence`, `applyCalibration` |
| `src/pages/LearningDashboard.jsx` | Full learning dashboard page |
| `src/utils/__tests__/varianceAnalysis.test.js` | 10 tests |
| `src/utils/__tests__/similarityGroups.test.js` | 12 tests |
| `src/utils/__tests__/calibrationEngine.test.js` | 10 tests |

---

## Phase 4: Route & Schedule Optimization

Modest implementation — deterministic utilities, nearby-job suggestions, capacity checks, and basic scenario comparison. No polished route UI until the system has 20+ completed jobs.

### Route Context

**Haversine Distance**: Calculates straight-line distance between two lat/lng points in miles. Used for all proximity calculations.

**Address Hashing**: SHA-256 hash of normalized addresses (lowercased, punctuation removed, whitespace collapsed). The location cache stores hashes, not full addresses — no PII in the cache table.

**Nearby Job Finder**: Given a target location and list of scheduled jobs with geocoded coordinates, returns jobs within a configurable radius (default 15 miles), sorted by distance.

### Batching Engine

**Capacity Compatibility**: Checks if a candidate job can share a truck with existing scheduled jobs:

```
Combined truck volume = sum of all estimatedVolumePct values
Compatible if combined ≤ 100%
```

If combined volume exceeds 100%, the jobs require a dump trip between them — flagged as incompatible with the reason explained.

**Batch Suggestions**: For a candidate job, finds all nearby scheduled jobs, checks capacity compatibility for each, and estimates travel savings from batching:

```
Travel savings ≈ distance × 2 min/mile × 2 (round trip saved)
```

Results are sorted by distance, closest first.

### Route Scoring

**Score a Route**: Given an ordered list of stops (home, jobs, landfill), calculates:

- Total miles and travel minutes (haversine between consecutive stops)
- On-site minutes (sum of job estimates)
- Fuel cost (miles × cost per mile, default $0.58)
- Dump trips and dump fees (count landfill stops × fee per dump)
- Per-stop leg distances

**Compare Scenarios**: Compares two route configurations by **net profit**:

```
Net = expectedProfit - fuelCost - dumpFees
```

This accounts for the real cost of extra dump trips. Two nearby jobs that fill the truck might look efficient, but if they require separate dump trips ($75 each), the travel savings might not justify the extra dump fee.

**Optimize Stop Order**: Nearest-neighbor heuristic for ordering 2-4 daily stops. Starts from home, always picks the closest unvisited stop. Sufficient for typical daily routes; no need for TSP solvers at this scale.

### Files

| File | Purpose |
|------|---------|
| `src/utils/routeContext.js` | `haversineDistance`, `findNearbyJobs`, `hashAddress` |
| `src/utils/batchingEngine.js` | `checkCapacityCompatibility`, `suggestBatch` |
| `src/utils/routeScoring.js` | `scoreRoute`, `compareScenarios`, `optimizeStopOrder` |
| `src/utils/__tests__/routeContext.test.js` | 11 tests |
| `src/utils/__tests__/batchingEngine.test.js` | 10 tests |
| `src/utils/__tests__/routeScoring.test.js` | 12 tests |

---

## Geocoding & Travel Time

Customer addresses are geocoded via **Nominatim** (free, no API key required) after booking submission. Travel time is estimated from the shop's home base using the Haversine formula with a 1.3× road-distance multiplier at 30 mph average speed.

### Configuration

Set two environment variables in Netlify:

| Variable | Example | Purpose |
|---|---|---|
| `SHOP_LAT` | `34.1234` | Shop latitude |
| `SHOP_LNG` | `-83.5678` | Shop longitude |

### Flow

1. Customer submits booking → `create-booking.js` fires `POST /api/geocode-booking` (non-blocking)
2. `geocode-booking.js` calls Nominatim with the `full_address`, computes Haversine distance, stores `distance_miles` + `travel_minutes_one_way` on the booking row
3. If the booking is opened in the admin panel before geocoding completes, `RequestDetail` re-triggers geocoding on mount and updates the estimate in real-time
4. `estimateBuilder.js` uses `booking.travelMinutes` if set; falls back to 30 min

### Risk Flags & Travel

- No risk flag is generated for travel time unless it exceeds 90 minutes
- The "no distance data" entry is non-financial and suppressed while geocoding is in progress
- Once geocoded, the actual travel time drives the fuel cost and travel efficiency scoring in the decision engine

---

## Squatterz Dispatch Interface

The Dispatch interface is a separate crew-facing view (`/dispatch`) giving field technicians a streamlined mobile-first experience for managing job status without access to the full admin panel.

### Authentication

Dispatch uses token-based auth (separate from admin JWT). Each token is tied to a booking or daily job list, hashed and stored in `dispatch_tokens`. Tokens expire and can be revoked.

### Job Lifecycle via Dispatch

```
in admin: scheduled → admin dispatches → dispatch token issued
                                              │
                                    ┌─────────┴──────────┐
                                    │  Dispatch Interface  │
                                    │  View job details    │
                                    │  Mark in_progress   │  (requires deposit_confirmed_at)
                                    │  Upload after photos │
                                    │  Submit completion  │
                                    │  Report issues       │
                                    └─────────┬────────────┘
                                              │
                              booking status → completed
```

### Dispatch Enforcement

- `in_progress` transition requires `deposit_confirmed_at IS NOT NULL`
- Job completion from dispatch goes through the same `runCompleteJob()` core as admin completion — fully idempotent
- All dispatch events are logged to `dispatch_events` for audit

### Key Files

| File | Purpose |
|---|---|
| `netlify/functions/dispatch-job.js` | Mark job in_progress |
| `netlify/functions/dispatch-complete.js` | Submit completion package |
| `netlify/functions/dispatch-status.js` | Current job status |
| `netlify/functions/dispatch-photo.js` | Upload after photo |
| `netlify/functions/dispatch-photo-upload-url.js` | Signed URL for photo upload |
| `netlify/functions/dispatch-report-issue.js` | Report job issue |
| `netlify/functions/dispatch-jobs-today.js` | Today's job list |
| `netlify/functions/_shared/completeJobCore.js` | Shared resumable completion logic |

---

## Completed Bookings — Admin Support View

Completed bookings route to a dedicated support-focused view rather than the standard request detail. This gives the admin a customer case file instead of the quote workflow.

### Component Tree (`src/components/admin/completed/`)

| Component | Purpose |
|---|---|
| `CompletedTab.jsx` | Server-side paginated list with debounced search |
| `CompletedJobCard.jsx` | Card with paid/balance-due badge |
| `CompletedDetail.jsx` | Orchestrates all sub-panels |
| `CustomerSupportHeader.jsx` | Contact info + quick actions |
| `PaymentSummaryPanel.jsx` | Live Stripe data via `/api/payment-summary` |
| `CompletionPackagePanel.jsx` | Before/after photos + completion notes |
| `PhotoGallery.jsx` | Side-by-side with lightbox |
| `SupportTimeline.jsx` | Audit log rendered as milestone timeline |
| `SupportNotesPanel.jsx` | Admin-only timestamped notes (migration 012) |

### Routing

In `RequestQueue.jsx`: if `selected.status === 'completed'` → `CompletedDetail`; if `filter === 'completed'` → `CompletedTab`. All other statuses use the original `RequestDetail`.

### Payment Quick Actions (from admin)

1. **Copy Customer Link** — `generate_customer_link` action → copies `/invoice/{token}/final`
2. **Resend Customer Link** — `resend_final_link` action (sends email via Resend)
3. **Stripe Dashboard** — admin link to `dashboard.stripe.com` (never shared with customer)
4. **Download Invoice PDF** — `invoicePdfUrl` from Stripe DTO
5. **Download Completion Report** — `/api/residential-completion-pdf?bookingId=`

---

## Customer Submission Confirmation Email

When a booking is created, `create-booking.js` sends a Resend confirmation email to the customer (if `customer_email` is provided). The email includes:

- A confirmation code matching the admin view (`#XXXXXXXX`)
- A "real person is reviewing your request" message
- Shop phone number for questions
- Non-blocking: email failure never prevents booking creation

The submission success screen (`BookingFlow.jsx`) also shows these three points inline:
1. A confirmation email is on its way
2. Your booking number is below for reference
3. Most customers hear back within a few hours

---

## Admin Booking Detail — snake_case Normalization

Supabase returns all columns in snake_case. The admin UI and all utility functions (`estimateBuilder`, `riskFlags`, `decisionEngine`) expect camelCase. `supabaseRepo.js` includes a `normalizeBooking()` function applied to every row returned by `getBookings()` and `getBookingById()`.

Key mappings:

| DB column | JS field |
|---|---|
| `customer_name` | `customerName` |
| `full_address` | `fullAddress` |
| `photo_count` | `photoCount` |
| `detected_items` | `detectedItems` |
| `ai_detected_items` | `aiDetectedItems` |
| `access_type` | `accessType` |
| `created_at` | `createdAt` |
| `approved_quote` | `approvedQuote` |
| `available_slots` | `availableSlots` |
| `distance_miles` | `distanceMiles` |
| `travel_minutes_one_way` | `travelMinutes` |

Booking photos are not on the booking row — they are fetched lazily from `booking_photos` via `getPhotoUrls()` when the admin expands the photo accordion.

---

## How It All Connects

### Job Lifecycle Through the Platform

```
Customer submits booking request
        │
        ▼
  ┌─────────────────────┐
  │  Admin opens request │
  │                       │
  │  Decision Engine runs │◄── Goal pace context
  │  Take / Review / Pass │◄── Job rating, margin, profit
  │                       │◄── Capacity, travel, confidence
  │  Nearby jobs shown    │◄── Route context (geocoded)
  │  Batch suggestions    │◄── Batching engine
  └──────────┬────────────┘
             │
             ▼ (if approved)
  ┌─────────────────────┐
  │  Quote approved       │
  │  decision_context     │──► Immutable snapshot (server-validated)
  │  saved to snapshot    │
  └──────────┬────────────┘
             │
             ▼ (job completed)
  ┌─────────────────────┐
  │  Actuals entered      │
  │  Variance computed    │──► Learning Dashboard
  │  Calibration checked  │──► Suggestions generated
  │  Goal progress updated│──► Dashboard scorecard
  └───────────────────────┘
```

### Shared Dependencies

- `completion.js` → `goalEngine.js`: Profit extraction reuses `calculateActuals()`
- `goalEngine.js` → `decisionEngine.js`: Goal context feeds pace-based scoring
- `varianceAnalysis.js` → `calibrationEngine.js`: Variance metrics feed calibration suggestions
- `routeContext.js` → `batchingEngine.js` → `routeScoring.js`: Haversine distance flows through all route utilities
- `supabaseRepo.js`: Single repository with methods for all new tables

### Navigation

The admin navigation has tabs for:

| Tab | Page | Width |
|-----|------|-------|
| Dashboard | Goal/Pace scorecard | `max-w-5xl` (desktop) |
| Requests | Job queue with decision card | `max-w-5xl` (desktop) |
| Learning | Accuracy & calibration | `max-w-5xl` (desktop) |
| Quote / History / Settings | Existing pages | `max-w-lg` (mobile-first) |

---

## Test Coverage

### JavaScript Unit Tests (Vitest)

| Test File | Tests | What It Covers |
|-----------|-------|---------------|
| `goalEngine.test.js` | 38 | Working days, profit extraction, pipeline weighting, pace status, alerts, today/week progress |
| `decisionEngine.test.js` | 15 | Hard rules, gate rules, scoring, output structure, suggestedMinPrice, goal contribution |
| `varianceAnalysis.test.js` | 10 | Metric calculation, MAPE guards, overestimate/underestimate rates, edge cases |
| `similarityGroups.test.js` | 12 | Dimension grouping, distance/volume categorization, missing field handling |
| `calibrationEngine.test.js` | 10 | Sample thresholds, confidence levels, max adjustment cap, signed bias direction |
| `routeContext.test.js` | 11 | Haversine accuracy, address hashing, nearby job filtering |
| `batchingEngine.test.js` | 10 | Capacity compatibility, batch suggestions, radius filtering |
| `routeScoring.test.js` | 12 | Route scoring, scenario comparison, stop order optimization |
| `serviceArea.test.js` | 17 | `isValidZip` format validation, `reasonToUiState` mapping |
| `dateLogic.test.js` | 9 | `getAvailableBookingDates` unit tests |
| `integration.test.js` | ~40 | Netlify Function handler integration (mocked Blobs) |
| `src/tests/onboarding.test.js` | Commercial estimate request: email check, submit-commercial-request idempotency, authenticated job submit, draft storage |
| **Total JS suite** | **~345** | Vitest (`npm test`) |

### Python Regression Tests (pytest)

The Python suite exercises real HTTP API endpoints against a live `netlify dev` instance, verifying HTTP contracts, Supabase persistence, and RLS enforcement. It complements (not duplicates) the JS suite.

| Test Module | Markers | What It Covers |
|---|---|---|
| `unit/test_date_logic.py` | unit | Date algorithm via Node subprocess with explicit `referenceDate`; 18 edge cases including DST, leap year, year boundary |
| `api/test_check_service_area.py` | smoke, regression | Full ZIP parameter matrix; exact reason codes; fail-closed vs unconfigured distinction |
| `api/test_create_booking.py` | smoke, regression | Field matrix × 8 required fields; persistence via test-lookup; idempotency count verification |
| `api/test_upload_flow.py` | regression | Session lifecycle, signed URL, disallowed extensions, max photos, expired/consumed session |
| `api/test_quote_lifecycle.py` | smoke, regression | Full lifecycle: create → approve → view → accept → complete; token revocation; slot conflict |
| `api/test_admin_endpoints.py` | regression | Auth enforcement, ZIP normalization, config round-trip, updatedBy/updatedAt fields |
| `integration/test_auth.py` | smoke, regression | Token acquisition, wrong credentials, malformed headers, portal signup, enumeration safety |
| `integration/test_expansion.py` | smoke, regression | Email required/invalid exact error codes, lead persistence, method enforcement |
| `integration/test_service_area.py` | regression | Config persistence, check endpoint reflects saved config, auth enforcement |
| `integration/test_booking.py` | smoke, regression | Server-side ZIP enforcement, idempotency, expired session, no stack trace |
| `integration/test_commercial.py` | smoke, regression | Property + job CRUD via Supabase REST; RLS blocks unauthenticated access |
| `integration/test_work_orders.py` | smoke, regression | CRUD, field persistence, status transitions, list visibility |
| `integration/test_portal_visibility.py` | regression | Cross-tenant isolation: client B cannot read client A's data |
| `integration/test_failure_handling.py` | regression | Exact status codes for all known error conditions; all errors are JSON |
| `integration/test_security.py` | security | Injection strings, no stack traces in responses, status field tampering, extra field handling |

#### Coverage boundaries

The Python suite does NOT verify:
- React component rendering or DOM structure
- Client-side field validation (phone regex, email format, photo count min/max)
- Button wiring, event handlers, or multi-step form navigation
- Transactional email delivery (Resend)
- `analyze-photos` (requires real base64 images + Anthropic API key)
- PDF content (only `Content-Type: application/pdf` + 200 status verified)
- Cloudflare/Netlify Blobs cache edge behavior in production vs local dev

These are covered by manual testing before each release — see `LAUNCH_CHECKLIST.md`.

---

## New Netlify Functions (API Layer Additions)

### `/api/health` (healthcheck.js)

GET endpoint that returns `{ "status": "ok", "timestamp": "..." }` with 200. No auth, no DB calls. Used by CI to wait for full server readiness (not just TCP port open).

### `/api/notify-expansion` (notify-expansion.js)

Updated with validation and persistence:
- `email` is required — returns 400 `{ "error": "email_required" }` if missing
- `email` must match basic format — returns 400 `{ "error": "invalid_email" }` if invalid
- `name` and `zip` are optional
- Persists to `expansion_leads` table (migration 008)
- Accepts optional `testRunId` for test isolation

### `/api/test/lookup` (test-lookup.js)

Test-only endpoint for verifying database state without direct DB access in test bodies. Only active when `NODE_ENV=test` AND `ENABLE_TEST_ENDPOINTS=true` AND `TEST_LOOKUP_SECRET` is set. Returns 404 (not 403) when disabled. Secret verified via `crypto.timingSafeEqual`.

Operations:
- `GET ?type=booking&testRunId={id}&idempotencyKey={key}` → booking row or 404
- `GET ?type=booking_count&testRunId={id}&idempotencyKey={key}` → `{ count: N }`
- `GET ?type=expansion_lead&testRunId={id}&email={email}` → lead row or 404
- `GET ?type=service_area` → current Blobs config
- `DELETE ?type=test_run&testRunId={id}` → deletes all records tagged with this testRunId

---

## Fail-Closed Service Area

`create-booking.js` was changed from fail-open to fail-closed for infrastructure errors. Previously, any exception from `loadServiceAreaConfig()` would allow the booking through. Now:

- Infrastructure error → 503 (booking blocked, customer told to try again)
- `unconfigured` state (empty lists, intentional zero-config) → booking allowed (fail-open for this specific case)
- Invalid/excluded/unavailable ZIP → 422 (booking blocked regardless of config state)

This prevents silent approval of out-of-zone bookings during Blobs outages.

---

## Date Logic Extraction

`getAvailableBookingDates()` was extracted from `BookingFlow.jsx` to `src/utils/dateLogic.js`. The function now accepts an explicit `referenceDate` parameter:

```javascript
getAvailableBookingDates({
  referenceDate: '2025-01-01',  // string or Date; defaults to new Date()
  daysAhead: 21,
  unavailableDates: [],
  businessDays: [1, 2, 3, 4, 5, 6],
})
```

`BookingFlow.jsx` passes `new Date()` at the call site. The `tests/node-adapter/date-logic.js` CLI wrapper invokes the function from Python tests via subprocess with an explicit date — no system time freezing needed.

---

## Database Additions (Migration 008)

```sql
-- expansion_leads: captures out-of-zone interest for future coverage expansion
create table expansion_leads (
  id           uuid primary key default gen_random_uuid(),
  email        text not null,
  name         text,
  zip          text,
  ip_address   text,
  test_run_id  text,           -- for test isolation and cleanup
  created_at   timestamptz not null default now()
);
-- RLS: admins can read; service role writes via function
-- Indexes on test_run_id and email

-- bookings: test_run_id column added
alter table bookings add column test_run_id text;
-- Index: idx_bookings_test_run_id (partial, where test_run_id is not null)
```

---

## Stripe Payment Workflow

### Booking Status Flow

```
pending_review
  → quote_sent          admin approves; Stripe customer + invoice created (send_invoice)
  → awaiting_deposit    customer initiates payment; slot tentatively reserved (30-min expiry)
  → scheduled           deposit webhook confirmed; deposit_confirmed_at set; slot confirmed
  → in_progress         admin dispatches crew (requires deposit_confirmed_at)
  → completed           admin submits completion package; final PaymentIntent created
  financially_completed_at set by invoice.paid webhook (independent of booking status)
```

### Stripe Object Model

One Stripe invoice per job. Both the deposit and final balance are attached as separate PaymentIntents to the same invoice.

```
Stripe Invoice (in_xxx)
  collection_method: send_invoice
  metadata: { booking_id, quote_version, environment }
  │
  ├── InvoiceItem: "Residential junk removal – {address}"
  │     amount: approvedPriceCents (full total)
  │
  ├── InvoicePayment #1 — deposit
  │     amount_requested: Math.floor(invoiceTotal / 2)   ← floor, never ceiling
  │     payment.payment_intent: pi_xxx_deposit
  │
  └── InvoicePayment #2 — final balance
        amount_requested: invoice.amount_remaining
        payment.payment_intent: pi_xxx_final
```

**Stripe API version**: `2025-05-28.basil` (required for `attach_payment` and `invoice_payment.paid`).

### Deposit Calculation

```
invoiceTotalCents = Math.round(approvedPrice * 100)
depositCents      = Math.floor(invoiceTotalCents / 2)   // floor — never rounds up
finalCents        = invoiceTotalCents - depositCents     // remainder (covers odd cents)
```

The server always calculates the deposit amount from Stripe's authoritative `invoice.amount_due`. Client-supplied `depositCents` is silently ignored.

### Token Lifecycle

**Quote token** (existing): issued at `approve-quote`, used to load `/quote/:token` and call `create-deposit-payment`. Consumed by the `confirm_deposit_atomic` RPC when the deposit webhook fires — not at payment initiation (so the customer can retry on card failure).

**Payment access token** (new): issued by `complete-job` after the completion package is saved. Hashed SHA-256, `purpose='final_payment'`, 7-day expiry. Used for `/invoice/:token/final` and `residential-completion-pdf`. Admin can revoke and reissue via `admin-payment-action`.

### Slot Reservation Expiry

Slots are reserved for 30 minutes when the customer initiates payment. If the deposit is not confirmed within that window the slot is canceled by `cleanup_expired_slot_reservations()` (called at the start of each `create-deposit-payment` call). Card failures do NOT cancel the slot — the customer can retry within the window.

### Webhook Idempotency

All Stripe webhook events are recorded in `processed_stripe_events` before processing begins. State machine: `processing → processed | failed`. A `failed` event is retried on the next Stripe delivery. An event already `processed` returns 200 immediately without re-running business logic.

### Dispatch Enforcement

`complete-job` requires `deposit_confirmed_at IS NOT NULL` before saving the completion package. Admin override: send `override=true` + `overrideReason` — this succeeds but writes a `dispatch_override` audit log entry.

### Price Adjustment

If `finalAmountCents ≠ booking.approved_quote * 100`, a `priceAdjustmentReason` string is required. The reason is stored on `booking_completions` and shown in the admin panel.

### Database Additions (Migration 009)

```
bookings (new columns)
├── stripe_customer_id               TEXT
├── stripe_invoice_id                TEXT
├── stripe_deposit_payment_intent_id TEXT
├── stripe_final_payment_intent_id   TEXT
├── deposit_confirmed_at             TIMESTAMPTZ
└── financially_completed_at         TIMESTAMPTZ

slot_reservations (new column)
└── expires_at  TIMESTAMPTZ   (30-minute window)

payment_access_tokens
├── booking_id   UUID → bookings
├── token_hash   TEXT UNIQUE
├── purpose      TEXT CHECK ('final_payment')
├── expires_at   TIMESTAMPTZ
├── used_at      TIMESTAMPTZ
└── revoked_at   TIMESTAMPTZ

processed_stripe_events
├── stripe_event_id   TEXT UNIQUE
├── event_type        TEXT
├── processing_status TEXT ('processing' | 'processed' | 'failed')
├── attempt_count     INTEGER
└── error_message     TEXT

booking_completions
├── booking_id              UUID UNIQUE → bookings
├── completed_at            TIMESTAMPTZ
├── technician_name         TEXT
├── items_removed           TEXT
├── volume_estimate         TEXT
├── completion_notes        TEXT
├── disposal_notes          TEXT
├── final_amount_cents      INTEGER
└── price_adjustment_reason TEXT

booking_photos (new column)
└── kind  TEXT CHECK ('before' | 'after')   default 'before'
```

### Additional Migrations (Post-009)

| Migration | Purpose |
|---|---|
| `010_fix_approve_quote_atomic.sql` | Recreates `approve_quote_atomic` RPC with the `p_decision_context JSONB DEFAULT NULL` parameter that was missing from the original migration. Stores decision context on `quote_snapshots`. |
| `011_fix_sessions_booking_fk.sql` | Changes `fk_sessions_booking` (`upload_sessions.consumed_by_booking → bookings`) from `ON DELETE RESTRICT` to `ON DELETE SET NULL`. This allows bookings to be deleted from the admin panel without a FK violation from the circular reference (`bookings.upload_session_id → upload_sessions`). |
| `012_support_notes.sql` | `support_notes` table with `is_admin()` RLS policy. Powers the admin support note panel in the Completed booking view. |
| `013_dispatch.sql` | Dispatch authentication (`dispatch_tokens`) and event log (`dispatch_events`). Required for the Squatterz Dispatch crew interface. |
| `014_distance_fields.sql` | Adds `distance_miles` and `travel_minutes_one_way` to `bookings`. Populated by the `geocode-booking` Netlify function via Nominatim geocoding. |
| `015_commercial_workflow.sql` | Extends the `jobs` table (originally created in migration 006) for a full quote→deposit→completion workflow. Expands the `status` CHECK constraint to include `pending_review`, `quote_sent`, and `awaiting_payment`; migrates any existing `'open'` rows to `'pending_review'`; adds Stripe payment columns (`stripe_customer_id`, `stripe_invoice_id`, `stripe_deposit_payment_intent_id`, `deposit_confirmed_at`, `financially_completed_at`); adds quote lifecycle columns (`quote_token_hash`, `quote_expires_at`, `quote_sent_at`, `quoted_at`); adds `admin_notes`; adds `submission` kind to the `job_photos.kind` CHECK constraint. |
| `016_commercial_onboarding.sql` | Adds onboarding tracking columns to `commercial_clients`: `job_title`, `onboarding_status` (`in_progress` \| `complete`), `last_onboarding_step`, `attribution` JSONB (UTMs, referrer, landing page). Temporary continuation-token columns were included here and removed in 017. |
| `017_draft_jobs_rls.sql` | Adds `draft` to the `jobs.status` CHECK constraint. Drops continuation-token columns. Enables RLS on `commercial_clients`, `properties`, and `jobs` so authenticated clients only access their own rows. |
| `018_request_idempotency.sql` | Adds `jobs.idempotency_key` (unique) for idempotent estimate submission; adds `commercial_email_registered(p_email)` RPC for step-2 email lookup. |

---

## Commercial Marketing & SEO

Public property-manager landing pages live under `/commercial/*` and use `react-helmet-async` for titles, meta descriptions, canonicals, Open Graph, and JSON-LD. Sub-pages omit PostalAddress from LocalBusiness JSON-LD (name + telephone only); `/commercial/service-area` includes full `areaServed` for Northeast Georgia cities.

| Route | Component |
|---|---|
| `/commercial` | `src/pages/Commercial.jsx` |
| `/commercial/property-management-cleanup` | `src/pages/commercial/PropertyManagementCleanup.jsx` |
| `/commercial/apartment-cleanouts` | `src/pages/commercial/ApartmentCleanouts.jsx` |
| `/commercial/eviction-cleanup` | `src/pages/commercial/EvictionCleanup.jsx` |
| `/commercial/unit-turnover-cleanout` | `src/pages/commercial/UnitTurnoverCleanout.jsx` |
| `/commercial/bulk-trash-removal` | `src/pages/commercial/BulkTrashRemoval.jsx` |
| `/commercial/client-portal` | `src/pages/commercial/ClientPortalPage.jsx` |
| `/commercial/service-area` | `src/pages/commercial/ServiceArea.jsx` |

Shared chrome: `CommercialNav.jsx`, `CommercialFooter.jsx`. Helpers: `src/utils/seo.js`, `src/utils/analytics.js`.

### Prerender & crawl controls

- `npm run build` runs Vite then `react-snap` (`postbuild`). `package.json` → `reactSnap.include` lists home + the 8 commercial public routes.
- Vite `build.target` is `es2015` so snap’s older Chromium can execute the bundle. Stripe-heavy routes are `React.lazy`-loaded so marketing prerenders do not load Stripe.js.
- `public/sitemap.xml` and `public/robots.txt` ship with the site. `netlify.toml` sets `X-Robots-Tag: noindex, nofollow` on `/portal/*`, `/admin/*`, and `/dispatch/*` (those paths stay Allow in robots.txt so crawlers can read the header).
- GA4 loads from `index.html` only when `VITE_GA4_MEASUREMENT_ID` is set at build time.

### Analytics events

| Event | When |
|---|---|
| `commercial_onboarding_start` | Marketing CTAs → `/portal/start` |
| `commercial_profile_created` | Wizard step 1 success |
| `commercial_property_added` | Wizard step 2 success |
| `commercial_work_order_draft_created` | Wizard step 3 draft save |
| `commercial_work_order_submitted` | Wizard step 4 submit |
| `commercial_onboarding_completed` | Wizard step 4 success |

---

## Commercial Workflow

The commercial portal (migration 006) originally provided a basic CRUD experience for property managers. Migration 015 added the quote→deposit→completion workflow. Migrations 016–017 add the `/portal/start` onboarding funnel, draft jobs, and client-facing RLS.

### Status Flow

```
draft → pending_review → quote_sent → awaiting_payment → scheduled → in_progress → completed
                                                                              ↘ cancelled
```

`draft` remains in the schema for legacy rows. New estimate requests from `/portal/start` create jobs as `pending_review` directly (no draft step).

### Estimate request (`/portal/start`)

| Step | Who | Action |
|---|---|---|
| 1 | Visitor | Cleanup details (property, service, photos via upload session). Draft persisted in `sessionStorage`. |
| 2 | Visitor | Contact details → `check-commercial-email`. If email exists: save draft with `pendingLogin`, redirect to `/portal/login?resume=request`. |
| 3 | Visitor (new email) | Review + password → `submit-commercial-request` creates auth user, client, property, `pending_review` job, links photos, sends emails. Idempotent via `idempotencyKey`. |
| — | Existing user | After login, `submitAuthenticatedDraft()` creates property + job via authenticated APIs. |

Partial failure: if auth user is created but property/job insert fails, `onboarding_status` stays `in_progress`; user logs in to finish. No admin notification until the work order exists. Step 3 has a client-side double-submit guard.

### Quote → deposit → completion

| Step | Who | Action |
|---|---|---|
| 1 | Client | Submits work order via portal (optional photos) **or** completes `/portal/start` (new or existing account) |
| 2 | Server | Non-draft `create-commercial-job` links photos and emails admin (`ADMIN_EMAIL`) + client confirmation |
| 3 | Admin | Reviews job at `/admin/commercial`, sets estimate, clicks "Send Quote" |
| 4 | Server | `send-commercial-quote` creates Stripe Customer + Invoice, sets `quote_token_hash`, emails client with link to `/commercial/quote/:token` |
| 5 | Client | Opens email link or portal dashboard; accepts quote (no login required via email link) |
| 6 | Server | `accept-commercial-quote` sets status → `awaiting_payment` |
| 7 | Client | Pays 50% deposit via Stripe PaymentElement on quote page or portal |
| 8 | Server | `create-commercial-deposit` creates PaymentIntent, attaches to invoice |
| 9 | Stripe | `invoice_payment.paid` webhook fires; `handleCommercialInvoicePaymentPaid` sets status → `scheduled`, `deposit_confirmed_at`; emails admin |
| 10 | Admin | Sets scheduled date via `/admin/commercial`; marks `in_progress` when crew arrives |
| 11 | Admin | Uploads before/after photos (direct Supabase Storage), enters completion notes, clicks "Complete & Send Packet" |
| 12 | Server | `complete-commercial-job` creates `job_photos` records, sets status → `completed`, emails client completion packet + Stripe hosted invoice URL for final balance |
| 13 | Client | Pays remaining 50% via Stripe hosted invoice URL |
| 14 | Stripe | `invoice.paid` fires; `handleCommercialInvoicePaid` sets `financially_completed_at` |

### Auth model

- **Client portal CRUD**: Supabase client with anon key + RLS (`commercial_clients.user_id = auth.uid()`; properties/jobs scoped via `client_id`)
- **New account + first request**: `submit-commercial-request` uses service role; rate-limited by IP; idempotent via `idempotencyKey`
- **Existing account resume**: authenticated `create-commercial-job` after login with saved sessionStorage draft
- **Job submission / quote acceptance**: Netlify Functions verify client JWT via `verifyCommercialClient()` in `_shared/supabase.js`; ownership checked server-side (property must belong to client's `client_id`)
- **Quote acceptance via email link**: Token-based (no login required); 7-day expiry; raw token never stored — only SHA-256 hash stored in `jobs.quote_token_hash`
- **Admin actions**: Netlify Functions verify admin JWT via `verifyAdmin()` + `admin_users` table check

### Key files added

| File | Purpose |
|---|---|
| `netlify/functions/check-commercial-email.js` | Step 2: returns whether email is already registered |
| `netlify/functions/submit-commercial-request.js` | Final submit for new users: auth user + client + property + job + emails (idempotent) |
| `netlify/functions/_shared/commercialRequest.js` | Shared photo linking + confirmation/admin email helpers |
| `netlify/functions/create-commercial-job.js` | Authenticated job submission (existing users, portal repeat orders) |
| `netlify/functions/get-admin-commercial-jobs.js` | Paginated, filterable admin job list |
| `netlify/functions/get-admin-commercial-job-detail.js` | Full job detail with Stripe payment summary |
| `netlify/functions/send-commercial-quote.js` | Sets estimate, creates Stripe invoice, sends quote email |
| `netlify/functions/get-commercial-quote.js` | Public token-based quote view DTO |
| `netlify/functions/accept-commercial-quote.js` | Accepts quote via token or client JWT |
| `netlify/functions/create-commercial-deposit.js` | Creates Stripe deposit PaymentIntent |
| `netlify/functions/update-commercial-job.js` | Admin: update status, scheduled date, admin notes |
| `netlify/functions/complete-commercial-job.js` | Marks complete, links photos, sends completion packet email |
| `src/pages/PortalStart.jsx` | 3-step estimate request wizard at `/portal/start` |
| `src/utils/commercialRequestDraft.js` | sessionStorage draft load/save/clear |
| `src/utils/submitCommercialDraft.js` | Submit saved draft for authenticated existing users |
| `src/pages/CommercialAdminPage.jsx` | Standalone admin page at `/admin/commercial` (two-panel: list + detail) |
| `src/pages/CommercialQuotePage.jsx` | Public quote page at `/commercial/quote/:token` (no login required) |
| `src/tests/onboarding.test.js` | Vitest coverage for onboarding handlers, draft mode, resume/idempotency logic |

### Stripe integration

Commercial jobs use Stripe Invoices (same as residential):
- Invoice metadata: `{ job_id, environment }` (distinguishes from residential `booking_id`)
- Deposit PaymentIntent metadata: `{ job_id, payment_stage: 'commercial_deposit' }`
- `stripe-webhook.js` routes by metadata key: `booking_id` → residential handlers; `job_id` → commercial handlers
- Idempotency keys prefixed with `comm-` to prevent collision with residential keys

### Completion PDF

The commercial completion packet is currently delivered by email (before/after photos via public Storage URLs + Stripe hosted invoice URL for final payment). Photos are visible in the portal at `/portal`. A dedicated PDF endpoint can be added in a future migration following the same pattern as `residential-completion-pdf.js`.

### Completion PDF

The completion PDF (`residential-completion-pdf.js`) is a clean text-only document generated with pdfkit. It contains:

- Header with booking reference (`RES-{8-char ID}`) and Squatterz branding
- Details grid: service address, completion date, crew/technician, booking reference
- Work summary: items removed, volume estimate, completion notes, disposal notes
- Invoice summary: approved quote, deposit paid, balance remaining/paid (final total shown if it differs from quote)
- Footer with generation date

Photos are intentionally excluded from the PDF — they are displayed on the live `/invoice/:token/final` web page via signed URLs. Embedding photos in pdfkit with absolute `y` positioning caused overflow into multiple blank pages.

### Bugs Fixed During E2E Testing

These bugs were discovered and fixed during end-to-end sandbox testing:

| Bug | Root Cause | Fix |
|---|---|---|
| `approve_quote_atomic` function not found | Original migration 001 RPC missing `p_decision_context` parameter | Migration 010 recreates the function |
| Booking delete blocked by FK violation | `fk_sessions_booking` was `ON DELETE RESTRICT` on circular reference | Migration 011 changes to `ON DELETE SET NULL` |
| `stripe-webhook.js: .catch is not a function` | Supabase JS v2 query builder is thenable but not a full Promise — `.catch()` is not defined on it | Changed all `.catch()` chains to `try/catch` blocks |
| Photo upload returns 401 | `getAdminToken()` in `RequestQueue.jsx` called `repo.getSession()` which returns the user object, not the session. `session?.access_token` was always `undefined` | Changed to `supabase.auth.getSession()` which returns `{ data: { session } }` with a real `access_token` |
| "Price adjustment required" on matching amounts | `approvedCents` was computed as `data.approvedQuote ? Math.round(...) : 0` — if `approvedQuote` was falsy, any non-zero final amount would differ from 0 | Guard check only runs when `data.approvedQuote` is truthy |
| Completion PDF generating 8+ blank pages | `doc.image()` with absolute `y` coordinates pushed past the page boundary; pdfkit auto-added overflow pages | Removed photo embedding entirely; PDF is now text-only |

### Key Files

| File | Purpose |
|---|---|
| `netlify/functions/_shared/stripe.js` | Stripe client, `toCents`, `calculateDepositCents`, idempotency key helpers (`ikey.*`); residential + commercial customer/invoice helpers |
| `netlify/functions/_shared/supabase.js` | `verifyAdmin()`, `verifyBusinessMember()`, `verifyCommercialClient()`, `getServiceClient()`, `generateToken()`, `sha256()` |
| `netlify/functions/approve-quote.js` | Creates Stripe customer + invoice; voids old invoice on re-approval (residential) |
| `netlify/functions/create-deposit-payment.js` | Reserves slot, creates deposit PI, attaches to invoice (residential) |
| `netlify/functions/stripe-webhook.js` | Handles `invoice_payment.paid` and `invoice.paid` for both residential (`booking_id` metadata) and commercial (`job_id` metadata) |
| `netlify/functions/payment-summary.js` | Safe payment DTO; hides `hostedInvoiceUrl` until final PI created |
| `netlify/functions/get-completion-photo-url.js` | Admin: signed upload URL for after-job photos |
| `netlify/functions/complete-job.js` | Saves completion package + creates final PI + sends single customer email (residential) |
| `netlify/functions/get-final-job-page.js` | Customer final page: completion data, signed photo URLs, final PI secret |
| `netlify/functions/residential-completion-pdf.js` | Completion PDF (pdfkit, clean text-only layout: header, job details, work summary, invoice breakdown) |
| `netlify/functions/reconcile-stripe.js` | Admin: re-link Stripe → Supabase on partial failure |
| `netlify/functions/admin-payment-action.js` | Admin: refresh, resend final link, reconcile |
| `src/pages/ApprovedQuote.jsx` | Customer quote page with Stripe Payment Element (deposit) — residential |
| `src/pages/FinalPaymentPage.jsx` | Customer final page: completion package display + final payment — residential |
| `src/pages/CommercialAdminPage.jsx` | Standalone admin queue at `/admin/commercial` — two-panel: job list + detail with status-based action panels |
| `src/pages/CommercialQuotePage.jsx` | Public quote acceptance page at `/commercial/quote/:token` — no login required; Stripe deposit payment |
| `src/pages/PortalStart.jsx` | Commercial estimate request wizard at `/portal/start` |
| `src/pages/commercial/*.jsx` | SEO marketing pages (prerendered) |
| `src/utils/seo.js` / `analytics.js` | Canonical/title helpers and GA4 `trackEvent` wrapper |
