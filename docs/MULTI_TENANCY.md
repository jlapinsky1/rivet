# Rivet — Multi-Tenancy Design

> Last updated: 2026-09-08 | Migration: `020_multi_tenant.sql`

This document describes Rivet's multi-tenant architecture that allows multiple independent businesses to use the platform safely. Each business is a **tenant** with complete data isolation.

---

## Table of Contents

- [Overview](#overview)
- [Core Tables](#core-tables)
- [Tenant-Scoped Tables](#tenant-scoped-tables)
- [Global Tables (No business_id)](#global-tables-no-business_id)
- [RLS Policy Model](#rls-policy-model)
- [Authentication Flow](#authentication-flow)
- [API Request Lifecycle](#api-request-lifecycle)
- [Client-Side Business Context](#client-side-business-context)
- [Settings Hierarchy](#settings-hierarchy)
- [File Storage Isolation](#file-storage-isolation)
- [Data Migration (Existing Tenant)](#data-migration-existing-tenant)
- [Security Invariants](#security-invariants)
- [Adding a New Tenant-Scoped Table](#adding-a-new-tenant-scoped-table)
- [Common Pitfalls](#common-pitfalls)

---

## Overview

The platform uses a **shared-database, shared-schema** multi-tenancy model:

- **One PostgreSQL database** serves all tenants
- **Every tenant-scoped table** has a `business_id uuid NOT NULL` column
- **Row-Level Security (RLS)** policies enforce isolation at the database level
- **API auth** validates business membership on every request
- **No cross-tenant queries** are possible through the authenticated client

```
┌─────────────────────────────────────────────────────────────┐
│                     PostgreSQL Database                       │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Business A   │  │  Business B   │  │  Business C   │     │
│  │  (Squatterz)  │  │  (Handyman)   │  │  (Future)     │     │
│  │              │  │              │  │              │     │
│  │  bookings    │  │  bookings    │  │  bookings    │     │
│  │  goals       │  │  goals       │  │  goals       │     │
│  │  audit_log   │  │  audit_log   │  │  audit_log   │     │
│  │  ...         │  │  ...         │  │  ...         │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                             │
│  All rows in same physical tables; RLS filters by business_id│
└─────────────────────────────────────────────────────────────┘
```

---

## Core Tables

### `businesses`

The top-level tenant record. One row per business.

```sql
CREATE TABLE businesses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id),
  name          text NOT NULL,
  slug          text UNIQUE NOT NULL,          -- URL-safe identifier (e.g. 'squatterz')
  vertical      text NOT NULL,                 -- 'junk_removal' | 'handyman'
  timezone      text NOT NULL DEFAULT 'America/New_York',
  settings      jsonb NOT NULL DEFAULT '{}',   -- business-specific configuration
  created_at    timestamptz NOT NULL DEFAULT now()
);
```

**Key fields:**
- `slug`: Used in public-facing URLs (e.g. `/b/squatterz`). Unique across all businesses.
- `vertical`: Determines which estimator, form, and display logic to use.
- `settings`: Business-specific configuration (pricing tables, add-ons, thresholds). Schema varies by vertical. This replaces the per-machine localStorage settings.

**RLS policies:**
- Members can SELECT their businesses (via `business_memberships` join)
- Only the `owner_user_id` can UPDATE (settings, name, etc.)

### `business_memberships`

Links users to businesses with a role.

```sql
CREATE TABLE business_memberships (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(business_id, user_id)
);
```

**Roles:**
- `owner`: Can update business settings, manage memberships
- `member`: Can perform all operational tasks (approve quotes, complete jobs, etc.)

Both roles have identical operational permissions. The `owner` role exists for settings management and future team management features.

**RLS policies:**
- Members can SELECT all memberships for businesses they belong to
- Only owners can INSERT/UPDATE/DELETE memberships

---

## Tenant-Scoped Tables

Every table below has `business_id uuid NOT NULL REFERENCES businesses(id)` with an index.

### Core Operations
| Table | Purpose | Parent FK |
|-------|---------|-----------|
| `bookings` | Residential job requests | — |
| `upload_sessions` | Photo upload sessions | — |
| `quote_snapshots` | Immutable quote records | `bookings.id` |
| `quote_tokens` | Token-based quote access | `bookings.id` |
| `slot_reservations` | Time slot bookings | `bookings.id` |
| `quote_acceptances` | Customer quote acceptance records | `bookings.id` |

### Completion & Payment
| Table | Purpose | Parent FK |
|-------|---------|-----------|
| `booking_completions` | Job completion records | `bookings.id` |
| `payment_access_tokens` | Final payment access | `bookings.id` |
| `support_notes` | Admin internal notes | `bookings.id` |
| `job_issues` | Dispatch-reported issues | `bookings.id` |
| `notification_events` | Customer notification queue | `bookings.id` |

### Analytics & Goals
| Table | Purpose | Parent FK |
|-------|---------|-----------|
| `business_goals` | Financial targets | — |
| `goal_snapshots` | Daily progress snapshots | `business_goals.id` |
| `calibration_records` | Estimate accuracy tracking | — |
| `expansion_leads` | Out-of-zone interest | — |

### Audit
| Table | Purpose | Parent FK |
|-------|---------|-----------|
| `audit_log` | All state changes | `bookings.id` (nullable) |

### Commercial Portal
| Table | Purpose | Parent FK |
|-------|---------|-----------|
| `commercial_clients` | Property manager accounts | — |

> **Note:** `properties`, `jobs`, `job_photos`, and `invoices` derive their business scope through the `commercial_clients` FK chain. They do NOT have a direct `business_id` column. RLS scopes them via `client_id → commercial_clients.business_id`.

---

## Global Tables (No business_id)

These tables are intentionally NOT tenant-scoped:

| Table | Reason |
|-------|--------|
| `location_cache` | Geocoding cache — address hashes are not business-specific |
| `travel_cache` | Travel time cache — shared infrastructure |
| `rate_limits` | IP-based rate limiting — cross-tenant by design |
| `processed_stripe_events` | Stripe webhook dedup — event IDs are globally unique |
| `admin_users` | Legacy table — retained for backward compatibility only |

---

## RLS Policy Model

### Helper Functions

```sql
-- Returns array of business IDs the current user belongs to
-- Used in RLS policies: business_id = ANY(user_business_ids())
CREATE FUNCTION user_business_ids() RETURNS uuid[]

-- Checks if current user is a member of a specific business
-- Used in security-definer functions
CREATE FUNCTION is_business_member(p_business_id uuid) RETURNS boolean

-- Backward-compatible admin check (checks BOTH memberships AND admin_users)
-- Used during migration transition period
CREATE FUNCTION is_admin() RETURNS boolean
```

### Policy Pattern

Every tenant-scoped table follows this pattern:

```sql
-- Read access: user can see rows for their businesses
CREATE POLICY "business_read_{table}" ON {table}
  FOR SELECT TO authenticated
  USING (business_id = ANY(user_business_ids()));

-- Write access (where applicable):
CREATE POLICY "business_write_{table}" ON {table}
  FOR INSERT TO authenticated
  WITH CHECK (business_id = ANY(user_business_ids()));
```

**Important:** Most write operations go through Netlify Functions using the **service role** (bypasses RLS). The INSERT/UPDATE policies exist for direct Supabase client writes from the frontend (goal upserts, calibration records, audit log entries).

### Child Table Policies

Tables without a direct `business_id` (like `booking_photos`, `session_photos`) scope through their parent:

```sql
CREATE POLICY "business_read_booking_photos" ON booking_photos
  FOR SELECT TO authenticated
  USING (
    booking_id IN (
      SELECT id FROM bookings WHERE business_id = ANY(user_business_ids())
    )
  );
```

---

## Authentication Flow

### Admin Endpoints (Netlify Functions)

```
Client Request
    │
    ├── Authorization: Bearer <jwt>
    ├── x-business-id: <uuid>          (optional — auto-resolved for single-business users)
    │
    ▼
verifyBusinessMember(req)
    │
    ├── 1. Extract JWT from Authorization header
    ├── 2. Validate JWT via supabase.auth.getUser(token)
    ├── 3. Resolve business_id:
    │       a. Explicit param (from function code)
    │       b. x-business-id header (from client)
    │       c. Auto-select if user has exactly 1 membership
    │       d. Return null if multiple businesses and none specified
    ├── 4. Validate membership: SELECT FROM business_memberships WHERE user_id AND business_id
    │
    ▼
Returns { user, businessId } or null
```

**Fallback pattern** (transition period):

```javascript
// In admin endpoints that previously used verifyAdmin():
const bizAuth = await verifyBusinessMember(req);
const admin = bizAuth?.user || await verifyAdmin(req);
if (!admin) return errorResponse('Unauthorized', 401);

// Use bizAuth.businessId for business-scoped operations
// Falls back to verifyAdmin() for backward compatibility
```

### Business Context Resolution Priority

1. **Explicit parameter** — function code passes `businessId` directly
2. **Request header** — `x-business-id` header from the client
3. **Auto-resolution** — user has exactly one business membership → use that business
4. **Failure** — returns `null` (401 Unauthorized)

The `business_id` is **never trusted from the client alone**. The server always confirms the user has a valid membership for the specified business.

---

## API Request Lifecycle

### Admin Write Operation (e.g., approve-quote)

```
1. Client sends POST /api/approve-quote
   Headers: Authorization: Bearer <jwt>, x-business-id: <uuid>
   Body: { bookingId, approvedPrice, ... }

2. verifyBusinessMember(req) → { user, businessId }
   - JWT validated
   - Membership confirmed

3. Load booking: SELECT ... FROM bookings WHERE id = bookingId
   - Verify booking.business_id matches authenticated businessId

4. Execute business logic (Stripe invoice creation, etc.)
   - All INSERT/UPDATE operations include business_id

5. Write audit_log entry with business_id

6. Return response
```

### Public Write Operation (e.g., create-booking)

```
1. Client sends POST /api/create-booking
   Body: { sessionId, customerName, ... }

2. Verify Turnstile + rate limit (no JWT required)

3. Load upload_session: SELECT ... WHERE id = sessionId
   - business_id comes from the upload session (set when session was created)

4. Create booking with business_id from session

5. Return response
```

---

## Client-Side Business Context

The frontend resolves business context once per session and caches it:

```javascript
// src/utils/repositories/supabaseRepo.js

let _businessContext = null;

async function getBusinessContext() {
  if (_businessContext) return _businessContext;

  const { data } = await supabase
    .from('business_memberships')
    .select('business_id, role, businesses:business_id(id, name, slug, vertical, timezone, settings)')
    .limit(1)
    .single();

  _businessContext = {
    businessId: data.business_id,
    role: data.role,
    business: data.businesses,
  };
  return _businessContext;
}

// Cache is cleared on auth state change (login/logout)
supabase.auth.onAuthStateChange(() => { _businessContext = null; });
```

The `businessId` is automatically attached to all admin API calls via the `x-business-id` header in `adminFetch()`.

---

## Settings Hierarchy

Business configuration uses a DB-first, localStorage-fallback model:

```
1. Database: businesses.settings (jsonb)     ← authoritative source
2. localStorage: junkremoval_settings        ← fallback during migration only
3. DEFAULT_SETTINGS (hardcoded)              ← final fallback
```

```javascript
// src/utils/storage.js

export async function loadSettingsFromDB(repo) {
  const dbSettings = await repo.getBusinessSettings();
  if (dbSettings && Object.keys(dbSettings).length > 0) {
    return { ...DEFAULT_SETTINGS, ...dbSettings };
  }
  return getSettings(); // falls back to localStorage → defaults
}
```

**Important:** The localStorage fallback exists ONLY to bridge the transition for Tenant #1 (Squatterz). Once migration is confirmed, remove the localStorage fallback. Settings should come exclusively from the database.

---

## File Storage Isolation

Upload paths are prefixed with `business_id`:

```
Before multi-tenancy:  sessions/{sessionId}/{uuid}.{ext}
After multi-tenancy:   {businessId}/sessions/{sessionId}/{uuid}.{ext}
```

This is enforced in `get-upload-url.js` when generating signed upload URLs. The `business_id` is resolved from the upload session, not from client input.

---

## Data Migration (Existing Tenant)

Migration `020_multi_tenant.sql` handles the transition from single-tenant to multi-tenant:

1. **Create Squatterz business** using the first `admin_users` entry as owner
2. **Create memberships** for ALL existing admin users (role: `owner`)
3. **Backfill `business_id`** on all existing records across 17 tables
4. **Set NOT NULL** constraints after backfill completes
5. **Create indexes** on all `business_id` columns
6. **Replace RLS policies** — old `is_admin()` policies → new `business_id = ANY(user_business_ids())`
7. **Update security-definer functions** to verify business membership
8. **Fix `handle_new_client()` trigger** to only auto-create commercial clients for commercial portal signups

**Critical safety measure:** Memberships are created BEFORE RLS policies are swapped. This ensures existing admins are never locked out during migration.

---

## Security Invariants

These invariants MUST hold at all times. Violating any of them is a data isolation failure.

### 1. Every tenant-scoped INSERT includes business_id

```javascript
// CORRECT
await supabase.from('audit_log').insert({
  booking_id: bookingId,
  business_id: businessId,     // ← REQUIRED
  event_type: 'quote_approved',
  admin_id: admin.id,
});

// WRONG — will fail NOT NULL constraint
await supabase.from('audit_log').insert({
  booking_id: bookingId,
  event_type: 'quote_approved',
  admin_id: admin.id,
});
```

### 2. Server never trusts client-supplied business_id alone

The server always verifies that the authenticated user is a member of the business:

```javascript
// CORRECT
const bizAuth = await verifyBusinessMember(req);
if (!bizAuth) return errorResponse('Unauthorized', 401);
const businessId = bizAuth.businessId; // verified

// WRONG — client could send any business_id
const { businessId } = await req.json(); // unverified!
```

### 3. Cross-tenant reads are impossible through RLS

Even if a Netlify Function has a bug, the frontend Supabase client (using anon key) is RLS-protected. A user can only see rows where `business_id = ANY(user_business_ids())`.

### 4. Service-role operations must scope by business_id

Netlify Functions use the service role (bypasses RLS). They MUST manually scope queries:

```javascript
// CORRECT — scoped to the authenticated business
const { data: booking } = await supabase
  .from('bookings')
  .select('*')
  .eq('id', bookingId)
  .single();
// Then verify: booking.business_id matches the authenticated business

// DANGEROUS — no business scope check
// If a user guesses another business's booking ID, they could access it
```

---

## Adding a New Tenant-Scoped Table

When adding a new table that contains tenant-specific data:

### 1. Add the column

```sql
CREATE TABLE new_table (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id),
  -- ... other columns
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_new_table_business_id ON new_table(business_id);
```

### 2. Enable RLS and add policies

```sql
ALTER TABLE new_table ENABLE ROW LEVEL SECURITY;

CREATE POLICY "business_read_new_table" ON new_table
  FOR SELECT TO authenticated
  USING (business_id = ANY(user_business_ids()));

-- Add write policies if the frontend writes directly (not via service role)
CREATE POLICY "business_write_new_table" ON new_table
  FOR INSERT TO authenticated
  WITH CHECK (business_id = ANY(user_business_ids()));
```

### 3. Include business_id in all API writes

In every Netlify Function that inserts into this table:

```javascript
await supabase.from('new_table').insert({
  business_id: businessId,  // from verifyBusinessMember() or parent record
  // ... other fields
});
```

### 4. Update integration tests

Add `business_id: TEST_BUSINESS_ID` to any mock data for this table in `integration.test.js`.

---

## Common Pitfalls

### Forgetting business_id on INSERT

**Symptom:** `NOT NULL constraint violation` on `business_id`

**Fix:** Ensure every INSERT to a tenant-scoped table includes `business_id`. For child records (like `audit_log`, `booking_completions`), resolve `business_id` from the parent record (the booking).

### Webhook handlers missing business_id

**Symptom:** Stripe webhook writes `audit_log` or `payment_access_tokens` without `business_id`

**Fix:** In webhook handlers, load the booking's `business_id` before writing any child records:

```javascript
const { data: booking } = await supabase
  .from('bookings')
  .select('id, business_id, ...')
  .eq('id', bookingId)
  .single();
// Use booking.business_id for all subsequent writes
```

### Mock Supabase missing business tables

**Symptom:** Integration tests fail with 500 or null business context

**Fix:** Ensure `beforeEach()` in `integration.test.js` seeds `businesses` and `business_memberships`:

```javascript
mockSupabase = createMockSupabase({
  admin_users: [{ user_id: 'admin-user-id' }],
  businesses: [{ id: TEST_BUSINESS_ID, slug: 'test-biz', ... }],
  business_memberships: [{ business_id: TEST_BUSINESS_ID, user_id: 'admin-user-id', role: 'owner' }],
});
```

### RLS policy using is_admin() instead of business scope

**Symptom:** User can see data from all businesses

**Fix:** Replace `is_admin()` with `business_id = ANY(user_business_ids())` in the RLS policy. The `is_admin()` function exists only for backward compatibility during the transition period.
