"""
Completion package tests: complete-job validation, after photo requirements,
storage path security, idempotency, and get-final-job-page access control.
"""
import uuid
from datetime import datetime, timezone, timedelta

import pytest

from tests.fixtures.factories import make_booking

pytestmark = pytest.mark.completion


def _create_booking(api, upload_session, test_run_id, test_service_area):
    payload = make_booking(upload_session, test_run_id)
    r = api.post("/api/create-booking", json=payload)
    assert r.status_code == 201
    return r.json()["bookingId"]


def _approve_quote(api, admin_headers, booking_id, price=350):
    expires_at = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    r = api.post("/api/approve-quote", json={
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
    assert r.status_code == 200
    return r.json()


def _valid_completion_payload(booking_id, paths=None):
    return {
        "bookingId": booking_id,
        "completedAt": "2026-09-20T14:00:00Z",
        "technicianName": "Alice Smith",
        "itemsRemoved": "Sofa, old dresser, boxes of misc",
        "completionNotes": "All items removed successfully.",
        "finalAmountCents": 35000,
        "afterPhotoStoragePaths": paths or [f"completions/{booking_id}/photo1.jpg"],
    }


# ── Validation: required fields ───────────────────────────────────────────────

def test_complete_job_requires_after_photos(api, admin_headers, test_booking):
    payload = _valid_completion_payload(test_booking, paths=[])
    r = api.post("/api/complete-job", json=payload, headers=admin_headers)
    assert r.status_code == 400
    assert "photo" in r.json().get("error", "").lower()


def test_complete_job_requires_completion_notes(api, admin_headers, test_booking):
    payload = _valid_completion_payload(test_booking)
    payload["completionNotes"] = ""
    r = api.post("/api/complete-job", json=payload, headers=admin_headers)
    assert r.status_code == 400
    assert "completionNotes" in r.json().get("error", "")


def test_complete_job_requires_items_removed(api, admin_headers, test_booking):
    payload = _valid_completion_payload(test_booking)
    payload["itemsRemoved"] = "  "
    r = api.post("/api/complete-job", json=payload, headers=admin_headers)
    assert r.status_code == 400
    assert "itemsRemoved" in r.json().get("error", "")


def test_complete_job_requires_technician_name(api, admin_headers, test_booking):
    payload = _valid_completion_payload(test_booking)
    payload["technicianName"] = ""
    r = api.post("/api/complete-job", json=payload, headers=admin_headers)
    assert r.status_code == 400
    assert "technicianName" in r.json().get("error", "")


def test_complete_job_requires_positive_final_amount(api, admin_headers, test_booking):
    payload = _valid_completion_payload(test_booking)
    payload["finalAmountCents"] = 0
    r = api.post("/api/complete-job", json=payload, headers=admin_headers)
    assert r.status_code == 400
    assert "finalAmountCents" in r.json().get("error", "")


def test_complete_job_requires_completed_at(api, admin_headers, test_booking):
    payload = _valid_completion_payload(test_booking)
    del payload["completedAt"]
    r = api.post("/api/complete-job", json=payload, headers=admin_headers)
    assert r.status_code == 400
    assert "completedAt" in r.json().get("error", "")


# ── Validation: storage path security ────────────────────────────────────────

def test_complete_job_rejects_path_traversal(api, admin_headers, test_booking):
    """Storage paths must start with completions/{bookingId}/ - no traversal."""
    payload = _valid_completion_payload(test_booking, paths=[
        "completions/../other-booking/photo.jpg"  # path traversal attempt
    ])
    r = api.post("/api/complete-job", json=payload, headers=admin_headers)
    assert r.status_code == 400
    assert "path" in r.json().get("error", "").lower()


def test_complete_job_rejects_wrong_booking_path(api, admin_headers, test_booking):
    """Photos for a different booking_id must be rejected."""
    other_id = str(uuid.uuid4())
    payload = _valid_completion_payload(test_booking, paths=[
        f"completions/{other_id}/photo.jpg"  # wrong booking_id in path
    ])
    r = api.post("/api/complete-job", json=payload, headers=admin_headers)
    assert r.status_code == 400
    assert "path" in r.json().get("error", "").lower()


# ── Status enforcement ────────────────────────────────────────────────────────

def test_complete_job_blocked_for_pending_review_booking(api, admin_headers, test_booking):
    """Bookings in pending_review cannot be completed."""
    payload = _valid_completion_payload(test_booking)
    r = api.post("/api/complete-job", json=payload, headers=admin_headers)
    # pending_review → 400
    assert r.status_code == 400


def test_complete_job_blocked_without_deposit(api, admin_headers, test_upload_session, test_run_id, test_service_area):
    """Completing a job without deposit_confirmed_at must return 403 without override."""
    booking_id = _create_booking(api, test_upload_session, test_run_id, test_service_area)
    approval = _approve_quote(api, admin_headers, booking_id)

    # Manually move booking to scheduled without deposit (admin-only DB side effect)
    # In tests without Stripe, we can use the supabase fixture to set status directly.
    # This test verifies the 403 response when deposit is missing.
    # Since we can't deposit without Stripe, we skip if Stripe isn't wired up.
    pytest.skip("Requires database manipulation to set status=scheduled without deposit - covered by test_dispatch_enforcement.py")


# ── Admin auth enforcement ────────────────────────────────────────────────────

def test_complete_job_requires_admin_auth(api, test_booking):
    payload = _valid_completion_payload(test_booking)
    r = api.post("/api/complete-job", json=payload)
    assert r.status_code == 401


def test_get_completion_photo_url_requires_admin(api, test_booking):
    r = api.post("/api/get-completion-photo-url", json={
        "bookingId": test_booking,
        "fileName": "photo.jpg",
        "contentType": "image/jpeg",
    })
    assert r.status_code == 401


def test_get_completion_photo_url_rejects_invalid_content_type(api, admin_headers, test_booking):
    r = api.post("/api/get-completion-photo-url", json={
        "bookingId": test_booking,
        "fileName": "malware.exe",
        "contentType": "application/octet-stream",  # not an image
    }, headers=admin_headers)
    assert r.status_code == 400
    assert "contentType" in r.json().get("error", "")


# ── get-final-job-page access control ────────────────────────────────────────

def test_final_job_page_invalid_token_rejected(api):
    r = api.get("/api/get-final-job-page?token=not-a-real-token")
    assert r.status_code == 400


def test_final_job_page_missing_token_rejected(api):
    r = api.get("/api/get-final-job-page")
    assert r.status_code == 400


def test_final_job_page_quote_token_rejected(api, test_upload_session, test_run_id, test_service_area, admin_headers):
    """A quote token must NOT grant access to the final job page (wrong token type)."""
    booking_id = _create_booking(api, test_upload_session, test_run_id, test_service_area)
    approval = _approve_quote(api, admin_headers, booking_id)
    quote_token = approval["quoteToken"]

    # quote token → not a payment_access_token → must be rejected
    r = api.get(f"/api/get-final-job-page?token={quote_token}")
    assert r.status_code == 400


def test_final_job_page_returns_404_before_completion(api, test_upload_session, test_run_id, test_service_area, admin_headers, supabase):
    """get-final-job-page must return 404 if booking_completions row does not exist yet."""
    # This test requires a valid payment_access_token - requires full Stripe flow.
    # Covered by integration tests that run with Stripe CLI.
    pytest.skip("Requires Stripe CLI + webhook flow to generate a valid payment_access_token")


# ── residential-completion-pdf access control ────────────────────────────────

def test_completion_pdf_missing_token_rejected(api):
    r = api.get("/api/residential-completion-pdf")
    assert r.status_code == 400


def test_completion_pdf_invalid_token_rejected(api):
    r = api.get("/api/residential-completion-pdf?token=bad-token")
    assert r.status_code == 400


def test_completion_pdf_requires_admin_for_booking_id_path(api, test_booking):
    r = api.get(f"/api/residential-completion-pdf?bookingId={test_booking}")
    assert r.status_code == 401


def test_completion_pdf_quote_token_rejected(api, test_upload_session, test_run_id, test_service_area, admin_headers):
    """Quote token must NOT grant access to the PDF (wrong purpose)."""
    booking_id = _create_booking(api, test_upload_session, test_run_id, test_service_area)
    approval = _approve_quote(api, admin_headers, booking_id)
    quote_token = approval["quoteToken"]

    r = api.get(f"/api/residential-completion-pdf?token={quote_token}")
    assert r.status_code == 400
