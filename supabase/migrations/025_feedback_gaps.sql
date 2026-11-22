-- 025: Plug feedback loop gaps
-- 1. Link work_items back to their source booking so RequestQueue can record owner_decisions
-- 2. Add reason_text column to owner_decisions for free-text rationale

-- ─── source_booking_id on work_items ───
-- Allows the old booking admin queue (RequestQueue.jsx) to look up the
-- estimation_run_id when recording owner decisions.

alter table work_items
  add column if not exists source_booking_id uuid references bookings(id) on delete set null;

create index if not exists idx_work_items_source_booking on work_items (source_booking_id)
  where source_booking_id is not null;

-- ─── reason_text on owner_decisions ───
-- Free-text rationale, supplements the structured reason_code.

alter table owner_decisions
  add column if not exists reason_text text;
