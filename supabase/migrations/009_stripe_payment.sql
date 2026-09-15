-- ============================================================
-- Migration 009: Stripe payment workflow + completion package
-- ============================================================
-- Adds:
--   - Extended booking statuses (awaiting_deposit, in_progress, canceled)
--   - Stripe reference columns on bookings
--   - Slot reservation expiration
--   - booking_completions table
--   - booking_photos.kind column (before/after)
--   - payment_access_tokens table (for final payment links)
--   - processed_stripe_events table (webhook idempotency)
--   - Updated audit_log event types
--   - RPCs: initiate_payment_atomic, confirm_deposit_atomic
--   - Helper: cleanup_expired_slot_reservations


-- ── 1. Update booking status constraint ─────────────────────────────────────

alter table bookings drop constraint if exists bookings_status_check;
alter table bookings add constraint bookings_status_check
  check (status in (
    'pending_review', 'quote_sent', 'awaiting_deposit',
    'scheduled', 'in_progress', 'completed', 'canceled', 'declined'
  ));


-- ── 2. Stripe columns on bookings ───────────────────────────────────────────

alter table bookings
  add column if not exists stripe_customer_id              text,
  add column if not exists stripe_invoice_id               text,
  add column if not exists stripe_deposit_payment_intent_id text,
  add column if not exists stripe_final_payment_intent_id  text,
  add column if not exists deposit_confirmed_at            timestamptz,
  add column if not exists financially_completed_at        timestamptz;

create index if not exists idx_bookings_stripe_invoice
  on bookings(stripe_invoice_id) where stripe_invoice_id is not null;
create index if not exists idx_bookings_stripe_customer
  on bookings(stripe_customer_id) where stripe_customer_id is not null;


-- ── 3. Slot reservation expiration ──────────────────────────────────────────

alter table slot_reservations
  add column if not exists expires_at timestamptz;

create or replace function cleanup_expired_slot_reservations()
returns void
language plpgsql
security definer
as $$
begin
  update slot_reservations
  set status = 'canceled',
      canceled_at = now()
  where status = 'reserved'
    and expires_at is not null
    and expires_at < now();
end;
$$;


-- ── 4. booking_photos - add kind column ─────────────────────────────────────

alter table booking_photos
  add column if not exists kind text not null default 'before'
    check (kind in ('before', 'after'));

comment on column booking_photos.kind is
  'before = customer-submitted photos; after = crew completion photos';


-- ── 5. booking_completions table ────────────────────────────────────────────

create table if not exists booking_completions (
  id                       uuid primary key default gen_random_uuid(),
  booking_id               uuid not null unique references bookings(id) on delete cascade,
  completed_at             timestamptz not null,
  technician_name          text not null,
  technician_id            text,                    -- internal only, not customer-visible
  items_removed            text not null,
  volume_estimate          text,
  completion_notes         text not null,
  disposal_notes           text,
  final_amount_cents       integer not null check (final_amount_cents > 0),
  price_adjustment_reason  text,
  admin_id                 uuid,                    -- internal only
  created_at               timestamptz not null default now()
);

create index if not exists idx_completions_booking on booking_completions(booking_id);

alter table booking_completions enable row level security;

create policy "admin_read_completions" on booking_completions
  for select to authenticated using (is_admin());
-- Writes via service role only


-- ── 6. payment_access_tokens (final payment secure links) ───────────────────

