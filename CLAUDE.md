# Rivet — Claude Code Project Guide

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full system design.

## Quick Reference

- **Stack**: React 18, TypeScript, Vite 5, Tailwind CSS, Supabase, Netlify Functions
- **Test**: `npm test` (vitest, 68 tests across 3 files)
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
- `EconomicJob` has dual profit views: `contributionProfit` (cash) and `ownerAdjustedProfit` (time-value)
- Calibration only from completed-job actuals, never from human estimate edits
- Unknown `jobFamily` → always Review, never auto-Pass
- Estimation runs are immutable, adjustments are append-only
- Supabase persistence is **DEV-ONLY** — no RLS yet
- All WorkItems are serviceType 'Handyman' (regression tested)
- App code never changes between demo and real accounts
- All baselines marked `needs_domain_validation`

## Key Files

```
src/estimator/          — Full pipeline (types, baselines, extract, estimator, decision, persistence)
src/estimator/__tests__ — 68 tests (estimator: 41, decision: 14, pipeline: 13)
src/DecisionLab.tsx     — Internal evaluation page (Settings > Decision Lab, access-gated)
src/demo/seed.ts        — Mason Home Services seed data (runs real pipeline)
src/demo/customers.ts   — 13 residential + 2 commercial customers
src/demo/seedSupabase.ts — Pushes estimation runs/adjustments/outcomes to Supabase
src/WorkDetailDrawer.tsx — Price editing + adjustment logging (>5% requires reason code)
netlify/functions/extract.ts — Server-side Claude API
supabase/schema.sql     — DDL (dev-only, no RLS)
```

## Decision Lab

Internal-only evaluation page under Settings. Access-gated: `localStorage.rivet_lab = '1'` or `?lab=1` URL param.

Shows estimation runs table, full pipeline detail view, filters (customer, trade, recommendation, completed/pending, human-adjusted, confidence), export (JSON/CSV), and summary metrics (median errors, human-adjusted ratio, Rivet-vs-human accuracy).

## Demo Account (Mason Home Services)

Seeded account treated identically to a real customer. No special code paths.

- Seed script: `npx tsx src/demo/seedSupabase.ts` (pushes pipeline data to Supabase)
- 22 work items (10 pending + 12 completed) generated through real estimator pipeline
- 12 actual outcomes, multiple human adjustment entries with various reason codes
- Static data (workItems, customers) imported in `src/types.ts` from `src/demo/seed.ts`
