# Rivet — Database Schema Reference

> Last updated: 2026-09-08 | Migrations 001–020

This document is the authoritative reference for all database tables, their relationships, and migration history. The database is PostgreSQL hosted on Supabase with Row-Level Security (RLS) enabled on all tables.

---

## Table of Contents

- [Entity Relationship Overview](#entity-relationship-overview)
- [Multi-Tenant Core](#multi-tenant-core)
- [Booking Lifecycle](#booking-lifecycle)
- [Quote & Payment](#quote--payment)
- [Completion & Dispatch](#completion--dispatch)
- [Goals & Calibration](#goals--calibration)
- [Commercial Portal](#commercial-portal)
- [Infrastructure](#infrastructure)
- [Security-Definer Functions](#security-definer-functions)
- [Migration History](#migration-history)

---

## Entity Relationship Overview

```
businesses ─────────────────────────────────────────────────────────────────┐
  │                                                                         │
  ├── business_memberships (user_id → auth.users)                          │
  │                                                                         │
  ├── bookings ──┬── quote_snapshots ── quote_tokens                       │
  │              ├── slot_reservations                                      │
  │              ├── quote_acceptances                                      │
  │              ├── booking_photos                                         │
  │              ├── booking_completions                                    │
  │              ├── payment_access_tokens                                  │
  │              ├── support_notes                                          │
  │              ├── job_issues                                             │
  │              └── notification_events                                    │
  │                                                                         │
  ├── upload_sessions ── session_photos                                    │
  │                                                                         │
  ├── business_goals ── goal_snapshots                                     │
  ├── calibration_records                                                   │
  ├── expansion_leads                                                       │
  ├── audit_log                                                             │
  │                                                                         │
  └── commercial_clients ── properties ── jobs ── job_photos               │
                                                                            │
  Global (no business_id):                                                  │
    location_cache, travel_cache, rate_limits, processed_stripe_events     │
    admin_users (legacy)                                                    │
```

---

## Multi-Tenant Core

### `businesses`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PK, default `gen_random_uuid()` | Business identifier |
| `owner_user_id` | uuid | NOT NULL, FK → `auth.users` | Primary owner |
| `name` | text | NOT NULL | Display name |
| `slug` | text | UNIQUE, NOT NULL | URL-safe identifier |
| `vertical` | text | NOT NULL, CHECK `('junk_removal','handyman')` | Business type |
| `timezone` | text | NOT NULL, default `'America/New_York'` | IANA timezone |
| `settings` | jsonb | NOT NULL, default `'{}'` | Business configuration |
| `created_at` | timestamptz | NOT NULL, default `now()` | |

**Indexes:** `slug`, `owner_user_id`

### `business_memberships`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PK | |
| `business_id` | uuid | NOT NULL, FK → `businesses` ON DELETE CASCADE | |
| `user_id` | uuid | NOT NULL, FK → `auth.users` ON DELETE CASCADE | |
| `role` | text | NOT NULL, CHECK `('owner','member')`, default `'member'` | |
| `created_at` | timestamptz | NOT NULL, default `now()` | |

**Unique:** `(business_id, user_id)`
**Indexes:** `user_id`, `business_id`

---

## Booking Lifecycle

### `bookings`

The central record for residential job requests. One row per customer request.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | PK |
| `business_id` | uuid | NOT NULL, FK → `businesses` |
| `status` | text | `pending_review` → `quote_sent` → `awaiting_deposit` → `scheduled` → `in_progress` → `completed` |
| `customer_name` | text | |
| `customer_phone` | text | |
| `customer_email` | text | |
| `address`, `city`, `state`, `zip` | text | |
| `full_address` | text | |
| `quantity` | text | Load size estimate |
| `stairs` | text | |
| `access_type` | text | |
| `description` | text | |
| `detected_items` | jsonb | AI-detected items |
| `ai_detected_items` | jsonb | |
| `photo_count` | integer | |
| `preferred_date`, `second_choice_date` | date | |
| `time_preference` | text | |
| `internal_notes` | text | |
| `internal_estimate` | jsonb | Server-side estimate snapshot |
| `risk_flags` | jsonb | |
| `job_rating` | jsonb | |
| `blocker_overrides` | jsonb | |
| `approved_quote` | numeric | Approved price |
| `quote_version` | integer | Increments on re-approval |
| `quote_expires_at` | timestamptz | |
| `approved_at` | timestamptz | |
| `quote_token_hash` | text | Active quote token |
| `accepted_at` | timestamptz | |
| `scheduled_pickup` | text | |
| `accepted_quote_snapshot_id` | uuid | FK → `quote_snapshots` |
| `stripe_customer_id` | text | |
| `stripe_invoice_id` | text | |
| `stripe_deposit_payment_intent_id` | text | |
| `stripe_final_payment_intent_id` | text | |
| `deposit_confirmed_at` | timestamptz | |
| `financially_completed_at` | timestamptz | Set when invoice fully paid |
| `completed_at` | timestamptz | |
| `actuals` | jsonb | Final amounts post-completion |
| `geocoded_lat`, `geocoded_lng` | numeric | |
| `geocoding_status` | text | `pending`, `success`, `failed` |
| `distance_miles` | numeric(8,1) | |
| `travel_minutes_one_way` | integer | |
| `upload_session_id` | uuid | FK → `upload_sessions` |
| `idempotency_key` | text | UNIQUE |
| `test_run_id` | text | Test isolation |
| `created_at` | timestamptz | |

**Indexes:** `business_id`, `status`, `idempotency_key`, `test_run_id` (partial)

### `upload_sessions`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | PK |
| `business_id` | uuid | NOT NULL, FK → `businesses` |
| `status` | text | `active` → `consumed` → `expired` |
| `max_photos` | integer | default 10 |
| `max_file_bytes` | integer | default 10MB |
| `max_total_bytes` | integer | default 50MB |
| `consumed_by_booking` | uuid | FK → `bookings` ON DELETE SET NULL |
| `expires_at` | timestamptz | |
| `created_at` | timestamptz | |

### `session_photos`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | PK |
| `session_id` | uuid | FK → `upload_sessions` |
| `storage_path` | text | Supabase Storage path |
| `file_name` | text | |
| `content_type` | text | |
| `size_bytes` | integer | |
| `sort_order` | integer | |

### `booking_photos`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | PK |
| `booking_id` | uuid | FK → `bookings` |
| `storage_path` | text | |
| `kind` | text | `before` or `after` |
| `source` | text | `customer`, `crew`, `submission` |
| `sort_order` | integer | |

---

## Quote & Payment

### `quote_snapshots`

Immutable record of an approved quote. New version created on each re-approval.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | PK |
| `business_id` | uuid | NOT NULL, FK → `businesses` |
| `booking_id` | uuid | FK → `bookings` |
| `version` | integer | Incrementing per booking |
| `approved_price` | numeric | |
| `recommended_price` | numeric | |
| `estimate_snapshot` | jsonb | Full estimate at time of approval |
| `settings_snapshot` | jsonb | Business settings at time of approval |
| `available_slots` | jsonb | |
| `customer_terms` | jsonb | |
| `admin_override` | jsonb | |
| `admin_id` | uuid | |
| `decision_context` | jsonb | Decision engine output |
| `expires_at` | timestamptz | |

### `quote_tokens`

SHA-256 hashed tokens for customer access to quote pages.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | PK |
| `business_id` | uuid | NOT NULL, FK → `businesses` |
| `booking_id` | uuid | FK → `bookings` |
| `quote_snapshot_id` | uuid | FK → `quote_snapshots` |
| `token_hash` | text | UNIQUE, SHA-256 hash |
| `expires_at` | timestamptz | |
| `used_at` | timestamptz | Set when deposit confirmed |
| `revoked_at` | timestamptz | Set when superseded |

### `slot_reservations`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | PK |
| `business_id` | uuid | NOT NULL, FK → `businesses` |
| `booking_id` | uuid | FK → `bookings` |
| `resource_id` | text | Slot identifier |
| `pickup_date` | date | |
| `start_time`, `end_time` | time | |
| `status` | text | `reserved` → `confirmed` or `expired` or `completed` |
| `expires_at` | timestamptz | 30-minute window |
| `reserved_at` | timestamptz | |

### `quote_acceptances`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | PK |
| `business_id` | uuid | NOT NULL, FK → `businesses` |
| `booking_id` | uuid | |
| `quote_snapshot_id` | uuid | |
| `slot_reservation_id` | uuid | |
| `idempotency_key` | text | |

### `payment_access_tokens`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | PK |
| `business_id` | uuid | NOT NULL, FK → `businesses` |
| `booking_id` | uuid | FK → `bookings` |
| `token_hash` | text | UNIQUE, SHA-256 |
| `purpose` | text | `final_payment` |
| `expires_at` | timestamptz | 7-day expiry |
| `used_at` | timestamptz | |
| `revoked_at` | timestamptz | |

---

## Completion & Dispatch

### `booking_completions`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | PK |
| `business_id` | uuid | NOT NULL, FK → `businesses` |
| `booking_id` | uuid | UNIQUE, FK → `bookings` |
| `completed_at` | timestamptz | |
| `technician_name` | text | |
| `technician_id` | text | |
| `items_removed` | text | |
| `volume_estimate` | text | |
| `completion_notes` | text | |
| `disposal_notes` | text | |
| `final_amount_cents` | integer | |
| `price_adjustment_reason` | text | |
| `admin_id` | uuid | |

### `support_notes`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | PK |
| `business_id` | uuid | NOT NULL, FK → `businesses` |
| `booking_id` | uuid | FK → `bookings` |
| `admin_id` | uuid | FK → `auth.users` |
| `body` | text | |
| `created_at` | timestamptz | |

### `job_issues`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | PK |
| `business_id` | uuid | NOT NULL, FK → `businesses` |
| `booking_id` | uuid | FK → `bookings` |
| `issue_type` | text | |
| `description` | text | |
| `reported_by` | text | |
| `created_at` | timestamptz | |

### `notification_events`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | PK |
| `business_id` | uuid | NOT NULL, FK → `businesses` |
| `booking_id` | uuid | FK → `bookings` |
| `event_type` | text | `crew_en_route`, `crew_arrived`, `job_started`, `job_completed` |
| `destination` | text | Phone number |
| `payload` | jsonb | |
| `sent_at` | timestamptz | |
| `created_at` | timestamptz | |

---

## Goals & Calibration

### `business_goals`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | PK |
| `business_id` | uuid | NOT NULL, FK → `businesses` |
| `goal_type` | text | `cash_profit`, `owner_adjusted_profit`, `revenue` |
| `target_amount` | numeric(10,2) | |
| `start_date`, `end_date` | date | |
| `working_days_config` | jsonb | `{ "days": [1,2,3,4,5] }` |
| `daily_capacity_limit` | integer | default 4 |
| `minimum_margin` | numeric | default 0.55 |
| `minimum_job_profit` | numeric | default 75 |
| `pipeline_weights` | jsonb | Status → weight mapping |
| `active` | boolean | Partial unique: one active per goal_type |

### `goal_snapshots`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | PK |
| `business_id` | uuid | NOT NULL, FK → `businesses` |
| `goal_id` | uuid | FK → `business_goals` |
| `snapshot_date` | date | |
| `completed_profit`, `booked_profit`, `pipeline_profit` | numeric | |
| `pct_achieved` | numeric | |
| `pace_status` | text | `achieved`, `ahead`, `on_pace`, `at_risk`, `behind` |
| `jobs_completed` | integer | |
| `avg_daily_profit`, `required_daily_profit` | numeric | |

### `calibration_records`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | PK |
| `business_id` | uuid | NOT NULL, FK → `businesses` |
| `metric`, `dimension`, `dimension_value` | text | |
| `previous_value`, `suggested_value`, `approved_value` | numeric | |
| `sample_size` | integer | |
| `confidence` | text | `weak`, `strong`, `very_strong` |
| `owner_decision` | text | `pending`, `accepted`, `rejected`, `deferred` |
| `supporting_job_ids` | uuid[] | |
| `decided_at`, `effective_date` | timestamptz/date | |

---

## Commercial Portal

### `commercial_clients`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | PK |
| `business_id` | uuid | NOT NULL, FK → `businesses` |
| `user_id` | uuid | UNIQUE, FK → `auth.users` |
| `contact_name` | text | |
| `company_name` | text | |
| `phone` | text | |
| `job_title` | text | |
| `onboarding_status` | text | `in_progress`, `complete` |
| `last_onboarding_step` | text | |
| `attribution` | jsonb | UTMs, referrer, landing page |

### `properties`

Scoped via `commercial_clients.id` FK chain (no direct `business_id`).

### `jobs`

Scoped via `properties` → `commercial_clients` FK chain. Status: `draft` → `pending_review` → `quote_sent` → `awaiting_payment` → `scheduled` → `in_progress` → `completed` / `cancelled`.

---

## Infrastructure

### `audit_log`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | PK |
| `business_id` | uuid | NOT NULL, FK → `businesses` |
| `booking_id` | uuid | Nullable (not all events are booking-scoped) |
| `event_type` | text | See event types below |
| `admin_id` | uuid | Nullable |
| `before_value`, `after_value` | jsonb | |
| `reason` | text | |
| `metadata` | jsonb | |
| `created_at` | timestamptz | |

**Event types:** `quote_approved`, `token_revoked`, `deposit_initiated`, `deposit_confirmed`, `booking_completed`, `final_payment_requested`, `booking_declined`, `stripe_reconciled`, `dispatch_override`, and more.

### `processed_stripe_events` (global)

| Column | Type | Description |
|--------|------|-------------|
| `stripe_event_id` | text | UNIQUE |
| `event_type` | text | |
| `processing_status` | text | `processing`, `processed`, `failed` |
| `attempt_count` | integer | |
| `error_message` | text | |

### `location_cache` / `travel_cache` (global)

Geocoding and travel time caches. Keyed by address hash (SHA-256). No PII stored.

### `rate_limits` (global)

IP-based rate limiting. Used by `check_rate_limit()` RPC.

### `admin_users` (legacy, global)

Legacy table mapping `user_id` to admin role. Retained for backward compatibility. New code should use `business_memberships`.

---

## Security-Definer Functions

These functions run with elevated privileges and enforce their own authorization.

| Function | Purpose | Auth Check |
|----------|---------|------------|
| `admin_delete_booking(p_booking_id)` | Delete booking + cascade | `is_business_member(booking.business_id)` |
| `approve_quote_atomic(...)` | Atomic quote approval | `business_memberships` OR `admin_users` |
| `initiate_payment_atomic(...)` | Reserve slot + initiate payment | Token-based (no user auth) |
| `confirm_deposit_atomic(...)` | Confirm deposit payment | Called by webhook (service role) |
| `queue_dispatch_notification()` | Trigger: queue notification on status change | Trigger (no user auth) |
| `handle_new_client()` | Trigger: auto-create commercial client on signup | Conditional on `raw_user_meta_data` |
| `check_rate_limit(...)` | IP rate limiting | Public |
| `cleanup_expired_slot_reservations()` | Expire stale reservations | Called by service role |

---

## Migration History

| # | File | Purpose |
|---|------|---------|
| 001 | `001_initial.sql` | Core tables: bookings, upload_sessions, session_photos, booking_photos, quote_snapshots, quote_tokens, slot_reservations, quote_acceptances, audit_log, admin_users |
| 002 | `002_business_goals.sql` | business_goals, goal_snapshots |
| 003 | `003_decision_context.sql` | decision_context on quote_snapshots |
| 004 | `004_calibration.sql` | calibration_records |
| 005 | `005_route_cache.sql` | location_cache, travel_cache, geocoding columns on bookings |
| 006 | `006_commercial.sql` | commercial_clients, properties, jobs, job_photos |
| 007 | `007_admin_delete.sql` | admin_delete_booking() function |
| 008 | `008_expansion.sql` | expansion_leads, test_run_id on bookings |
| 009 | `009_stripe_payment.sql` | Stripe columns, booking_completions, payment_access_tokens, processed_stripe_events, atomic payment functions |
| 010 | `010_fix_approve_quote.sql` | Fix approve_quote_atomic — add decision_context param |
| 011 | `011_fix_sessions_fk.sql` | Fix upload_sessions FK to ON DELETE SET NULL |
| 012 | `012_support_notes.sql` | support_notes table |
| 013 | `013_dispatch.sql` | job_issues, notification_events, dispatch trigger |
| 014 | `014_distance_fields.sql` | distance_miles, travel_minutes_one_way on bookings |
| 015 | `015_commercial_workflow.sql` | Extended jobs table for quote→deposit→completion |
| 016 | `016_commercial_onboarding.sql` | Onboarding tracking on commercial_clients |
| 017 | `017_draft_jobs_rls.sql` | Draft status, RLS for commercial tables |
| 018 | `018_request_idempotency.sql` | Idempotency key on jobs, email lookup RPC |
| 019 | `019_normalize_status.sql` | Normalize job status values |
| **020** | **`020_multi_tenant.sql`** | **Multi-tenant foundation: businesses, memberships, business_id on 17 tables, RLS policies, function updates** |
