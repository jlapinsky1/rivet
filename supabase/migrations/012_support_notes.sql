-- ============================================================
-- Migration 012: Support notes for admin customer support
-- ============================================================
-- Adds:
--   - support_notes table: timestamped, attributed notes per booking
--   - Admin-only RLS using existing is_admin() function
--   - audit_log event type: support_note_added

-- ── 1. support_notes table ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS support_notes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  uuid        NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  note_text   text        NOT NULL,
  admin_id    uuid        REFERENCES auth.users(id),
  admin_email text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_notes_booking_id_idx ON support_notes(booking_id);
CREATE INDEX IF NOT EXISTS support_notes_created_at_idx ON support_notes(created_at);

ALTER TABLE support_notes ENABLE ROW LEVEL SECURITY;

-- Admin read via authenticated client (used by getSupportNotes in frontend repo)
CREATE POLICY "admin_read_support_notes"
  ON support_notes
  FOR SELECT
  TO authenticated
  USING (is_admin());

-- All writes (insert/update/delete) go through service-role Netlify functions
-- and bypass RLS - no client-side write policy needed.


-- ── 2. Extend audit_log event types to include support_note_added ───────────

ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_event_type_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_event_type_check
  CHECK (event_type IN (
    -- original booking lifecycle
    'booking_created', 'quote_approved', 'price_override', 'blocker_override',
    'quote_revised', 'quote_accepted', 'slot_reserved', 'slot_canceled',
    'booking_completed', 'booking_declined', 'status_changed', 'token_revoked',
    -- payment events
    'deposit_initiated', 'deposit_confirmed', 'deposit_failed',
    'final_payment_requested', 'final_payment_confirmed',
    -- admin operations
    'dispatch_override', 'invoice_adjusted', 'stripe_reconciled', 'invoice_voided',
    -- support
    'support_note_added'
  ));
