"""
Payment flow tests: deposit calculation, create-deposit-payment, payment-summary.

These tests require STRIPE_SECRET_KEY to be set in the test environment.
Tests that require Stripe will skip gracefully if credentials are absent.
Webhook-dependent tests (deposit confirmation, financial completion) require
the Stripe CLI running: `stripe listen --forward-to localhost:8888/api/stripe-webhook`
"""
import os
import uuid
from datetime import datetime, timezone, timedelta

import pytest

from tests.fixtures.factories import make_booking

pytestmark = pytest.mark.payment


def _stripe_configured() -> bool:
    return bool(os.environ.get("STRIPE_SECRET_KEY", "").startswith("sk_"))


def _create_booking(api, upload_session, test_run_id, test_service_area):
    payload = make_booking(upload_session, test_run_id)
    r = api.post("/api/create-booking", json=payload)
    assert r.status_code == 201
    return r.json()["bookingId"]


def _approve_quote(api, admin_headers, booking_id, price=400):
    expires_at = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    r = api.post("/api/approve-quote", json={
        "bookingId": booking_id,
        "approvedPrice": price,
        "estimateSnapshot": {"price": price},
        "settingsSnapshot": {},
        "availableSlots": [
            {"date": "2026-09-20", "startTime": "08:00", "endTime": "12:00"},
        ],
        "expiresAt": expires_at,
        "customerTerms": {
            "included": ["labor", "disposal"],
            "customerConfirmations": ["confirm 1", "confirm 2", "confirm 3"],
        },
    }, headers=admin_headers)
    assert r.status_code == 200, f"Approve failed: {r.text}"
    return r.json()


# ── Deposit calculation ──────────────────────────────────────────────────────

def test_deposit_is_floor_half_of_invoice_total(api, test_upload_session, test_run_id, test_service_area, admin_headers):
    """Deposit must be Math.floor(total / 2) - never rounded up."""
    if not _stripe_configured():
        pytest.skip("Stripe not configured")

    booking_id = _create_booking(api, test_upload_session, test_run_id, test_service_area)
    approval = _approve_quote(api, admin_headers, booking_id, price=401)  # odd dollar amount
    token = approval["quoteToken"]

    r = api.post("/api/create-deposit-payment", json={
        "token": token,
        "resourceId": "truck-1",
        "pickupDate": "2026-09-20",
        "startTime": "08:00",
        "endTime": "12:00",
        "confirmations": ["confirm 1", "confirm 2", "confirm 3"],
    })
    if r.status_code == 503:
        pytest.skip("Stripe not available")
    assert r.status_code == 200
    data = r.json()
    assert data["invoiceTotalCents"] == 40100
    assert data["depositCents"] == 20050  # floor(40100 / 2)


def test_deposit_odd_cent_total(api, test_upload_session, test_run_id, test_service_area, admin_headers):
    """$501.01 total → deposit $250.50 (floor), final covers $250.51."""
    if not _stripe_configured():
        pytest.skip("Stripe not configured")

    booking_id = _create_booking(api, test_upload_session, test_run_id, test_service_area)
    # $501.01 has to be represented as 50101 cents
    approval = _approve_quote(api, admin_headers, booking_id, price=501.01)
    token = approval["quoteToken"]

    r = api.post("/api/create-deposit-payment", json={
        "token": token,
        "resourceId": "truck-1",
        "pickupDate": "2026-09-20",
        "startTime": "08:00",
        "endTime": "12:00",
        "confirmations": ["confirm 1", "confirm 2", "confirm 3"],
    })
    if r.status_code == 503:
        pytest.skip("Stripe not available")
    assert r.status_code == 200
    data = r.json()
    assert data["depositCents"] == 25050  # floor(50100 / 2)


# ── create-deposit-payment security ─────────────────────────────────────────

def test_expired_token_cannot_create_deposit(api, test_upload_session, test_run_id, test_service_area, admin_headers):
    """Revoked/invalid token must be rejected."""
    r = api.post("/api/create-deposit-payment", json={
        "token": "invalid-token-not-in-db",
        "resourceId": "truck-1",
        "pickupDate": "2026-09-20",
        "startTime": "08:00",
        "endTime": "12:00",
        "confirmations": ["a", "b", "c"],
    })
    assert r.status_code in (400, 503)


