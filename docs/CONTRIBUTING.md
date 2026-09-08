# Rivet — Contributing Guide

> For developers and AI agents working on the Rivet codebase

This guide provides everything you need to understand, navigate, and safely modify the Rivet platform. Read this before making changes.

---

## Table of Contents

- [Quick Orientation](#quick-orientation)
- [Development Setup](#development-setup)
- [Codebase Conventions](#codebase-conventions)
- [Making Changes Safely](#making-changes-safely)
- [Multi-Tenancy Checklist](#multi-tenancy-checklist)
- [Testing](#testing)
- [Common Tasks](#common-tasks)
- [Architecture Decision Records](#architecture-decision-records)
- [Glossary](#glossary)

---

## Quick Orientation

**Rivet** is a multi-tenant SaaS platform for service businesses. *Better jobs. Better margins.*

| What | Where |
|------|-------|
| API endpoints | `netlify/functions/*.js` |
| Shared server code | `netlify/functions/_shared/` |
| React frontend | `src/` |
| Data access layer | `src/utils/repositories/supabaseRepo.js` |
| Business logic (client-side) | `src/utils/` (goalEngine, decisionEngine, estimateBuilder, etc.) |
| Settings | `src/utils/storage.js` (DB-first, localStorage fallback) |
| Database migrations | `supabase/migrations/` (001–020) |
| Integration tests | `netlify/functions/__tests__/integration.test.js` |
| Unit tests | `src/utils/__tests__/` |
| Python E2E tests | `tests/` |
| Documentation | `docs/` |

### Key Files You'll Touch Often

| File | What It Does | When You'd Change It |
|------|-------------|---------------------|
| `_shared/supabase.js` | Auth functions, DB client | Adding auth mechanisms |
| `_shared/stripe.js` | Stripe client, price math | Payment changes |
| `supabaseRepo.js` | All frontend data access | Adding/changing data fetches |
| `storage.js` | Business settings | Changing default config |
| `integration.test.js` | Mock Supabase integration tests | Any API endpoint change |
| `src/admin/screens.tsx` | All Rivet admin screens (Home, Work, Schedule, etc.) | Changing the operator dashboard UI |
| `src/admin/useWorkItems.ts` | Booking → WorkItem normalization + decision engine | Changing how jobs appear in the admin UI |
| `src/admin/WorkDetailDrawer.tsx` | Job detail slide-over with approve/decline | Changing job actions or detail display |
| `src/admin/admin.css` | Rivet design system (CSS variables, all UI styles) | Changing visual design |

---

## Development Setup

```bash
npm install
cp .env.example .env           # Fill in Supabase + Stripe + API keys
netlify dev                     # Starts on http://localhost:8888
```

For payment testing:
```bash
stripe listen --forward-to localhost:8888/api/stripe-webhook
# Copy whsec_... value to STRIPE_WEBHOOK_SECRET in .env
```

### Required Environment Variables

See `README.md` for the full list. Critical ones:
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- `VITE_STRIPE_PUBLISHABLE_KEY`

---

## Codebase Conventions

### Netlify Functions

Every function follows this pattern:

```javascript
import { getServiceClient, verifyBusinessMember, verifyAdmin, jsonResponse, errorResponse } from './_shared/supabase.js';

export default async function handler(req) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    // 1. Auth
    const bizAuth = await verifyBusinessMember(req);
    const admin = bizAuth?.user || await verifyAdmin(req);
    if (!admin) return errorResponse('Unauthorized', 401);

    // 2. Parse + validate input
    const { bookingId } = await req.json();
    if (!bookingId) return errorResponse('bookingId is required');

    // 3. Load data (verify business scope)
    const supabase = getServiceClient();
    const { data: booking } = await supabase
      .from('bookings')
      .select('id, business_id, status, ...')
      .eq('id', bookingId)
      .single();

    // 4. Business logic

    // 5. Write results (always include business_id)
    await supabase.from('audit_log').insert({
      booking_id: bookingId,
      business_id: booking.business_id,
      event_type: 'something_happened',
      admin_id: admin.id,
    });

    // 6. Return response
    return jsonResponse({ success: true });
  } catch (e) {
    console.error('handler error:', e);
    return errorResponse('Server error', 500);
  }
}

export const config = { path: '/api/endpoint-name' };
```

### Naming

- **Files:** kebab-case (`approve-quote.js`, `completeJobCore.js`)
- **Functions:** camelCase (`verifyBusinessMember`, `calculateDepositCents`)
- **DB columns:** snake_case (`business_id`, `customer_name`)
- **JS objects:** camelCase (normalized in `supabaseRepo.js` via `normalizeBooking()`)
- **Constants:** UPPER_SNAKE (`DEFAULT_SETTINGS`, `TEST_BUSINESS_ID`)

### Error Handling

- Netlify Functions: wrap in try/catch, return `errorResponse()` with appropriate status
- Never expose stack traces or internal errors to the client
- Log errors with context: `console.error('approve-quote error:', e, { bookingId })`
- Stripe errors in completion flow are non-fatal — completion record is saved, retry continues from the failed step

### Idempotency

All state-changing operations must be idempotent:

```javascript
// Check if already done before doing it
const { data: existing } = await supabase
  .from('booking_completions')
  .select('id')
  .eq('booking_id', bookingId)
  .maybeSingle();

if (existing) {
  // Already done — return success without re-executing
  return jsonResponse({ success: true, idempotent: true });
}
```

---

## Multi-Tenancy Checklist

**Before merging any PR that touches data, verify ALL of these:**

### When Adding a New Table

- [ ] Table has `business_id uuid NOT NULL REFERENCES businesses(id)`
- [ ] Index created: `CREATE INDEX idx_{table}_business_id ON {table}(business_id)`
- [ ] RLS enabled: `ALTER TABLE {table} ENABLE ROW LEVEL SECURITY`
- [ ] Read policy: `USING (business_id = ANY(user_business_ids()))`
- [ ] Write policy if frontend writes directly
- [ ] Migration file added to `supabase/migrations/`

### When Adding a New API Endpoint

- [ ] Auth: uses `verifyBusinessMember(req)` (with `verifyAdmin` fallback if needed)
- [ ] All INSERTs include `business_id`
- [ ] All SELECTs for admin data verify `business_id` matches authenticated business
- [ ] Audit log entries include `business_id`
- [ ] Integration test added/updated with `business_id: TEST_BUSINESS_ID`

### When Modifying Existing Endpoints

- [ ] Existing `business_id` propagation not broken
- [ ] All new INSERTs include `business_id`
- [ ] Integration tests still pass

### When Adding Client-Side Features

- [ ] Data fetched through `supabaseRepo.js` (RLS-protected)
- [ ] No hardcoded business references (use `getBusinessContext()`)
- [ ] Admin API calls go through `adminFetch()` (auto-attaches `x-business-id`)

---

## Testing

### Running Tests

```bash
npm test              # All JS tests (vitest, single pass)
npm run test:watch    # Watch mode

# Specific test files
npx vitest run netlify/functions/__tests__/integration.test.js
npx vitest run src/utils/__tests__/goalEngine.test.js
```

### Test Architecture

**Integration tests** (`netlify/functions/__tests__/integration.test.js`):
- Mock Supabase client with in-memory tables
- Tests real handler logic without a live database
- 33 tests covering upload sessions, bookings, admin auth, quote lifecycle, job completion
- Mock DB seeded with `businesses` and `business_memberships` in `beforeEach()`

**Unit tests** (`src/utils/__tests__/*.test.js`):
- Pure function tests for business logic
- Goal engine, decision engine, calibration, risk flags, etc.

**Python E2E tests** (`tests/`):
- Run against a live `netlify dev` instance
- Full HTTP request/response testing
- Requires `NODE_ENV=test ENABLE_TEST_ENDPOINTS=true`

### Adding Integration Tests

When testing a new endpoint:

```javascript
// 1. The mock DB is pre-seeded in beforeEach() with:
//    - businesses (TEST_BUSINESS_ID)
//    - business_memberships (admin-user-id → TEST_BUSINESS_ID)
//    - admin_users (admin-user-id)

// 2. Use makeRequest() with admin auth:
const res = await handler(makeRequest('POST',
  { bookingId: 'some-id' },
  { authorization: 'Bearer valid-admin-token' }
));

// 3. Parse and assert:
const { status, body } = await parseResponse(res);
expect(status).toBe(200);
expect(body.success).toBe(true);

// 4. Check mock DB state:
const auditEntries = mockSupabase._db.audit_log.filter(
  e => e.event_type === 'expected_event'
);
expect(auditEntries).toHaveLength(1);
expect(auditEntries[0].business_id).toBe(TEST_BUSINESS_ID);
```

### Pre-Existing Test Failures

Two tests have pre-existing failures unrelated to multi-tenancy:
- `estimateBuilder.test.js`: `distMissing.financial` expected true got false
- `riskFlags.test.js`: `minimal_photos` flag not found

These are known issues and do not block PRs.

---

## Common Tasks

### Add a New Admin Endpoint

1. Create `netlify/functions/my-endpoint.js` following the pattern above
2. Add `business_id` to all data writes
3. Add integration test in `integration.test.js`
4. Export `config = { path: '/api/my-endpoint' }`
5. Document in `docs/API_REFERENCE.md`

### Add a Column to an Existing Table

1. Create `supabase/migrations/NNN_description.sql`
2. If the table is tenant-scoped, no changes needed (business_id already exists)
3. Update `normalizeBooking()` in `supabaseRepo.js` if it's on `bookings`
4. Update any functions that SELECT from that table

### Add a New Business Vertical

1. Create `src/estimators/{vertical}.js` with `estimateJob()` and `detectRisks()`
2. Add the vertical to the `businesses.vertical` CHECK constraint
3. Update the estimator selection in `useCommercialQuoteAnalysis.js`
4. Create the intake form component
5. Add risk detection rules specific to the vertical

### Onboard a New Tenant

Currently done via SQL:

```sql
-- 1. Create the business
INSERT INTO businesses (owner_user_id, name, slug, vertical, timezone, settings)
VALUES ('<user-uuid>', 'Business Name', 'slug', 'handyman', 'America/New_York', '{}');

-- 2. Create the membership
INSERT INTO business_memberships (business_id, user_id, role)
VALUES ('<business-uuid>', '<user-uuid>', 'owner');
```

Phase 3 will add self-service onboarding.

---

## Architecture Decision Records

### Why shared-database, shared-schema?

- Simplest multi-tenant model for early stage
- Single deploy, single migration path
- RLS provides strong isolation without infrastructure complexity
- Easy to query across tenants for platform analytics (future)
- Can migrate to schema-per-tenant or DB-per-tenant later if needed

### Why business_id on every table (not just bookings)?

- Enables direct RLS policies without JOINs on every read
- Simpler query patterns (no need to join through bookings to check access)
- Audit log entries are self-contained (don't need to join to bookings to verify access)
- Small storage cost, large query simplicity benefit

### Why localStorage fallback for settings?

- Existing Squatterz deployment has settings in localStorage only
- DB-first with localStorage fallback prevents data loss during migration
- The fallback is temporary — remove once Tenant #1 confirms DB settings are correct

### Why verifyAdmin() fallback alongside verifyBusinessMember()?

- Ensures zero downtime during migration
- If `business_memberships` data is incomplete, admins aren't locked out
- Will be removed once migration is fully verified

### Why not RLS on commercial portal tables via business_id directly?

- `properties` and `jobs` scope through `commercial_clients` → already have RLS via `client_id`
- Adding direct `business_id` to these tables would duplicate the FK chain
- Admin access to commercial data uses `business_admin_read_commercial_clients` policy on the top-level table

---

## Glossary

| Term | Definition |
|------|-----------|
| **Tenant** | A business using the Rivet platform. Identified by `business_id`. |
| **Business** | Same as tenant. A row in the `businesses` table. |
| **Vertical** | The type of service business (e.g., `junk_removal`, `handyman`). Determines which estimator and forms to use. |
| **Operator** | A business owner or team member who uses the admin dashboard. |
| **Booking** | A residential job request from an end customer. |
| **Job** | A commercial work order from a property manager (commercial portal). |
| **Decision engine** | Client-side system that evaluates jobs and recommends Take/Review/Pass. |
| **Goal engine** | Client-side system that tracks financial progress against targets. |
| **Estimator** | Vertical-specific module that calculates costs, prices, and profit for a job. |
| **EconomicJob** | Standardized output shape from any estimator — the common currency for the decision engine. |
| **Quote snapshot** | Immutable record of an approved quote (price, estimate, settings, decision context). |
| **Service role** | Supabase admin key that bypasses RLS. Used by Netlify Functions only. |
| **Anon key** | Supabase public key that enforces RLS. Used by the frontend. |
| **RLS** | Row-Level Security — PostgreSQL feature that filters rows based on the authenticated user. |
| **Idempotency key** | Client-generated unique string that prevents duplicate record creation on retry. |
| **Slug** | URL-safe business identifier (e.g., `squatterz`). Used in public URLs. |
