-- ============================================================
-- Migration 007: Admin delete booking
--
-- The prevent_mutation() trigger on quote_snapshots and audit_log
-- blocks all DELETEs, including cascades from bookings. This migration
-- modifies the trigger to allow deletes initiated by the
-- admin_delete_booking() function via a session-level flag.
-- ============================================================

-- Allow prevent_mutation to be bypassed when app.allow_delete = 'true'
create or replace function prevent_mutation()
returns trigger as $$
begin
  if current_setting('app.allow_delete', true) = 'true' then
    return old;
  end if;
  raise exception '% on % is not allowed - this table is append-only',
    tg_op, tg_table_name;
end;
$$ language plpgsql;

-- Admin-only function to permanently delete a booking and all its children.
-- Uses SET LOCAL to enable cascade deletion through the immutability triggers
-- for the duration of this transaction only.
create or replace function admin_delete_booking(p_booking_id uuid)
returns void as $$
begin
  if not is_admin() then
    raise exception 'Unauthorized';
  end if;
  set local "app.allow_delete" = 'true';
  delete from bookings where id = p_booking_id;
end;
$$ language plpgsql security definer;