def test_fewer_than_3_confirmations_rejected(api, test_upload_session, test_run_id, test_service_area, admin_headers):
    """create-deposit-payment must reject fewer than 3 confirmations."""
    booking_id = _create_booking(api, test_upload_session, test_run_id, test_service_area)
    approval = _approve_quote(api, admin_headers, booking_id)
    token = approval["quoteToken"]

    r = api.post("/api/create-deposit-payment", json={
        "token": token,
        "resourceId": "truck-1",
        "pickupDate": "2026-09-20",
        "startTime": "08:00",
        "endTime": "12:00",
        "confirmations": ["only one", "only two"],  # < 3
    })
    assert r.status_code == 400
    assert "confirmation" in r.json().get("error", "").lower()


def test_client_cannot_supply_deposit_amount(api, test_upload_session, test_run_id, test_service_area, admin_headers):
    """Sending depositCents in the request body must have no effect - server calculates it."""
    if not _stripe_configured():
        pytest.skip("Stripe not configured")

    booking_id = _create_booking(api, test_upload_session, test_run_id, test_service_area)
    approval = _approve_quote(api, admin_headers, booking_id, price=400)
    token = approval["quoteToken"]

    r = api.post("/api/create-deposit-payment", json={
        "token": token,
        "resourceId": "truck-1",
        "pickupDate": "2026-09-20",
        "startTime": "08:00",
        "endTime": "12:00",
        "confirmations": ["c1", "c2", "c3"],
        "depositCents": 1,  # attacker supplying their own amount - must be ignored
    })
    if r.status_code == 503:
        pytest.skip("Stripe not available")
    assert r.status_code == 200
    assert r.json()["depositCents"] == 20000  # server-calculated: floor(40000 / 2)


def test_deposit_idempotent_returns_same_client_secret(api, test_upload_session, test_run_id, test_service_area, admin_headers):
    """Calling create-deposit-payment twice with the same token returns the same PI."""
    if not _stripe_configured():
        pytest.skip("Stripe not configured")

    booking_id = _create_booking(api, test_upload_session, test_run_id, test_service_area)
    approval = _approve_quote(api, admin_headers, booking_id)
    token = approval["quoteToken"]

    payload = {
        "token": token,
        "resourceId": "truck-1",
        "pickupDate": "2026-09-20",
        "startTime": "08:00",
        "endTime": "12:00",
        "confirmations": ["c1", "c2", "c3"],
    }

    r1 = api.post("/api/create-deposit-payment", json=payload)
    if r1.status_code == 503:
        pytest.skip("Stripe not available")
    assert r1.status_code == 200

    r2 = api.post("/api/create-deposit-payment", json=payload)
    assert r2.status_code == 200
    # Same PI → same client_secret prefix (pi_xxx_secret_yyy)
    assert r1.json()["clientSecret"].split("_secret_")[0] == r2.json()["clientSecret"].split("_secret_")[0]


# ── payment-summary endpoint ─────────────────────────────────────────────────

def test_payment_summary_requires_token_or_booking_id(api):
    r = api.get("/api/payment-summary")
    assert r.status_code == 400


def test_admin_payment_summary_requires_auth(api, test_upload_session, test_run_id, test_service_area, admin_headers):
    booking_id = _create_booking(api, test_upload_session, test_run_id, test_service_area)
    _approve_quote(api, admin_headers, booking_id)
    r = api.get(f"/api/payment-summary?bookingId={booking_id}")  # no auth header
    assert r.status_code == 401


def test_customer_payment_summary_invalid_token(api):
    r = api.get("/api/payment-summary?token=not-a-real-token")
    assert r.status_code == 400


def test_admin_payment_summary_no_invoice(api, admin_headers, test_upload_session, test_run_id, test_service_area):
    """Booking without Stripe invoice → 404 with clear error."""
    booking_id = _create_booking(api, test_upload_session, test_run_id, test_service_area)
    # Not approved → no invoice
    r = api.get(f"/api/payment-summary?bookingId={booking_id}", headers=admin_headers)
    assert r.status_code == 404


def test_hosted_url_hidden_before_final_payment_requested(api, test_upload_session, test_run_id, test_service_area, admin_headers):
    """hostedInvoiceUrl must not appear in customer DTO until final payment is requested."""
    if not _stripe_configured():
        pytest.skip("Stripe not configured")

    booking_id = _create_booking(api, test_upload_session, test_run_id, test_service_area)
    approval = _approve_quote(api, admin_headers, booking_id)
    token = approval["quoteToken"]

    r = api.get(f"/api/payment-summary?token={token}")
    if r.status_code == 503:
        pytest.skip("Stripe not available")
    assert r.status_code == 200
    assert "hostedInvoiceUrl" not in r.json()
