-- ============================================================
-- Junk Removal Quoter - production schema
-- ============================================================

-- ── Helper: immutability trigger ────────────────────────────

create or replace function prevent_mutation()
returns trigger as $$
begin
  raise exception '% on % is not allowed - this table is append-only',
    tg_op, tg_table_name;
end;
$$ language plpgsql;

-- ── Helper: auto-update updated_at ──────────────────────────

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;


-- ============================================================
-- 1. Admin users (explicit authorization)
-- ============================================================

create table admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Helper used by RLS policies
create or replace function is_admin()
returns boolean as $$
begin
  return exists (select 1 from admin_users where user_id = auth.uid());
end;
$$ language plpgsql security definer stable;


-- ============================================================
-- 2. Rate limits
-- ============================================================

create table rate_limits (
  id uuid primary key default gen_random_uuid(),
  ip_address text not null,
  endpoint text not null,
  requested_at timestamptz not null default now()
);

create index idx_rate_limits_lookup
  on rate_limits(ip_address, endpoint, requested_at desc);

create or replace function check_rate_limit(
  p_ip text,
  p_endpoint text,
  p_window_seconds integer,
  p_max_requests integer
) returns boolean as $$
declare
  v_count integer;
  v_lock_key bigint;
begin
  -- Advisory lock keyed on ip+endpoint hash to serialize concurrent checks
  v_lock_key := abs(hashtext(p_ip || '::' || p_endpoint));
  perform pg_advisory_xact_lock(v_lock_key);

  -- Prune old entries (outside current window, safe cleanup)
  delete from rate_limits
  where requested_at < now() - make_interval(secs => p_window_seconds * 2);

  select count(*) into v_count
  from rate_limits
  where ip_address = p_ip
    and endpoint = p_endpoint
    and requested_at > now() - make_interval(secs => p_window_seconds);

  if v_count >= p_max_requests then
    return false;
  end if;

  insert into rate_limits (ip_address, endpoint) values (p_ip, p_endpoint);
  return true;
end;
$$ language plpgsql security definer;


-- ============================================================
-- 3. Upload sessions
-- ============================================================

