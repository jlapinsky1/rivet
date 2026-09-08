# Rivet — API Reference

> Last updated: 2026-09-08

All API endpoints are Netlify Functions (serverless, ES modules). Each function exports a default `handler(req)` and a `config` object specifying the URL path.

---

## Table of Contents

- [Conventions](#conventions)
- [Public Endpoints (No Auth)](#public-endpoints-no-auth)
- [Admin Endpoints (JWT + Business Membership)](#admin-endpoints-jwt--business-membership)
- [Token-Based Endpoints](#token-based-endpoints)
- [Dispatch Endpoints](#dispatch-endpoints)
- [Commercial Portal Endpoints](#commercial-portal-endpoints)
- [Stripe Webhook](#stripe-webhook)
- [Test-Only Endpoints](#test-only-endpoints)

---

## Conventions

### Authentication Headers

```
Authorization: Bearer <supabase-jwt>     # Admin and commercial client endpoints
x-business-id: <uuid>                    # Optional — auto-resolved for single-business users
```

### Response Format

All endpoints return JSON:

```json
// Success
{ "bookingId": "uuid", "success": true, ... }

// Error
{ "error": "Human-readable error message" }
```

### Error Status Codes

| Code | Meaning |
|------|---------|
| 400 | Bad request (validation failure, missing fields) |
| 401 | Unauthorized (missing/invalid JWT, not a business member) |
| 403 | Forbidden (Turnstile failure, rate limited) |
| 404 | Not found |
| 405 | Method not allowed |
| 429 | Rate limited |
| 500 | Server error |
| 502 | Upstream error (Stripe, Supabase) |
| 503 | Service unavailable (infrastructure error) |

### Business ID Propagation

Every admin endpoint resolves `business_id` via `verifyBusinessMember(req)`. The resolved `businessId` is used for:
- Scoping data reads (verifying the booking belongs to this business)
- Including in all INSERT operations
- Audit log entries

---

## Public Endpoints (No Auth)

These endpoints are accessible without authentication. Protected by Turnstile CAPTCHA and/or IP rate limiting.

### `POST /api/create-upload-session`

Creates a photo upload session for a new booking request.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `turnstileToken` | string | Yes | Cloudflare Turnstile verification token |
| `businessSlug` | string | No | Business slug (defaults to first business for backward compat) |

**Response:** `{ sessionId, maxPhotos, expiresAt }`

### `POST /api/get-upload-url`

Returns a signed upload URL for a photo within an active session.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sessionId` | string | Yes | Upload session ID |
| `fileName` | string | Yes | Original filename (extension validated) |
| `contentType` | string | Yes | MIME type (must be image/*) |

**Response:** `{ signedUrl, storagePath, photoId }`

**Storage path format:** `{businessId}/sessions/{sessionId}/{uuid}.{ext}`

### `POST /api/create-booking`

Submits a residential booking request. Requires an active, unconsumed upload session.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sessionId` | string | Yes | Upload session ID |
| `idempotencyKey` | string | Yes | Client-generated unique key |
| `customerName` | string | Yes | |
| `customerPhone` | string | Yes | |
| `customerEmail` | string | No | |
| `address`, `city`, `zip` | string | Yes | |
| `fullAddress` | string | Yes | |
| `quantity`, `stairs`, `accessType`, `description` | string | No | |
| `preferredDate`, `secondChoiceDate` | string | No | |
| `timePreference` | string | No | |
| `turnstileToken` | string | Yes | |

**Response:** `{ bookingId, idempotent }` (status 201, or 200 if idempotent)

**Business ID:** Resolved from the upload session's `business_id`.

### `POST /api/check-service-area`

Checks if a ZIP code is within the serviceable area.

| Field | Type | Required |
|-------|------|----------|
| `zip` | string | Yes |

**Response:** `{ serviceable, reason }`

### `POST /api/geocode-booking`

Geocodes a booking address via Nominatim and calculates travel time.

| Field | Type | Required |
|-------|------|----------|
| `bookingId` | string | Yes |

### `GET /api/health`

Returns `{ status: "ok" }`. No auth, no side effects.

### `POST /api/notify-expansion`

Captures an out-of-zone expansion lead.

| Field | Type | Required |
|-------|------|----------|
| `email` | string | Yes |
| `name` | string | No |
| `zip` | string | No |

---

## Admin Endpoints (JWT + Business Membership)

All endpoints require `Authorization: Bearer <jwt>` header. Auth verified via `verifyBusinessMember(req)` with `verifyAdmin(req)` fallback.

### `POST /api/approve-quote`

Approves a quote, creates a Stripe customer and invoice, sends the customer a quote email.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `bookingId` | string | Yes | |
| `approvedPrice` | number | Yes | Dollar amount |
| `recommendedPrice` | number | No | System-recommended price |
| `estimateSnapshot` | object | No | Full estimate at approval time |
| `settingsSnapshot` | object | No | Business settings at approval time |
| `availableSlots` | array | Yes | Available time slots for customer |
| `customerTerms` | object | No | Terms shown to customer |
| `adminOverride` | object | No | Manual override notes |
| `decisionContext` | object | No | Decision engine output (audit trail) |

**Response:** `{ success, quoteUrl, version, invoiceId }`

**Side effects:** Creates Stripe customer + invoice, sends email via Resend, writes audit_log.

### `POST /api/complete-job`

Saves the job completion package and triggers final payment flow.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `bookingId` | string | Yes | |
| `completedAt` | string | Yes | ISO datetime |
| `technicianName` | string | Yes | |
| `itemsRemoved` | string | Yes | |
| `completionNotes` | string | Yes | |
| `finalAmountCents` | number | Yes | Final price in cents |
| `afterPhotoStoragePaths` | string[] | No | Validated server-side paths |
| `priceAdjustmentReason` | string | Conditional | Required if final != approved |
| `volumeEstimate` | string | No | |
| `disposalNotes` | string | No | |

**Response:** `{ success, completionId, amountRemainingCents, finalPaymentLinkSent }`

**Side effects:** Creates completion record, updates booking status, creates Stripe final PaymentIntent, generates payment access token, sends customer email.

### `POST /api/decline-booking`

Declines a residential booking request.

| Field | Type | Required |
|-------|------|----------|
| `bookingId` | string | Yes |
| `reason` | string | No |

### `POST /api/resend-quote`

Reissues the quote email with a fresh token.

| Field | Type | Required |
|-------|------|----------|
| `bookingId` | string | Yes |

### `POST /api/reconcile-stripe`

Detects and repairs mismatches between Stripe and Supabase state.

| Field | Type | Required |
|-------|------|----------|
| `bookingId` | string | Yes |

**Response:** `{ mismatches, actions }` — lists what was found and what was fixed.

### `POST /api/admin-payment-action`

Admin payment management (refresh status, resend final payment link, reconcile).

| Field | Type | Required |
|-------|------|----------|
| `bookingId` | string | Yes |
| `action` | string | Yes | `refresh`, `resend_final_link`, `reconcile` |

### `POST /api/admin-support-note`

Adds an internal note to a booking.

| Field | Type | Required |
|-------|------|----------|
| `bookingId` | string | Yes |
| `body` | string | Yes |

### `POST /api/analyze-photos`

Sends booking photos to Claude AI for analysis.

| Field | Type | Required |
|-------|------|----------|
| `bookingId` | string | Yes |

### `GET /api/get-admin-completed-bookings`

Paginated, server-side search of completed bookings.

Query params: `page`, `pageSize`, `search`

### `GET /api/get-admin-completion-detail`

Full completion detail for a single booking.

Query params: `bookingId`

### `PUT /api/admin/service-area`

Updates the service area ZIP configuration (stored in Netlify Blobs).

### `GET /api/admin/service-area`

Returns the current service area configuration.

---

## Token-Based Endpoints

### `GET /api/get-customer-quote`

Customer quote view. Auth: quote token in query string.

Query params: `token` (raw token, hashed server-side for lookup)

**Response:** Safe DTO with price, terms, available slots. No internal costs or business data exposed.

### `POST /api/create-deposit-payment`

Creates the deposit PaymentIntent and reserves a time slot.

Auth: quote token in body.

| Field | Type | Required |
|-------|------|----------|
| `tokenHash` | string | Yes |
| `resourceId` | string | Yes |
| `pickupDate` | string | Yes |
| `startTime`, `endTime` | string | Yes |
| `confirmations` | array | Yes | Customer confirmations (min 3) |
| `idempotencyKey` | string | Yes |

### `POST /api/accept-quote`

Legacy slot reservation (pre-payment flow). Auth: quote token.

### `GET /api/payment-summary`

Payment status DTO. Auth: payment token or admin JWT.

### `GET /api/get-final-job-page`

Customer final page: completion data + signed photo URLs + final PI secret. Auth: payment access token.

### `GET /api/residential-completion-pdf`

Completion report PDF. Auth: payment access token or admin JWT.

---

## Dispatch Endpoints

All dispatch endpoints use booking-scoped dispatch tokens.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/dispatch-status` | GET | Current job status |
| `/api/dispatch-job` | POST | Mark job in_progress (requires deposit confirmed) |
| `/api/dispatch-complete` | POST | Submit completion package from dispatch |
| `/api/dispatch-photo` | POST | Upload completion photo |
| `/api/dispatch-photo-upload-url` | POST | Get signed URL for photo upload |
| `/api/dispatch-report-issue` | POST | Report a job issue |
| `/api/dispatch-jobs-today` | GET | List today's jobs |

---

## Commercial Portal Endpoints

### Public (Rate-Limited)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/check-commercial-email` | POST | Email lookup for step 2 of onboarding |
| `/api/submit-commercial-request` | POST | New-user submit: creates auth user + client + property + job |
| `/api/signup` | POST | Portal account creation |
| `/api/reset-password` | POST | Password reset email |

### Authenticated (Client JWT)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/create-commercial-job` | POST | Submit work order (existing users) |
| `/api/accept-commercial-quote` | POST | Accept quote (token or client JWT) |
| `/api/create-commercial-deposit` | POST | Create deposit PaymentIntent |
| `/api/completion-packet` | GET | Completion PDF for client |

### Admin (JWT + Business Membership)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/get-admin-commercial-jobs` | GET | Paginated job list |
| `/api/get-admin-commercial-job-detail` | GET | Full job detail |
| `/api/send-commercial-quote` | POST | Set estimate, create invoice, send quote |
| `/api/update-commercial-job` | POST | Update status, scheduled date, notes |
| `/api/complete-commercial-job` | POST | Complete job, send completion packet |
| `/api/decline-commercial-job` | POST | Decline a commercial job |

---

## Stripe Webhook

### `POST /api/stripe-webhook`

Handles Stripe events. Auth: webhook signature verification.

**Events handled:**

| Event | Handler | Routing |
|-------|---------|---------|
| `invoice_payment.paid` | `handleInvoicePaymentPaid` | `booking_id` in metadata → residential |
| `invoice_payment.paid` | `handleCommercialInvoicePaymentPaid` | `job_id` in metadata → commercial |
| `invoice.paid` | `handleInvoicePaid` | `booking_id` → residential |
| `invoice.paid` | `handleCommercialInvoicePaid` | `job_id` → commercial |
| `payment_intent.payment_failed` | `handlePaymentFailed` | `booking_id` → residential |

**Idempotency:** Events are recorded in `processed_stripe_events` before processing. Duplicate events return 200 immediately.

---

## Test-Only Endpoints

### `GET/DELETE /api/test/lookup`

Test record lookup and cleanup. Only active when ALL three conditions are met:
- `NODE_ENV=test`
- `ENABLE_TEST_ENDPOINTS=true`
- `TEST_LOOKUP_SECRET` is set

Returns 404 (not 403) when disabled — does not reveal its existence. Secret comparison uses `crypto.timingSafeEqual`.
