"""
Dispatch enforcement tests: deposit must be confirmed before a job can be completed.
Admin override path is also tested.

These tests manipulate booking status directly via the Supabase service client
to simulate post-webhook state without requiring the full Stripe CLI flow.
"""
import uuid
from datetime import datetime, timezone, timedelta

import pytest

from tests.fixtures.factories import make_booking

pytestmark = pytest.mark.dispatch


def _create_approved_booking(api, admin_headers, upload_session, test_run_id, test_service_area, price=350):
    payload = make_booking(upload_session, test_run_id)
    r = api.post("/api/create-booking", json=payload)
    assert r.status_code == 201
    booking_id = r.json()["bookingId"]

    expires_at = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    r2 = api.post("/api/approve-quote", json={
        "bookingId": booking_id,
        "approvedPrice": price,
        "estimateSnapshot": {"price": price},
        "settingsSnapshot": {},
        "availableSlots": [{"date": "2026-09-20", "startTime": "08:00", "endTime": "12:00"}],
        "expiresAt": expires_at,
        "customerTerms": {
            "included": ["labor"],
            "customerConfirmations": ["c1", "c2", "c3"],
        },
    }, headers=admin_headers)
    assert r2.status_code == 200
    return booking_id


def _force_booking_status(supabase, booking_id, status, deposit_confirmed=False):
    """Directly set booking status via service client (test setup only)."""
    update = {"status": status}
    if deposit_confirmed:
        update["deposit_confirmed_at"] = datetime.now(timezone.utc).isoformat()
    supabase.table("bookings").update(update).eq("id", booking_id).execute()


def _valid_completion_payload(booking_id):
    return {
        "bookingId": booking_id,
        "completedAt": "2026-09-20T14:00:00Z",
        "technicianName": "Bob",
        "itemsRemoved": "Old couch",
        "completionNotes": "Job done cleanly.",
        "finalAmountCents": 35000,
        "afterPhotoStoragePaths": [f"completions/{booking_id}/after1.jpg"],
    }


# ── Deposit enforcement ────────────────────────────────────────────────────────

def test_complete_job_blocked_without_deposit(api, admin_headers, supabase, test_upload_session, test_run_id, test_service_area):
    """complete-job must return 403 when deposit_confirmed_at is NULL."""
    booking_id = _create_approved_booking(api, admin_headers, test_upload_session, test_run_id, test_service_area)

    # Move to scheduled without deposit confirmation
    _force_booking_status(supabase, booking_id, "scheduled", deposit_confirmed=False)

    payload = _valid_completion_payload(booking_id)
    r = api.post("/api/complete-job", json=payload, headers=admin_headers)
    assert r.status_code == 403
    assert "deposit" in r.json().get("error", "").lower()


def test_complete_job_allowed_after_deposit_confirmed(api, admin_headers, supabase, test_upload_session, test_run_id, test_service_area):
    """complete-job must succeed when deposit_confirmed_at is set."""
    booking_id = _create_approved_booking(api, admin_headers, test_upload_session, test_run_id, test_service_area)

    # Move to scheduled WITH deposit confirmed (simulates webhook having fired)
    _force_booking_status(supabase, booking_id, "scheduled", deposit_confirmed=True)

    payload = _valid_completion_payload(booking_id)
    r = api.post("/api/complete-job", json=payload, headers=admin_headers)
    # Will fail at Stripe PI creation if no Stripe configured - non-fatal (completion still saved)
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    assert "completionId" in body


def test_complete_job_override_requires_reason(api, admin_headers, supabase, test_upload_session, test_run_id, test_service_area):
    """Override without a reason must still be blocked."""
    booking_id = _create_approved_booking(api, admin_headers, test_upload_session, test_run_id, test_service_area)
    _force_booking_status(supabase, booking_id, "scheduled", deposit_confirmed=False)

    payload = _valid_completion_payload(booking_id)
    payload["override"] = True  # no overrideReason → must fail
    r = api.post("/api/complete-job", json=payload, headers=admin_headers)
    assert r.status_code == 403


