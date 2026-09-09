# Rivet — Claude Code Project Guide

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full system design.

## Quick Reference

- **Stack**: React 18, TypeScript, Vite 5, Tailwind CSS, Supabase, Netlify Functions
- **Test**: `npm test` (vitest, 92 estimator tests + others across 3 estimator test files)
- **Typecheck**: `npm run typecheck`
- **Build**: `npm run build`
- **Dev**: `npm run dev` (Vite) / `netlify dev` (with Functions)

## Critical Invariants (never violate)

| Tier | File | Owns | Never touches |
|------|------|------|---------------|
| **AI Prompt** | `extract.ts` / `netlify/functions/extract.ts` | Job classification + structured facts | Labor hours, costs, prices |
| **Deterministic Code** | `baselines.ts` + `estimator.ts` | Trade rules, labor/material ranges | Business-specific data |
| **Business Calibration** | `estimator.ts` (applyCalibration) | Per-business multipliers from actuals | Global baselines (never overwrite) |
| **Business Economics** | `types.ts` (BusinessEconomicsConfig) | Owner rates, margins, thresholds | Trade classifications or rules |

- AI never returns hours/costs/prices
- `ANTHROPIC_API_KEY` is server-side only (Netlify Function), never in browser
- Owner labor is an opportunity cost, NOT in `totalDirectCost`
- `EconomicJob` has dual profit views: `contributionProfit` (cash) and `ownerAdjustedProfit` (time-value, analytical only)
- Labor hours vs capacity hours are distinct: `contributionPerLaborHour` measures work productivity, `contributionPerCapacityHour` measures schedule productivity
- `minimumHourlyRate` = minimum contribution profit per labor hour (not stacked on ownerOpportunityRate)
- `weeklyEarningsGoal` and `requiredContributionPerCapacityHour` are contribution-profit metrics
- `estimatedQuoteRange` is market-rate pricing (laborHours * targetRate + directCosts) — NOT floored at minimumAcceptablePrice
- `minimumAcceptablePrice` is a scalar floor = max of all pricing floors (minimumJob, margin, absoluteProfit, laborProductivity, weeklyCapacityPace)
- `recommendedQuote` = `estimatedQuoteRange.expected` — can be below `minimumAcceptablePrice`
- When `evaluatedPrice < minimumAcceptablePrice`, the pricing gap is graduated: tiny (<=10%) → Review, moderate (10-25%) → Review or Pass depending on capacity scarcity, large (>25%) → Pass
- Confidence and risk reasons are always preserved on PASS recommendations (economics don't hide estimation uncertainty)
- Feedback loop captures 4 parts every time: Rivet's estimate → human adjustments → owner decision (with situational snapshot) → actual outcome
- `OwnerDecision.decisionSnapshot` captures time/capacity/financial/queue context at decision time (not estimation time)
- Calibration only from completed-job actuals, never from human estimate edits
- Unknown `jobFamily` → always Review, never auto-Pass
- Estimation runs are immutable, adjustments are append-only
- **All data is tenant-scoped** via `business_id` (UUID) + RLS policies
- UI fetches data via hooks (`useWorkItems`, `useCustomers`) — never from static imports
- All WorkItems are serviceType 'Handyman' (regression tested)
- App code never changes between demo and real accounts
- All baselines marked `needs_domain_validation`

## Key Files

```
src/lib/AuthProvider.tsx    — Supabase auth + business context provider
src/hooks/useWorkItems.ts   — Tenant-scoped work items from Supabase
src/hooks/useCustomers.ts   — Tenant-scoped customers/companies from Supabase
src/admin/RivetApp.tsx      — Login + dashboard entry (mounted at /login route)
src/admin/useWorkItems.ts   — Work items hook used by admin dashboard (also Supabase-backed)
src/estimator/              — Full pipeline (types, baselines, extract, estimator, decision, diagnostics, persistence)
src/estimator/__tests__     — 92 tests (estimator: 52, decision: 25, pipeline: 15)
src/admin/DecisionLab.tsx   — Internal evaluation page (Settings > Decision Lab, access-gated)
src/admin/WorkDetailDrawer.tsx — Price editing + adjustment logging + owner decision recording (>5% requires reason code)
src/demo/seed.ts            — Mason Home Services seed data (runs real pipeline, used by tests)
src/demo/customers.ts       — 13 residential + 2 commercial customers (test reference data)
netlify/functions/extract.ts — Server-side Claude API
supabase/migrations/020_multi_tenant.sql — Multi-tenant foundation (businesses, memberships, RLS)
supabase/migrations/021_handyman_tenant_tables.sql — work_items, customers, companies, properties
supabase/seed-mason-data.sql — Business + membership + customers + companies for demo account
supabase/seed-data.sql       — Auto-generated estimation runs + work items
supabase/migrations/022_feedback_loop.sql — owner_decisions table + quoted_price on actual_outcomes
public/embed.js               — Drop-in embeddable quote form (inline + popup modes)
src/pages/VerticalQuoteForm.jsx — Quote request form (embed-aware via ?embed=1)
src/pages/HostedQuoteForm.jsx  — Route wrapper for /request/:slug
```

## Decision Lab

Internal-only evaluation page under Settings. Access-gated: `localStorage.rivet_lab = '1'` or `?lab=1` URL param.

Shows estimation runs table, full pipeline detail view, filters (customer, trade, recommendation, completed/pending, human-adjusted, confidence), export (JSON/CSV), and summary metrics (median errors, human-adjusted ratio, Rivet-vs-human accuracy).

## Demo Account (Mason Home Services)

Login: `mason@myrivet.io` / `MasonDemo2024!`

Seeded account treated identically to a real customer. No special code paths.

### Seed Order (Supabase SQL Editor):
1. `supabase/schema.sql` — estimation tables
2. `supabase/migrations/020_multi_tenant.sql` — businesses, memberships, RLS
3. `supabase/migrations/021_handyman_tenant_tables.sql` — work_items, customers, companies, properties
4. `supabase/seed-demo-user.sql` — creates auth user
5. `supabase/seed-mason-data.sql` — business, membership, customers, companies, properties
6. `supabase/seed-data.sql` — estimation runs, adjustments, outcomes, work items (regenerate with `npx tsx supabase/generate-seed-sql.ts`)

- Business UUID: `a0000000-0000-0000-0000-000000000001`
- 22 work items (10 pending + 12 completed) generated through real estimator pipeline
- 12 actual outcomes, multiple human adjustment entries with various reason codes
- All data scoped to Mason's business_id — never visible to other accounts