create table upload_sessions (
  id uuid primary key default gen_random_uuid(),
  ip_address text not null,
  turnstile_verified boolean not null default false,
  max_photos integer not null default 10,
  max_file_bytes integer not null default 10485760,   -- 10 MB per file
  max_total_bytes bigint not null default 52428800,    -- 50 MB total
  status text not null default 'active'
    check (status in ('active','consumed','expired')),
  consumed_by_booking uuid,  -- set when create-booking consumes session
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index idx_sessions_status on upload_sessions(status, expires_at);

create table session_photos (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references upload_sessions(id) on delete cascade,
  storage_path text not null,
  file_name text,
  content_type text,
  size_bytes integer not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index idx_session_photos_session on session_photos(session_id);


-- ============================================================
-- 4. Bookings
-- ============================================================

create table bookings (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pending_review'
    check (status in (
      'pending_review','quote_sent','scheduled',
      'completed','declined'
    )),

  -- Customer info
  customer_name text not null,
  customer_phone text not null,
  customer_email text,

  -- Address
  address text not null,
  city text not null,
  state text,
  zip text not null,
  full_address text not null,

  -- Request details
  quantity text,
  access_type text,
  stairs text,
  elevator text,
  description text,
  detected_items jsonb not null default '[]'::jsonb,
  ai_detected_items jsonb not null default '[]'::jsonb,
  photo_count integer not null default 0,

  -- Scheduling preferences (not confirmed appointments)
  preferred_date date,
  second_choice_date date,
  time_preference text,

  -- Quote lifecycle (denormalized for list views)
  quote_version integer not null default 0,
  approved_quote numeric(10,2),
  quote_expires_at timestamptz,
  approved_at timestamptz,

  -- Current token hash (for quick lookup)
  quote_token_hash text,

  -- Acceptance convenience fields
  accepted_at timestamptz,
  scheduled_pickup text,
  accepted_quote_snapshot_id uuid,

  -- Internal only (never in customer endpoints)
  internal_notes text not null default '',
  internal_estimate jsonb,
  risk_flags jsonb,
  confidence jsonb,
  job_rating jsonb,
  blocker_overrides jsonb not null default '{}'::jsonb,

  -- Completion
  actuals jsonb,
  completed_at timestamptz,

  -- Idempotency
  idempotency_key text unique,

  -- Upload session reference
  upload_session_id uuid references upload_sessions(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_bookings_status on bookings(status);
create index idx_bookings_token on bookings(quote_token_hash)
  where quote_token_hash is not null;
create index idx_bookings_created on bookings(created_at desc);

create trigger bookings_updated_at
  before update on bookings
  for each row execute function set_updated_at();

-- Back-reference from upload_sessions
alter table upload_sessions
  add constraint fk_sessions_booking
  foreign key (consumed_by_booking) references bookings(id);


-- ============================================================
-- 5. Booking photos (verified, linked to booking)
-- ============================================================

create table booking_photos (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  storage_path text not null,
  file_name text,
  content_type text,
  size_bytes integer,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index idx_booking_photos on booking_photos(booking_id);


-- ============================================================
-- 6. Quote snapshots (append-only, immutable)
-- ============================================================

create table quote_snapshots (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  version integer not null,
  approved_price numeric(10,2) not null,
  recommended_price numeric(10,2) not null,
  estimate_snapshot jsonb not null,
  settings_snapshot jsonb not null,
  available_slots jsonb not null default '[]'::jsonb,
  expires_at timestamptz not null,
  customer_terms jsonb not null,
  admin_override jsonb,
  admin_id uuid,
  created_at timestamptz not null default now(),

  unique(booking_id, version)
);

create index idx_snapshots_booking on quote_snapshots(booking_id);

-- Immutability: prevent update and delete (even from service role)
create trigger snapshots_no_update
  before update on quote_snapshots
  for each row execute function prevent_mutation();
create trigger snapshots_no_delete
  before delete on quote_snapshots
  for each row execute function prevent_mutation();


-- ============================================================
-- 7. Quote tokens (lifecycle tracking)
-- ============================================================

create table quote_tokens (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  quote_snapshot_id uuid not null references quote_snapshots(id),
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_tokens_hash on quote_tokens(token_hash)
  where revoked_at is null and used_at is null;
create index idx_tokens_booking on quote_tokens(booking_id);


-- ============================================================
-- 8. Slot reservations (structured scheduling)
-- ============================================================

create table slot_reservations (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  acceptance_id uuid,  -- set after acceptance is created
  resource_id text not null default 'truck-1',
  pickup_date date not null,
  start_time time not null,
  end_time time not null,
  status text not null default 'reserved'
    check (status in ('reserved','confirmed','canceled','completed')),
  reserved_at timestamptz not null default now(),
  canceled_at timestamptz
);

-- Prevent double-booking: only one active reservation per resource+date+start
create unique index idx_slot_unique_active
  on slot_reservations(resource_id, pickup_date, start_time)
  where status in ('reserved', 'confirmed');

create index idx_reservations_booking on slot_reservations(booking_id);
create index idx_reservations_date on slot_reservations(pickup_date, resource_id)
  where status in ('reserved', 'confirmed');


-- ============================================================
-- 9. Quote acceptances (independent auditable record)
-- ============================================================

create table quote_acceptances (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  quote_snapshot_id uuid not null references quote_snapshots(id),
  slot_reservation_id uuid references slot_reservations(id),
  accepted_price numeric(10,2) not null,
  accepted_at timestamptz not null default now(),
  terms_version integer not null,
  terms_hash text not null,
  customer_confirmations jsonb not null,
  idempotency_key text unique,
  created_at timestamptz not null default now()
);

create index idx_acceptances_booking on quote_acceptances(booking_id);

-- Back-reference
alter table slot_reservations
  add constraint fk_reservations_acceptance
  foreign key (acceptance_id) references quote_acceptances(id);

-- Acceptance reference on booking
alter table bookings
  add constraint fk_bookings_accepted_snapshot
  foreign key (accepted_quote_snapshot_id) references quote_snapshots(id);


-- ============================================================
-- 10. Audit log (append-only)
-- ============================================================

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id) on delete set null,
  event_type text not null
    check (event_type in (
      'booking_created','quote_approved','price_override',
      'blocker_override','quote_revised','quote_accepted',
      'slot_reserved','slot_canceled','booking_completed',
      'booking_declined','status_changed','token_revoked'
    )),
  admin_id uuid,
  before_value jsonb,
  after_value jsonb,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_audit_booking on audit_log(booking_id);
create index idx_audit_type on audit_log(event_type);
create index idx_audit_created on audit_log(created_at desc);

create trigger audit_no_update
  before update on audit_log
  for each row execute function prevent_mutation();
create trigger audit_no_delete
  before delete on audit_log
  for each row execute function prevent_mutation();


-- ============================================================
-- Row-Level Security
-- ============================================================

alter table admin_users enable row level security;
alter table rate_limits enable row level security;
alter table upload_sessions enable row level security;
alter table session_photos enable row level security;
alter table bookings enable row level security;
alter table booking_photos enable row level security;
alter table quote_snapshots enable row level security;
alter table quote_tokens enable row level security;
alter table slot_reservations enable row level security;
alter table quote_acceptances enable row level security;
alter table audit_log enable row level security;

-- admin_users: admins can read (to verify others), no self-grant
create policy "admins_read_admin_users" on admin_users
  for select to authenticated using (is_admin());

-- rate_limits: service role only (no RLS policies = no user access)

-- upload_sessions: service role only

-- session_photos: service role only

-- bookings: admin read/update only
create policy "admin_bookings_select" on bookings
  for select to authenticated using (is_admin());
create policy "admin_bookings_update" on bookings
  for update to authenticated using (is_admin()) with check (is_admin());
create policy "admin_bookings_delete" on bookings
  for delete to authenticated using (is_admin());
-- Insert via service role only (Netlify functions)

-- booking_photos: admin read only
create policy "admin_photos_select" on booking_photos
  for select to authenticated using (is_admin());

-- quote_snapshots: admin read + insert only (triggers prevent update/delete)
create policy "admin_snapshots_select" on quote_snapshots
  for select to authenticated using (is_admin());

-- quote_tokens: admin read only (writes via service role)
create policy "admin_tokens_select" on quote_tokens
  for select to authenticated using (is_admin());

-- slot_reservations: admin read only
create policy "admin_reservations_select" on slot_reservations
  for select to authenticated using (is_admin());

-- quote_acceptances: admin read only
create policy "admin_acceptances_select" on quote_acceptances
  for select to authenticated using (is_admin());

-- audit_log: admin read only (triggers prevent mutation)
create policy "admin_audit_select" on audit_log
  for select to authenticated using (is_admin());


-- ============================================================
-- Supabase Storage
-- ============================================================

insert into storage.buckets (id, name, public)
  values ('booking-photos', 'booking-photos', false)
  on conflict (id) do nothing;

-- Admin can read photos via signed URLs
create policy "admin_read_storage" on storage.objects
  for select to authenticated
  using (bucket_id = 'booking-photos' and is_admin());

-- No public access - all uploads via signed URLs from service role


-- ============================================================
-- Transactional RPC: accept_quote_atomic
-- ============================================================

create or replace function accept_quote_atomic(
  p_token_hash text,
  p_resource_id text,
  p_pickup_date date,
  p_start_time time,
  p_end_time time,
  p_confirmations jsonb,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_token         record;
  v_snapshot       record;
  v_booking        record;
  v_acceptance_id  uuid;
  v_reservation_id uuid;
  v_existing       record;
  v_generic_error  jsonb := jsonb_build_object(
    'success', false, 'error', 'Unable to process this request'
  );
begin
  -- ── Idempotency check ──
  select * into v_existing
  from quote_acceptances
  where idempotency_key = p_idempotency_key;

  if found then
    return jsonb_build_object(
      'success', true,
      'idempotent', true,
      'acceptance_id', v_existing.id,
      'scheduled_pickup', (
        select pickup_date::text || ' ' || start_time::text || '-' || end_time::text
        from slot_reservations where id = v_existing.slot_reservation_id
      )
    );
  end if;

  -- ── Verify token (generic error for all failure modes) ──
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

  -- ── Get snapshot ──
  select * into v_snapshot
  from quote_snapshots
  where id = v_token.quote_snapshot_id;

  if not found or v_snapshot.expires_at < now() then
    return v_generic_error;
  end if;

  -- ── Get booking (lock row) ──
  select * into v_booking
  from bookings
  where id = v_token.booking_id
  for update;

  if not found or v_booking.status != 'quote_sent' then
    return v_generic_error;
  end if;

  -- ── Verify confirmations ──
  if p_confirmations is null or jsonb_array_length(p_confirmations) < 3 then
    return jsonb_build_object(
      'success', false,
      'error', 'All confirmations are required'
    );
  end if;

  -- ── Reserve slot (unique constraint = atomic) ──
  begin
    insert into slot_reservations (
      booking_id, resource_id, pickup_date, start_time, end_time, status
    ) values (
      v_booking.id, p_resource_id, p_pickup_date,
      p_start_time, p_end_time, 'reserved'
    )
    returning id into v_reservation_id;
  exception when unique_violation then
    return jsonb_build_object(
      'success', false,
      'error', 'That time slot was just taken. Please choose another.'
    );
  end;

  -- ── Create acceptance record ──
  insert into quote_acceptances (
    booking_id, quote_snapshot_id, slot_reservation_id,
    accepted_price, terms_version, terms_hash,
    customer_confirmations, idempotency_key
  ) values (
    v_booking.id, v_snapshot.id, v_reservation_id,
    v_snapshot.approved_price, v_snapshot.version,
    md5(v_snapshot.customer_terms::text),
    p_confirmations, p_idempotency_key
  )
  returning id into v_acceptance_id;

  -- ── Update reservation with acceptance ──
  update slot_reservations
  set acceptance_id = v_acceptance_id
  where id = v_reservation_id;

  -- ── Update booking ──
  update bookings set
    status = 'scheduled',
    accepted_at = now(),
    accepted_quote_snapshot_id = v_snapshot.id,
    scheduled_pickup = p_pickup_date::text || ' '
      || p_start_time::text || '-' || p_end_time::text
  where id = v_booking.id;

  -- ── Mark token used ──
  update quote_tokens set used_at = now()
  where id = v_token.id;

  -- ── Audit events ──
  insert into audit_log (booking_id, event_type, metadata) values
    (v_booking.id, 'quote_accepted', jsonb_build_object(
      'acceptance_id', v_acceptance_id,
      'snapshot_id', v_snapshot.id,
      'snapshot_version', v_snapshot.version,
      'accepted_price', v_snapshot.approved_price
    )),
    (v_booking.id, 'slot_reserved', jsonb_build_object(
      'reservation_id', v_reservation_id,
      'resource_id', p_resource_id,
      'pickup_date', p_pickup_date,
      'start_time', p_start_time,
      'end_time', p_end_time
    ));

  return jsonb_build_object(
    'success', true,
    'acceptance_id', v_acceptance_id,
    'reservation_id', v_reservation_id,
    'scheduled_pickup', p_pickup_date::text || ' '
      || p_start_time::text || '-' || p_end_time::text
  );
end;
$$;


-- ============================================================
-- Transactional RPC: approve_quote_atomic
-- ============================================================

create or replace function approve_quote_atomic(
  p_booking_id uuid,
  p_admin_id uuid,
  p_approved_price numeric,
  p_recommended_price numeric,
  p_estimate_snapshot jsonb,
  p_settings_snapshot jsonb,
  p_available_slots jsonb,
  p_expires_at timestamptz,
  p_customer_terms jsonb,
  p_admin_override jsonb,
  p_token_hash text
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_booking     record;
  v_new_version integer;
  v_snapshot_id uuid;
  v_token_id    uuid;
begin
  -- ── Verify admin ──
  if not exists (select 1 from admin_users where user_id = p_admin_id) then
    raise exception 'Unauthorized';
  end if;

  -- ── Lock booking ──
  select * into v_booking
  from bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking not found';
  end if;

  v_new_version := coalesce(v_booking.quote_version, 0) + 1;

  -- ── Create immutable snapshot ──
  insert into quote_snapshots (
    booking_id, version, approved_price, recommended_price,
    estimate_snapshot, settings_snapshot, available_slots,
    expires_at, customer_terms, admin_override, admin_id
  ) values (
    p_booking_id, v_new_version, p_approved_price, p_recommended_price,
    p_estimate_snapshot, p_settings_snapshot, p_available_slots,
    p_expires_at, p_customer_terms, p_admin_override, p_admin_id
  )
  returning id into v_snapshot_id;

  -- ── Revoke previous tokens ──
  update quote_tokens
  set revoked_at = now()
  where booking_id = p_booking_id
    and revoked_at is null;

  -- Log revocations
  insert into audit_log (booking_id, event_type, admin_id, metadata)
  select p_booking_id, 'token_revoked', p_admin_id,
    jsonb_build_object('token_id', id, 'reason', 'superseded_by_v' || v_new_version)
  from quote_tokens
  where booking_id = p_booking_id
    and revoked_at = now();  -- just-revoked ones

  -- ── Create new token ──
  insert into quote_tokens (
    booking_id, quote_snapshot_id, token_hash, expires_at
  ) values (
    p_booking_id, v_snapshot_id, p_token_hash, p_expires_at
  )
  returning id into v_token_id;

  -- ── Update booking ──
  update bookings set
    status = 'quote_sent',
    quote_version = v_new_version,
    approved_quote = p_approved_price,
    quote_expires_at = p_expires_at,
    approved_at = now(),
    quote_token_hash = p_token_hash,
    internal_estimate = p_estimate_snapshot
  where id = p_booking_id;

  -- ── Audit: approval ──
  insert into audit_log (
    booking_id, event_type, admin_id, after_value, metadata
  ) values (
    p_booking_id, 'quote_approved', p_admin_id,
    jsonb_build_object(
      'approved_price', p_approved_price,
      'version', v_new_version
    ),
    jsonb_build_object(
      'snapshot_id', v_snapshot_id,
      'token_id', v_token_id,
      'expires_at', p_expires_at
    )
  );

  -- ── Audit: price override ──
  if p_admin_override is not null then
    insert into audit_log (
      booking_id, event_type, admin_id,
      before_value, after_value, reason
    ) values (
      p_booking_id, 'price_override', p_admin_id,
      jsonb_build_object('recommended_price', p_recommended_price),
      jsonb_build_object('approved_price', p_approved_price),
      p_admin_override->>'reason'
    );
  end if;

  -- ── Audit: revision (if not first version) ──
  if v_new_version > 1 then
    insert into audit_log (
      booking_id, event_type, admin_id, metadata
    ) values (
      p_booking_id, 'quote_revised', p_admin_id,
      jsonb_build_object(
        'old_version', v_new_version - 1,
        'new_version', v_new_version,
        'snapshot_id', v_snapshot_id
      )
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'snapshot_id', v_snapshot_id,
    'token_id', v_token_id,
    'version', v_new_version
  );
end;
$$;


-- ============================================================
-- Data retention cleanup
-- ============================================================

create or replace function cleanup_abandoned_data()
returns jsonb
language plpgsql
security definer
as $$
declare
  v_sessions integer;
  v_rate_limits integer;
  v_declined integer;
begin
  -- Expire active sessions older than 2 hours
  update upload_sessions
  set status = 'expired'
  where status = 'active'
    and expires_at < now();
  get diagnostics v_sessions = row_count;

  -- Delete session photos for expired/unconsumed sessions
  -- (Storage objects cleaned separately via application code)
  delete from session_photos
  where session_id in (
    select id from upload_sessions
    where status = 'expired'
      and created_at < now() - interval '24 hours'
  );

  -- Delete expired sessions older than 24 hours
  delete from upload_sessions
  where status = 'expired'
    and created_at < now() - interval '24 hours';

  -- Clean old rate limit entries
  delete from rate_limits
  where requested_at < now() - interval '1 hour';
  get diagnostics v_rate_limits = row_count;

  -- Delete declined bookings older than 90 days
  delete from bookings
  where status = 'declined'
    and created_at < now() - interval '90 days';
  get diagnostics v_declined = row_count;

  return jsonb_build_object(
    'expired_sessions', v_sessions,
    'cleaned_rate_limits', v_rate_limits,
    'cleaned_declined', v_declined
  );
end;
$$;


-- ============================================================
-- Retention documentation
-- ============================================================
comment on function cleanup_abandoned_data() is
'Retention policy:
  - Abandoned photo uploads: expired sessions cleaned after 24 hours.
    Storage objects must be cleaned via application-level sweep.
  - Unsubmitted sessions: expired after 2 hours, deleted after 24 hours.
  - Declined bookings: deleted after 90 days (cascade deletes photos, snapshots).
  - Completed-job photos: retained indefinitely (manual review for deletion).
  - Customer contact info: retained with booking record per policy above.
  - Rate limit entries: deleted after 1 hour.
Run this function on a schedule (e.g. daily cron).';