create table if not exists payment_access_tokens (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references bookings(id) on delete cascade,
  token_hash  text not null unique,
  purpose     text not null check (purpose in ('final_payment')),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists idx_payment_tokens_hash on payment_access_tokens(token_hash)
  where revoked_at is null and used_at is null;
create index if not exists idx_payment_tokens_booking on payment_access_tokens(booking_id);

alter table payment_access_tokens enable row level security;

create policy "admin_read_payment_tokens" on payment_access_tokens
  for select to authenticated using (is_admin());
-- Writes via service role only


-- ── 7. processed_stripe_events (webhook idempotency) ─────────────────────────

create table if not exists processed_stripe_events (
  id                uuid primary key default gen_random_uuid(),
  stripe_event_id   text unique not null,
  event_type        text not null,
  processing_status text not null default 'processing'
    check (processing_status in ('processing', 'processed', 'failed')),
  error_message     text,
  attempt_count     integer not null default 1,
  started_at        timestamptz not null default now(),
  processed_at      timestamptz,
  last_attempted_at timestamptz not null default now()
);

create index if not exists idx_stripe_events_status
  on processed_stripe_events(processing_status)
  where processing_status != 'processed';

alter table processed_stripe_events enable row level security;

create policy "admin_read_stripe_events" on processed_stripe_events
  for select to authenticated using (is_admin());
-- Writes via service role only


-- ── 8. Updated audit_log event types ─────────────────────────────────────────

alter table audit_log drop constraint if exists audit_log_event_type_check;
alter table audit_log add constraint audit_log_event_type_check
  check (event_type in (
    -- existing
    'booking_created', 'quote_approved', 'price_override', 'blocker_override',
    'quote_revised', 'quote_accepted', 'slot_reserved', 'slot_canceled',
    'booking_completed', 'booking_declined', 'status_changed', 'token_revoked',
    -- new payment events
    'deposit_initiated', 'deposit_confirmed', 'deposit_failed',
    'final_payment_requested', 'final_payment_confirmed',
    'dispatch_override', 'invoice_adjusted', 'stripe_reconciled', 'invoice_voided'
  ));


-- ── 9. RPC: initiate_payment_atomic ──────────────────────────────────────────
-- Validates quote token, cleans expired slots, reserves slot with 30-min expiry,
-- moves booking to awaiting_deposit. Does NOT consume token (webhook does that).

create or replace function initiate_payment_atomic(
  p_token_hash      text,
  p_resource_id     text,
  p_pickup_date     date,
  p_start_time      time,
  p_end_time        time,
  p_confirmations   jsonb,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_token          record;
  v_snapshot       record;
  v_booking        record;
  v_reservation_id uuid;
  v_generic_error  jsonb := jsonb_build_object(
    'success', false, 'error', 'Unable to process this request'
  );
begin
  -- Clean expired tentative reservations before checking availability
  perform cleanup_expired_slot_reservations();

  -- Validate token
  select * into v_token
  from quote_tokens
  where token_hash = p_token_hash
  for update;

  if not found
    or v_token.revoked_at is not null
    or v_token.expires_at < now()
    or v_token.used_at is not null
  then
    return v_generic_error;
  end if;

  -- Get snapshot
  select * into v_snapshot
  from quote_snapshots
  where id = v_token.quote_snapshot_id;

  if not found or v_snapshot.expires_at < now() then
    return v_generic_error;
  end if;

  -- Lock booking
  select * into v_booking
  from bookings
  where id = v_token.booking_id
  for update;

  if not found then return v_generic_error; end if;

  -- Idempotent: already in awaiting_deposit (prior call succeeded)
  if v_booking.status = 'awaiting_deposit' then
    select id into v_reservation_id
    from slot_reservations
    where booking_id = v_booking.id
      and status in ('reserved', 'confirmed')
    order by reserved_at desc
    limit 1;

    return jsonb_build_object(
      'success', true,
      'idempotent', true,
      'booking_id', v_booking.id,
      'reservation_id', v_reservation_id,
      'approved_price_cents', (v_snapshot.approved_price * 100)::bigint,
      'quote_version', v_snapshot.version
    );
  end if;

  if v_booking.status != 'quote_sent' then
    return v_generic_error;
  end if;

  -- Validate confirmations
  if p_confirmations is null or jsonb_array_length(p_confirmations) < 3 then
    return jsonb_build_object(
      'success', false,
      'error', 'All confirmations are required'
    );
  end if;

  -- Reserve slot with 30-minute expiration
  begin
    insert into slot_reservations (
      booking_id, resource_id, pickup_date, start_time, end_time,
      status, expires_at
    ) values (
      v_booking.id, p_resource_id, p_pickup_date, p_start_time, p_end_time,
      'reserved', now() + interval '30 minutes'
    )
    returning id into v_reservation_id;
  exception when unique_violation then
    return jsonb_build_object(
      'success', false,
      'error', 'That time slot was just taken. Please choose another.'
    );
  end;

  -- Move booking to awaiting_deposit
  update bookings set
    status = 'awaiting_deposit',
    accepted_quote_snapshot_id = v_snapshot.id
  where id = v_booking.id;

  -- Audit
  insert into audit_log (booking_id, event_type, metadata) values (
    v_booking.id,
    'deposit_initiated',
    jsonb_build_object(
      'snapshot_version', v_snapshot.version,
      'reservation_id', v_reservation_id,
      'slot_expires_at', (now() + interval '30 minutes')::text
    )
  );

  return jsonb_build_object(
    'success', true,
    'booking_id', v_booking.id,
    'snapshot_id', v_snapshot.id,
    'reservation_id', v_reservation_id,
    'approved_price_cents', (v_snapshot.approved_price * 100)::bigint,
    'quote_version', v_snapshot.version
  );
end;
$$;


-- ── 10. RPC: confirm_deposit_atomic ──────────────────────────────────────────
-- Called by stripe-webhook on invoice_payment.paid (deposit stage).
-- Confirms slot, consumes token, moves booking to scheduled.

create or replace function confirm_deposit_atomic(
  p_booking_id                  uuid,
  p_deposit_payment_intent_id   text,
  p_invoice_payment_id          text,
  p_token_hash                  text
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_booking record;
begin
  select * into v_booking
  from bookings
  where id = p_booking_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Booking not found');
  end if;

  -- Idempotent: already confirmed
  if v_booking.deposit_confirmed_at is not null then
    return jsonb_build_object('success', true, 'idempotent', true);
  end if;

  -- Update booking to scheduled
  update bookings set
    status = 'scheduled',
    deposit_confirmed_at = now(),
    stripe_deposit_payment_intent_id = p_deposit_payment_intent_id
  where id = p_booking_id;

  -- Confirm slot reservation
  update slot_reservations set
    status = 'confirmed',
    expires_at = null
  where booking_id = p_booking_id
    and status = 'reserved';

  -- Consume quote token (token hash stored on booking for quick lookup)
  if p_token_hash is not null then
    update quote_tokens set used_at = now()
    where token_hash = p_token_hash
      and used_at is null;
  end if;

  -- Audit
  insert into audit_log (booking_id, event_type, metadata) values (
    p_booking_id,
    'deposit_confirmed',
    jsonb_build_object(
      'payment_intent_id', p_deposit_payment_intent_id,
      'invoice_payment_id', p_invoice_payment_id
    )
  );

  return jsonb_build_object('success', true);
end;
$$;
