# Rivet — System Architecture

> Last updated: 2026-09-08 | Phase 1 Multi-Tenancy + Rivet Admin UI Complete

This document describes the full system architecture for **Rivet** — a multi-tenant operations and profitability platform for service businesses. *Better jobs. Better margins.*

Rivet helps service business owners (junk removal, handyman, and future verticals) make data-driven decisions about which jobs to take, track profitability goals, manage the full job lifecycle, and get paid. The first tenant is Squatterz Junk Removal.

---

## Table of Contents

- [High-Level Overview](#high-level-overview)
- [Technology Stack](#technology-stack)
- [System Diagram](#system-diagram)
- [Layer Responsibilities](#layer-responsibilities)
- [Multi-Tenancy Model](#multi-tenancy-model)
- [Key Design Principles](#key-design-principles)
- [Directory Structure](#directory-structure)
- [Hosted Quote Request Forms](#hosted-quote-request-forms)
- [Related Documentation](#related-documentation)

---

## High-Level Overview

The platform is a full-stack web application deployed on Netlify with a Supabase (Postgres) backend. It serves three user types:

| User Type | Interface | Auth Model |
|-----------|-----------|------------|
| **Business Operator** (tenant) | Admin dashboard at `/admin/*` | Supabase JWT + `business_memberships` |
| **End Customer** (residential) | Hosted quote form (`/request/:slug`), quote pages, payment pages | Unauthenticated + token-based |
| **Commercial Client** (property manager) | Portal at `/portal/*` | Supabase JWT + `commercial_clients` |
| **Dispatch Crew** | PWA at `/dispatch/*` | Dispatch token (booking-scoped) |

Each business operator is a **tenant**. All tenant data is isolated by `business_id` at both the database (RLS) and application (API) layers. See [MULTI_TENANCY.md](./MULTI_TENANCY.md) for the complete design.

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | React 18 + Vite, TypeScript (admin), Tailwind + custom CSS | SPA with mobile-first booking flow, desktop-first admin |
| API | Netlify Functions (ES modules, v2) | Serverless endpoints, ~50 functions |
| Database | Supabase (PostgreSQL 15 + RLS) | Primary data store, row-level security |
| Auth | Supabase Auth (JWT) | User authentication, session management |
| File Storage | Supabase Storage | Booking photos (private bucket, signed URLs) |
| Blob Storage | Netlify Blobs | Service area configuration (survives cold starts) |
| Payments | Stripe (Invoices + PaymentIntents) | Deposit/final payment via invoice model |
| AI | Anthropic Claude API | Photo analysis for junk removal estimates |
| Email | Resend | Transactional emails (quotes, confirmations, payments) |
| CAPTCHA | Cloudflare Turnstile | Bot protection on public forms |
| SEO | react-snap prerender, sitemap.xml | Static prerendering for marketing pages |
| Analytics | GA4 (optional) | Event tracking via `VITE_GA4_MEASUREMENT_ID` |

---

## System Diagram

```
                                    ┌──────────────────────┐
                                    │    Cloudflare CDN     │
                                    │  (Turnstile CAPTCHA)  │
                                    └──────────┬───────────┘
                                               │
                    ┌──────────────────────────────────────────────┐
                    │                  Netlify                      │
                    │                                              │
                    │  ┌──────────────┐    ┌────────────────────┐  │
                    │  │  Static Site │    │  Netlify Functions  │  │
                    │  │  (React SPA) │    │  (~50 endpoints)   │  │
                    │  │              │    │                    │  │
                    │  │  /admin/*    │───▶│  /api/*            │  │
                    │  │  /request/:s │    │                    │  │
                    │  │  /portal/*   │    │  Auth: JWT +       │  │
                    │  │  /dispatch/* │    │  business_memberships│ │
                    │  │  /quote/:t   │    │                    │  │
                    │  └──────────────┘    └─────────┬──────────┘  │
                    │                                │              │
                    │  ┌──────────────┐              │              │
                    │  │ Netlify Blobs│◀─────────────┤              │
                    │  │(service area)│              │              │
                    │  └──────────────┘              │              │
                    └────────────────────────────────┼──────────────┘
                                                     │
                    ┌────────────────────────────────┼──────────────┐
                    │              Supabase           │              │
                    │                                │              │
                    │  ┌─────────────┐  ┌────────────┴───────────┐ │
                    │  │  Auth       │  │  PostgreSQL + RLS       │ │
                    │  │  (JWT)      │  │                        │ │
                    │  └─────────────┘  │  businesses             │ │
                    │                   │  business_memberships   │ │
                    │  ┌─────────────┐  │  bookings              │ │
                    │  │  Storage    │  │  quote_snapshots       │ │
                    │  │  (photos)   │  │  audit_log             │ │
                    │  └─────────────┘  │  ... (30+ tables)      │ │
                    │                   └────────────────────────┘ │
                    └──────────────────────────────────────────────┘
                                                     │
                    ┌────────────────────────────────┼──────────────┐
                    │          External Services      │              │
                    │                                │              │
                    │  ┌─────────┐  ┌────────┐  ┌───┴────┐        │
                    │  │ Stripe  │  │ Resend │  │ Claude │        │
                    │  │(payments│  │(email) │  │ (AI)   │        │
                    │  └─────────┘  └────────┘  └────────┘        │
                    └──────────────────────────────────────────────┘
```

---

## Layer Responsibilities

### Frontend (React SPA)

- **Hosted quote form** (`/request/:slug`): Tenant-branded, config-driven quote request form. See [Hosted Quote Request Forms](#hosted-quote-request-forms).
- **Rivet admin dashboard** (`/admin`): The primary operator interface. TypeScript + custom CSS design system. Sidebar navigation, real-time goal tracking, decision engine recommendations, quote approval, work management. Lives in `src/admin/`.
- **Legacy admin** (`/admin/legacy/*`): The original admin pages (Dashboard, RequestQueue, Settings, CommercialAdminPage). Retained for backward compatibility during migration. Will be removed once all functionality is in the Rivet UI.
- **Commercial portal** (`/portal/*`): Property manager self-service. Estimate requests, quote acceptance, payment.
- **Dispatch PWA** (`/dispatch/*`): iPhone-optimized. Job status updates, photo uploads, issue reporting.
- **Marketing pages** (`/commercial/*`): SEO-optimized, prerendered with react-snap.

All business logic calculations (goal engine, decision engine, calibration, route scoring) run **client-side** in the admin dashboard. The server validates critical data (decision context on quote approval) but the browser does the math.

### API Layer (Netlify Functions)

Every function lives in `netlify/functions/` as a standalone ES module exporting a default `handler(req)` function and a `config` object with the URL path.

Shared utilities in `netlify/functions/_shared/`:

| Module | Exports |
|--------|---------|
| `supabase.js` | `getServiceClient()`, `verifyAdmin()`, `verifyBusinessMember()`, `verifyCommercialClient()`, `sha256()`, `generateToken()`, `jsonResponse()`, `errorResponse()` |
| `stripe.js` | `getStripeClient()`, `toCents()`, `calculateDepositCents()`, `ikey.*` (idempotency key generators) |
| `serviceArea.js` | Service area ZIP evaluation (backed by Netlify Blobs) |
| `completeJobCore.js` | Shared job-completion logic (used by both admin and dispatch) |
| `declineEmail.js` | Decline notification email template |
| `commercialRequest.js` | Commercial photo linking + email helpers |

### Database Layer (Supabase PostgreSQL)

- **30+ tables** with Row-Level Security (RLS) on all tenant-scoped tables
- **`business_id` FK** on every tenant-scoped table — enforced NOT NULL
- **RLS policies** use `user_business_ids()` helper function for tenant isolation
- **Security-definer functions** for atomic operations (quote approval, deposit confirmation, slot reservation)
- **Service role** used by Netlify Functions (bypasses RLS for cross-table operations)
- **Anon key** used by frontend (RLS enforced)

See [DATABASE.md](./DATABASE.md) for the complete schema reference.

---

## Multi-Tenancy Model

The platform uses a **shared-database, shared-schema** multi-tenancy model. Every tenant-scoped table has a `business_id uuid NOT NULL` column referencing the `businesses` table. Isolation is enforced at three levels:

1. **Database (RLS)**: PostgreSQL Row-Level Security policies filter all queries by `business_id = ANY(user_business_ids())`
2. **API (server)**: `verifyBusinessMember(req)` validates JWT + business membership on every admin request
3. **Client (frontend)**: `x-business-id` header sent with every admin API call; auto-resolved for single-business users

For the complete multi-tenancy design, see [MULTI_TENANCY.md](./MULTI_TENANCY.md).

---

## Key Design Principles

### 1. Tenant Isolation is Non-Negotiable

Every write operation includes `business_id`. Every read is filtered by business membership. There are no "global admin" shortcuts that bypass tenant scoping. The `admin_users` table exists only for backward compatibility during migration.

### 2. Idempotency Everywhere

All state-changing operations (booking creation, quote approval, deposit payment, job completion) are idempotent. Retries are safe. Partial failures can be resumed. Key mechanisms:
- `idempotency_key` on bookings
- Stripe idempotency keys via `ikey.*` helpers
- `ON CONFLICT DO NOTHING/UPDATE` in SQL
- Step-by-step completion flow that checks for existing records before creating

### 3. Server is the Source of Truth

The browser never sends trusted business logic data. Prices are calculated server-side. Deposit amounts come from Stripe's authoritative `invoice.amount_due`. Decision context is validated against actual booking data before storage. The `business_id` is resolved server-side from JWT membership — never trusted from client input alone.

### 4. Audit Everything

Every significant state change writes to `audit_log` with `booking_id`, `business_id`, `event_type`, `admin_id`, and relevant metadata. The audit trail is immutable (append-only, no UPDATE/DELETE policies for non-owners).

### 5. Minimal Abstraction

The codebase prefers explicit code over clever abstractions. Two verticals use an if/else, not a plugin registry. Settings are a flat JSON object, not a hierarchical config framework. This makes the code easy to read, debug, and modify — especially for AI agents.

---

## Directory Structure

```
junk-removal-quoter/
├── netlify/
│   ├── functions/                    # ~50 serverless API endpoints
│   │   ├── _shared/                  # Shared server utilities
│   │   │   ├── supabase.js           #   Auth, DB client, helpers
│   │   │   ├── stripe.js             #   Stripe client, price math
│   │   │   ├── serviceArea.js        #   ZIP evaluation
│   │   │   ├── completeJobCore.js    #   Shared completion logic
│   │   │   ├── declineEmail.js       #   Decline email template
│   │   │   └── commercialRequest.js  #   Commercial helpers
│   │   ├── __tests__/
│   │   │   └── integration.test.js   #   33 integration tests (mock Supabase)
│   │   ├── approve-quote.js          #   Admin: approve + Stripe invoice
│   │   ├── create-booking.js         #   Public: submit booking + lead notification
│   │   ├── get-business-config.js    #   Public: tenant form config (unauthenticated)
│   │   ├── stripe-webhook.js         #   Stripe event handler
│   │   └── ...                       #   (see API_REFERENCE.md)
│   └── netlify.toml                  # Deploy config, redirects, headers
│
├── src/
│   ├── admin/                        # Rivet admin dashboard (TypeScript)
│   │   ├── RivetApp.tsx              #   Auth gate (login screen + session check)
│   │   ├── RivetDashboard.tsx        #   Dashboard shell (sidebar, topbar, routing)
│   │   ├── screens.tsx               #   Home, Work, Schedule, Customers, Reports, Settings
│   │   ├── WorkDetailDrawer.tsx      #   Job detail slide-over with approve/decline actions
│   │   ├── components.tsx            #   Shared UI (MetricCard, RecPill, WorkRow, etc.)
│   │   ├── types.ts                  #   WorkItem, Company, Customer types + mock data
│   │   ├── WorkItemsContext.tsx      #   React context for shared work item data
│   │   ├── useWorkItems.ts           #   Hook: fetches bookings → decision engine → WorkItem
│   │   ├── useGoalData.ts            #   Hook: goal progress, weekly metrics, pace
│   │   ├── useSettings.ts            #   Hook: read/write business settings (DB + localStorage)
│   │   └── admin.css                 #   Custom CSS design system (1000+ lines, CSS vars)
│   ├── components/                   # React components (legacy + shared)
│   │   ├── commercial/               #   Commercial marketing chrome
│   │   └── ...
│   ├── hooks/                        # Custom React hooks
│   ├── pages/                        # Route-level page components
│   │   ├── VerticalQuoteForm.jsx     #   Config-driven quote request form
│   │   ├── HostedQuoteForm.jsx       #   /request/:slug route (fetches config)
│   │   ├── BookingFlow.jsx           #   Thin wrapper (Squatterz defaults)
│   │   ├── Dashboard.jsx             #   Legacy admin dashboard
│   │   ├── CommercialAdminPage.jsx   #   Commercial admin queue
│   │   ├── PortalStart.jsx           #   Commercial estimate wizard
│   │   └── ...
│   ├── utils/
│   │   ├── repositories/
│   │   │   └── supabaseRepo.js       #   Data access layer (RLS-protected)
│   │   ├── __tests__/                #   Unit tests (vitest)
│   │   ├── goalEngine.js             #   Goal tracking calculations
│   │   ├── decisionEngine.js         #   Take/Review/Pass recommendations
│   │   ├── decisionRules.js          #   Decision rule definitions
│   │   ├── quoteFormConfig.js        #   Form config defaults, merge, locked values
│   │   ├── estimateBuilder.js        #   Junk removal cost estimation
│   │   ├── calibrationEngine.js      #   Estimate accuracy learning
│   │   ├── storage.js                #   Settings (DB-first, localStorage fallback)
│   │   └── ...
│   ├── App.jsx                       # Route definitions
│   └── main.jsx                      # Entry point
│
├── supabase/
│   └── migrations/                   # Sequential SQL migrations (001-020)
│       ├── 001_initial.sql           #   Core tables
│       ├── ...
│       └── 020_multi_tenant.sql      #   Multi-tenant foundation
│
├── tests/                            # Python regression tests (pytest)
│   ├── integration/                  #   E2E tests against live server
│   ├── api/                          #   API endpoint tests
│   └── unit/                         #   Date logic via Node subprocess
│
├── docs/                             # Architecture documentation
│   ├── ARCHITECTURE.md               #   This file
│   ├── MULTI_TENANCY.md              #   Multi-tenant design
│   ├── DATABASE.md                   #   Schema reference
│   ├── AUTHENTICATION.md             #   Auth flows and token types
│   ├── API_REFERENCE.md              #   Endpoint documentation
│   └── CONTRIBUTING.md               #   Developer/agent onboarding
│
├── README.md                         # Quick start, env vars, test commands
├── PLATFORM.md                       # Operational platform (goals, decisions, calibration)
└── LAUNCH_CHECKLIST.md               # Pre-launch verification
```

---

## Hosted Quote Request Forms

Rivet provides each tenant a hosted quote request form at `/request/:slug`. Tenants link to this from their own marketing sites and trucks. The form is configurable per business but **bounded by the decision engine's data model** — operators can customize branding, labels, and field visibility, but cannot add fields outside what the estimator consumes.

### How It Works

```
Tenant's website                  Rivet (myrivet.io)
─────────────────          ──────────────────────────────────
  "Get a Quote"    ───▶    /request/:slug
  (link/button)              │
                             ├── GET /api/public/business-config?slug=...
                             │     └── Returns: name, vertical, published, quoteFormConfig
                             │
                             ├── HostedQuoteForm.jsx
                             │     └── Merges saved config with defaults
                             │
                             └── VerticalQuoteForm.jsx (config-driven)
                                   ├── Step 1: Info (name, phone, email)
                                   ├── Step 2: Location (address, city, ZIP)
                                   ├── Step 3: Photos (optional, configurable)
                                   ├── Step 4: Details (quantity, access, stairs)
                                   └── Step 5: Schedule (dates, time preference)
                                         │
                                         └── POST /api/create-booking
                                               └── Booking appears in tenant's admin
```

### Config Data Model

Stored in `businesses.settings.quoteFormConfig` (JSONB — no migration needed):

```javascript
{
  published: false,                    // Tenant must explicitly publish
  notifications: {
    emailOnRequest: true,              // Email operator on new request
    notifyEmail: null,                 // Defaults to owner's auth email
  },
  branding: {
    tagline: "",                       // e.g. "We Haul It All"
    accentColor: "#22c55e",            // CTA buttons, progress bar
    phone: null,                       // Form header phone number
    ctaText: "Get Free Estimate",      // Submit button text
  },
  steps: {
    photos: { enabled: true, minPhotos: 3 },
  },
  fields: {
    quantity:        { label, options: [{ value, label, sub }] },
    accessType:      { label, options: [{ value, label }] },
    stairs:          { enabled: true, label },
    elevator:        { enabled: true, label },
    description:     { enabled: true, label, placeholder },
    secondChoiceDate:{ enabled: true },
    email:           { required: false },
  },
  companionContent: [ /* 5 entries for desktop sidebar */ ],
  confirmation:     { headline, body },
}
```

**Missing config = defaults.** `mergeQuoteFormConfig(saved, vertical)` deep-merges saved config over defaults so missing keys always fall back to sensible values.

### The Estimator Contract

Option **values are immutable** — they map directly to lookup tables in `estimateBuilder.js`:

| Config Field | Estimator Lookup | Example Values |
|---|---|---|
| `quantity.options[].value` | `QUANTITY_TO_LOAD` | `"A few items (1-5)"`, `"Multiple rooms"` |
| `accessType.options[].value` | `ACCESS_MAP` | `"curbside"`, `"basement"` |
| `stairs` | `STAIRS_TIME_ADD` | `"yes"`, `"no"` |

Operators can change display **labels** and **subtitles** but never the values the engine uses. The merge function matches options by `value` key to preserve this contract.

### Key Files

| File | Purpose |
|------|---------|
| `src/utils/quoteFormConfig.js` | Default config factory, `mergeQuoteFormConfig()`, locked value constants |
| `src/pages/VerticalQuoteForm.jsx` | Config-driven form (~1100 lines), accepts `{ config, businessName, businessSlug }` |
| `src/pages/HostedQuoteForm.jsx` | Route handler for `/request/:slug`, fetches config, handles loading/404/unpublished |
| `src/pages/BookingFlow.jsx` | Thin wrapper — renders `VerticalQuoteForm` with Squatterz defaults |
| `netlify/functions/get-business-config.js` | Public API: returns safe subset of business config (no pricing/engine data) |
| `src/admin/screens.tsx` | "Quote Form" settings section in Rivet admin |

### Photo-Disabled Behavior

When a tenant disables the photos step (`steps.photos.enabled: false`):

- The form skips the photo upload step entirely
- `riskFlags.js` adds a `no_photos` flag (severity: warning) — distinct from `low_photos` (< 3)
- `calculateConfidence()` applies a -15 penalty (stronger than per-warning -10)
- The decision engine becomes more conservative due to degraded confidence

### Lead Notifications

When `quoteFormConfig.notifications.emailOnRequest` is true, `create-booking.js` sends a fire-and-forget email to the operator via Resend after booking creation. The recipient is `notifications.notifyEmail` or, if null, the business owner's auth email (resolved via `businesses.owner_user_id` → `auth.users`).

---

## Related Documentation

| Document | Contents |
|----------|----------|
| [MULTI_TENANCY.md](./MULTI_TENANCY.md) | Complete multi-tenant design: tables, RLS, auth, data isolation |
| [DATABASE.md](./DATABASE.md) | Full schema reference with all tables, columns, relationships |
| [AUTHENTICATION.md](./AUTHENTICATION.md) | Auth flows, token types, business membership model |
| [API_REFERENCE.md](./API_REFERENCE.md) | Every API endpoint with auth, params, responses |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Developer and AI agent onboarding guide |
| [../PLATFORM.md](../PLATFORM.md) | Operational platform: goal engine, decision engine, calibration, Stripe workflow |
| [../README.md](../README.md) | Quick start, environment variables, test commands |