def test_complete_job_override_with_reason_succeeds(api, admin_headers, supabase, test_upload_session, test_run_id, test_service_area):
    """override=true + overrideReason should bypass deposit check."""
    booking_id = _create_approved_booking(api, admin_headers, test_upload_session, test_run_id, test_service_area)
    _force_booking_status(supabase, booking_id, "scheduled", deposit_confirmed=False)

    payload = _valid_completion_payload(booking_id)
    payload["override"] = True
    payload["overrideReason"] = "Customer paid cash on-site; Stripe not used."
    r = api.post("/api/complete-job", json=payload, headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["success"] is True


def test_complete_job_override_creates_audit_record(api, admin_headers, supabase, test_upload_session, test_run_id, test_service_area):
    """Override must create an audit_log entry with type dispatch_override."""
    booking_id = _create_approved_booking(api, admin_headers, test_upload_session, test_run_id, test_service_area)
    _force_booking_status(supabase, booking_id, "scheduled", deposit_confirmed=False)

    reason = "Test override reason"
    payload = _valid_completion_payload(booking_id)
    payload["override"] = True
    payload["overrideReason"] = reason
    r = api.post("/api/complete-job", json=payload, headers=admin_headers)
    assert r.status_code == 200

    # Verify audit log entry
    audit = (
        supabase.table("audit_log")
        .select("*")
        .eq("booking_id", booking_id)
        .eq("event_type", "dispatch_override")
        .execute()
    )
    records = audit.data
    assert len(records) >= 1
    assert records[0]["reason"] == reason


def test_complete_job_requires_admin_auth(api, test_booking):
    """Unauthenticated request must be rejected."""
    r = api.post("/api/complete-job", json={
        "bookingId": test_booking,
        "completedAt": "2026-09-20T14:00:00Z",
        "technicianName": "Alice",
        "itemsRemoved": "Items",
        "completionNotes": "Done.",
        "finalAmountCents": 35000,
        "afterPhotoStoragePaths": [f"completions/{test_booking}/photo.jpg"],
    })
    assert r.status_code == 401


# ── Idempotency ───────────────────────────────────────────────────────────────

def test_complete_job_idempotent_no_duplicate_records(api, admin_headers, supabase, test_upload_session, test_run_id, test_service_area):
    """Calling complete-job twice must not create duplicate booking_completions rows."""
    booking_id = _create_approved_booking(api, admin_headers, test_upload_session, test_run_id, test_service_area)
    _force_booking_status(supabase, booking_id, "scheduled", deposit_confirmed=True)

    payload = _valid_completion_payload(booking_id)
    r1 = api.post("/api/complete-job", json=payload, headers=admin_headers)
    assert r1.status_code == 200

    r2 = api.post("/api/complete-job", json=payload, headers=admin_headers)
    # Should return 200 idempotent (not 500 or duplicate insert error)
    assert r2.status_code == 200

    # Verify exactly one completion record
    rows = (
        supabase.table("booking_completions")
        .select("id")
        .eq("booking_id", booking_id)
        .execute()
    )
    assert len(rows.data) == 1


# ── Price adjustment enforcement ──────────────────────────────────────────────

def test_price_adjustment_requires_reason_when_amount_differs(api, admin_headers, supabase, test_upload_session, test_run_id, test_service_area):
    """final amount differs from approved_quote → priceAdjustmentReason required."""
    booking_id = _create_approved_booking(api, admin_headers, test_upload_session, test_run_id, test_service_area, price=350)
    _force_booking_status(supabase, booking_id, "scheduled", deposit_confirmed=True)

    payload = _valid_completion_payload(booking_id)
    payload["finalAmountCents"] = 40000  # differs from 35000 (approved $350)
    # No priceAdjustmentReason → must fail
    r = api.post("/api/complete-job", json=payload, headers=admin_headers)
    assert r.status_code == 400
    assert "priceAdjustmentReason" in r.json().get("error", "")


def test_price_adjustment_accepted_with_reason(api, admin_headers, supabase, test_upload_session, test_run_id, test_service_area):
    """final amount differs + reason provided → should succeed."""
    booking_id = _create_approved_booking(api, admin_headers, test_upload_session, test_run_id, test_service_area, price=350)
    _force_booking_status(supabase, booking_id, "scheduled", deposit_confirmed=True)

    payload = _valid_completion_payload(booking_id)
    payload["finalAmountCents"] = 40000
    payload["priceAdjustmentReason"] = "Additional items found on-site."
    r = api.post("/api/complete-job", json=payload, headers=admin_headers)
    assert r.status_code == 200
