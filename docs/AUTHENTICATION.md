# Rivet — Authentication & Authorization

> Last updated: 2026-09-08

This document describes every authentication and authorization mechanism in the Rivet platform, including JWT handling, token types, business membership validation, and the security model for each user type.

---

## Table of Contents

- [Auth Model Summary](#auth-model-summary)
- [Business Membership Auth (Admin)](#business-membership-auth-admin)
- [Legacy Admin Auth (Transition)](#legacy-admin-auth-transition)
- [Commercial Client Auth](#commercial-client-auth)
- [Dispatch Token Auth](#dispatch-token-auth)
- [Quote Token Auth](#quote-token-auth)
- [Payment Access Token Auth](#payment-access-token-auth)
- [Public Endpoints (No Auth)](#public-endpoints-no-auth)
- [Stripe Webhook Auth](#stripe-webhook-auth)
- [Token Lifecycle Summary](#token-lifecycle-summary)
- [RLS and Service Role](#rls-and-service-role)

---

## Auth Model Summary

| User Type | Auth Mechanism | Verified By | Scope |
|-----------|---------------|-------------|-------|
| Business operator (admin) | Supabase JWT + business membership | `verifyBusinessMember(req)` | Business-scoped |
| Business operator (legacy) | Supabase JWT + `admin_users` table | `verifyAdmin(req)` | Global (deprecated) |
| Commercial client | Supabase JWT + `commercial_clients` table | `verifyCommercialClient(req)` | Client-scoped |
| Dispatch crew | Dispatch token (booking-scoped) | Token hash lookup | Booking-scoped |
| End customer (quote) | Quote token in URL | Token hash lookup | Booking-scoped, read-only |
| End customer (payment) | Payment access token in URL | Token hash lookup | Booking-scoped, 7-day expiry |
| Stripe | Webhook signature | `stripe.webhooks.constructEvent()` | Event-scoped |
| Public visitor | Turnstile CAPTCHA + rate limit | `verifyTurnstile()` + `checkRateLimit()` | IP-scoped |

---

## Business Membership Auth (Admin)

This is the **primary auth mechanism** for all admin/operator endpoints.

### How It Works

```
POST /api/approve-quote
Authorization: Bearer <supabase-jwt>
x-business-id: <uuid>                  ← optional (auto-resolved for single-business users)
```

**Server-side verification** (`netlify/functions/_shared/supabase.js`):

```javascript
export async function verifyBusinessMember(req, { businessId: explicitBusinessId } = {}) {
  // 1. Extract JWT from Authorization header
  const token = req.headers.get('authorization')?.slice(7);

  // 2. Validate JWT via Supabase
  const { data: { user } } = await supabase.auth.getUser(token);

  // 3. Resolve business_id (priority order):
  //    a. Explicit param (passed by function code)
  //    b. x-business-id header (from client)
  //    c. Auto-select if user has exactly 1 membership
  const resolvedBusinessId = explicitBusinessId
    || req.headers.get('x-business-id')
    || autoResolveFromMemberships(user.id);

  // 4. Validate membership
  const { count } = await supabase
    .from('business_memberships')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('business_id', resolvedBusinessId);

  if (count === 0) return null;
  return { user, businessId: resolvedBusinessId };
}
```

### Business ID Resolution Priority

1. **Explicit parameter** — function code passes `businessId` directly (e.g., resolved from a parent record)
2. **Request header** — `x-business-id` header from the frontend
3. **Auto-resolution** — user belongs to exactly one business → that business is used
4. **Failure** — user has 0 or 2+ businesses and none specified → returns `null` (401)

### Client-Side Integration

The frontend automatically attaches the `x-business-id` header to all admin API calls:

```javascript
// src/utils/repositories/supabaseRepo.js
async function adminFetch(path, options = {}) {
  const session = await supabase.auth.getSession();
  const ctx = await getBusinessContext(); // cached, cleared on auth change

  return fetch(path, {
    ...options,
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      ...(ctx?.businessId && { 'x-business-id': ctx.businessId }),
    },
  });
}
```

### Roles

| Role | Permissions |
|------|------------|
| `owner` | All operational tasks + update business settings + manage memberships |
| `member` | All operational tasks (approve quotes, complete jobs, etc.) |

Both roles have identical operational permissions today. The distinction exists for future team management features.

---

## Legacy Admin Auth (Transition)

During the multi-tenancy migration, endpoints use a fallback pattern:

```javascript
const bizAuth = await verifyBusinessMember(req);
const admin = bizAuth?.user || await verifyAdmin(req);
if (!admin) return errorResponse('Unauthorized', 401);
```

`verifyAdmin(req)` checks the **legacy `admin_users` table** instead of `business_memberships`. This ensures existing admin users work even if the membership migration hasn't completed.

**Plan:** Remove `verifyAdmin()` fallback once all tenants are confirmed migrated to `business_memberships`. The `admin_users` table will be dropped.

### `is_admin()` SQL Function

The database-side `is_admin()` function also uses a dual check:

```sql
CREATE FUNCTION is_admin() RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM business_memberships WHERE user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid());
$$;
```

This function is used by older RLS policies that haven't been migrated to `user_business_ids()` yet.

---

## Commercial Client Auth

Property managers authenticate through Supabase Auth and are verified against the `commercial_clients` table.

```javascript
export async function verifyCommercialClient(req) {
  const token = req.headers.get('authorization')?.slice(7);
  const { data: { user } } = await supabase.auth.getUser(token);

  const { data: client } = await supabase
    .from('commercial_clients')
    .select('id, company_name, contact_name, phone, user_id')
    .eq('user_id', user.id)
    .single();

  return client ? { user, client } : null;
}
```

**RLS scoping:** Commercial clients can only see their own data via `user_id = auth.uid()` policies on `commercial_clients`, `properties`, and `jobs`.

---

## Dispatch Token Auth

The dispatch crew interface uses booking-scoped tokens (not JWTs). These are issued when a job is dispatched.

| Property | Value |
|----------|-------|
| Storage | `dispatch_tokens` table |
| Format | SHA-256 hash of random token |
| Scope | Single booking |
| Expiry | Time-limited |
| Revocation | `revoked_at` timestamp |

Verification happens in each dispatch endpoint by looking up the token hash and confirming it's not expired/revoked.

---

## Quote Token Auth

Issued when an admin approves a quote. Allows the customer to view their quote and initiate payment without logging in.

| Property | Value |
|----------|-------|
| Storage | `quote_tokens` table |
| Hash | SHA-256 stored in `token_hash` |
| URL format | `/quote/:rawToken` |
| Scope | Single booking + quote version |
| Expiry | `expires_at` (matches quote expiry) |
| Used | `used_at` set when deposit confirmed |
| Revoked | `revoked_at` set when superseded by new quote version |
| Raw token stored? | **Never** — only the hash |

**Lifecycle:**
1. Admin approves quote → `approve_quote_atomic()` creates token
2. Customer opens `/quote/:token` → `get-customer-quote` looks up hash
3. Customer initiates payment → `create-deposit-payment` validates token
4. Stripe webhook confirms deposit → `confirm_deposit_atomic()` sets `used_at`
5. Admin re-approves → old token gets `revoked_at`, new token created

---

## Payment Access Token Auth

Issued when a job is completed. Allows the customer to view the completion report and pay the final balance.

| Property | Value |
|----------|-------|
| Storage | `payment_access_tokens` table |
| Hash | SHA-256 stored in `token_hash` |
| URL format | `/invoice/:rawToken/final` |
| Purpose | `final_payment` |
| Scope | Single booking |
| Expiry | 7 days from creation |
| Revocation | Admin can revoke via `admin-payment-action` |
| Raw token stored? | **Never** — only the hash |

---

## Public Endpoints (No Auth)

Public endpoints are protected by:

1. **Cloudflare Turnstile** — bot detection on form submissions
2. **IP rate limiting** — `check_rate_limit()` Postgres function
3. **Input validation** — server-side field validation
4. **Service area checks** — ZIP code validation

```javascript
// Typical public endpoint protection
const ip = getClientIp(req);
const turnstile = await verifyTurnstile(body.turnstileToken, ip);
if (!turnstile.success) return errorResponse(turnstile.error, 403);

const allowed = await checkRateLimit(supabase, ip, 'create-booking');
if (!allowed) return errorResponse('Too many requests', 429);
```

Public endpoints that create data (`create-booking`, `create-upload-session`) associate records with a `business_id` resolved from context (e.g., the upload session or a business slug), never from untrusted client input.

---

## Stripe Webhook Auth

Stripe webhooks are verified using the webhook signature:

```javascript
const event = stripe.webhooks.constructEvent(
  rawBody,
  req.headers.get('stripe-signature'),
  process.env.STRIPE_WEBHOOK_SECRET
);
```

The webhook handler also uses the `processed_stripe_events` table for idempotency — each event is recorded before processing and marked `processed` or `failed` after.

---

## Token Lifecycle Summary

```
Quote Approval:
  Admin approves → quote_token created → customer views quote
  Customer pays deposit → deposit confirmed → quote_token.used_at set
  Admin re-approves → old token.revoked_at set, new token created

Job Completion:
  Admin completes job → payment_access_token created → customer emailed
  Customer views report → payment page loads via token
  Token expires after 7 days → admin can reissue via admin-payment-action

Dispatch:
  Admin dispatches crew → dispatch_token created
  Crew completes job → token consumed
```

---

## RLS and Service Role

### Frontend (Anon Key)

The React frontend uses the Supabase anon key. All queries go through RLS:

```
business_id = ANY(user_business_ids())
```

Even if a frontend bug sends a malformed query, RLS prevents cross-tenant data access.

### Netlify Functions (Service Role)

Netlify Functions use the service role key, which **bypasses RLS**. This is necessary for:
- Cross-table operations (e.g., loading a booking then writing audit_log)
- Public endpoints that write data (e.g., create-booking)
- Webhook handlers that don't have a user JWT

**Critical:** Service-role operations MUST manually verify business scope. The server resolves `business_id` from trusted sources (JWT membership, parent records) and includes it in all writes.

### Security-Definer Functions

Database functions marked `SECURITY DEFINER` run with the defining role's privileges (typically superuser). They enforce their own authorization:

```sql
-- Example: admin_delete_booking checks business membership internally
IF NOT is_business_member(v_business_id) THEN
  RAISE EXCEPTION 'Unauthorized';
END IF;
```
