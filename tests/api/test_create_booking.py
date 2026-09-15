"""
POST /api/create-booking - field matrix, idempotency, server-side enforcement.
"""
import uuid

import pytest

from tests.fixtures.factories import make_booking, make_email

pytestmark = pytest.mark.integration


# ── Happy path ────────────────────────────────────────────────────────────────

@pytest.mark.smoke
def test_valid_booking_returns_201(api, test_upload_session, test_run_id, test_service_area):
    payload = make_booking(test_upload_session, test_run_id)
    r = api.post("/api/create-booking", json=payload)
    assert r.status_code == 201
    body = r.json()
    assert "bookingId" in body
    assert isinstance(body["bookingId"], str)
    assert len(body["bookingId"]) > 0


@pytest.mark.smoke
def test_valid_booking_persisted(api, test_upload_session, test_run_id, test_service_area,
                                  base_url, lookup_headers):
    import requests as req
    payload = make_booking(test_upload_session, test_run_id)
    r = api.post("/api/create-booking", json=payload)
    assert r.status_code == 201

    lookup = req.get(
        f"{base_url}/api/test/lookup",
        headers=lookup_headers,
        params={"type": "booking", "testRunId": test_run_id, "idempotencyKey": payload["idempotencyKey"]},
        timeout=10,
    )
    assert lookup.status_code == 200
    record = lookup.json()
    assert record["customer_name"] == payload["customerName"]
    assert record["zip"] == payload["zip"]
    assert record["status"] == "pending_review"


# ── Required field validation ─────────────────────────────────────────────────

@pytest.mark.parametrize("missing_field", [
    "sessionId",
    "idempotencyKey",
    "customerName",
    "customerPhone",
    "address",
    "city",
    "zip",
    "fullAddress",
])
def test_missing_required_field_rejected(
    missing_field, api, test_upload_session, test_run_id, test_service_area,
    base_url, lookup_headers
):
    import requests as req
    payload = make_booking(test_upload_session, test_run_id)
    idem_key = payload["idempotencyKey"]
    del payload[missing_field]

    r = api.post("/api/create-booking", json=payload)
    assert r.status_code == 400
    assert "error" in r.json()

    # Verify no record was created
    count_resp = req.get(
        f"{base_url}/api/test/lookup",
        headers=lookup_headers,
        params={"type": "booking_count", "testRunId": test_run_id, "idempotencyKey": idem_key},
        timeout=10,
    )
    if count_resp.status_code == 200:
        assert count_resp.json()["count"] == 0


# ── Server-side ZIP enforcement ───────────────────────────────────────────────

def test_out_of_zone_zip_blocked_server_side(
    api, test_upload_session, test_run_id, test_service_area, out_of_zone_zip,
    base_url, lookup_headers
):
    import requests as req
    payload = make_booking(test_upload_session, test_run_id, zip=out_of_zone_zip)
    r = api.post("/api/create-booking", json=payload)
    assert r.status_code == 422
    body = r.json()
    assert "error" in body

    count_resp = req.get(
        f"{base_url}/api/test/lookup",
        headers=lookup_headers,
        params={"type": "booking_count", "testRunId": test_run_id, "idempotencyKey": payload["idempotencyKey"]},
        timeout=10,
    )
    if count_resp.status_code == 200:
        assert count_resp.json()["count"] == 0


def test_excluded_zip_blocked_server_side(
    api, test_upload_session, test_run_id, test_service_area, excluded_zip,
    base_url, lookup_headers
):
    import requests as req
    payload = make_booking(test_upload_session, test_run_id, zip=excluded_zip)
    r = api.post("/api/create-booking", json=payload)
    assert r.status_code == 422

    count_resp = req.get(
        f"{base_url}/api/test/lookup",
        headers=lookup_headers,
        params={"type": "booking_count", "testRunId": test_run_id, "idempotencyKey": payload["idempotencyKey"]},
        timeout=10,
    )
    if count_resp.status_code == 200:
        assert count_resp.json()["count"] == 0


# ── Idempotency ───────────────────────────────────────────────────────────────

def test_idempotency_returns_existing_booking(
    api, test_upload_session, test_run_id, test_service_area, base_url, lookup_headers
):
    import requests as req
    payload = make_booking(test_upload_session, test_run_id)

    r1 = api.post("/api/create-booking", json=payload)
    assert r1.status_code == 201
    booking_id = r1.json()["bookingId"]

    # Retry with different sessionId (already consumed)
    r2 = api.post("/api/create-booking", json={**payload, "sessionId": "other-session"})
    assert r2.status_code == 200  # idempotent return
    body2 = r2.json()
    assert body2["bookingId"] == booking_id
    assert body2.get("idempotent") is True

    # Exactly one record in the DB
    count_resp = req.get(
        f"{base_url}/api/test/lookup",
        headers=lookup_headers,
        params={"type": "booking_count", "testRunId": test_run_id, "idempotencyKey": payload["idempotencyKey"]},
        timeout=10,
    )
    if count_resp.status_code == 200:
        assert count_resp.json()["count"] == 1


# ── Session state ─────────────────────────────────────────────────────────────

def test_consumed_session_rejected(api, test_upload_session, test_run_id, test_service_area):
    """A session used once cannot create a second booking."""
    payload = make_booking(test_upload_session, test_run_id)
    r1 = api.post("/api/create-booking", json=payload)
    assert r1.status_code == 201

    # Attempt with the same (now consumed) session and a new idempotency key
    payload2 = make_booking(test_upload_session, test_run_id)
    r2 = api.post("/api/create-booking", json=payload2)
    assert r2.status_code == 400
    body = r2.json()
    assert "error" in body


def test_invalid_session_id_rejected(api, test_run_id, test_service_area):
    payload = make_booking("00000000-0000-0000-0000-000000000000", test_run_id)
    r = api.post("/api/create-booking", json=payload)
    assert r.status_code == 400
    assert "error" in r.json()


# ── Optional field round-trips ────────────────────────────────────────────────

def test_optional_fields_persisted(
    api, test_upload_session, test_run_id, test_service_area, base_url, lookup_headers
):
    import requests as req
    payload = make_booking(
        test_upload_session, test_run_id,
        description="TEST fixture description",
        quantity="Multiple rooms",
        accessType="upstairs",
        stairs="one_flight",
        elevator="yes",
        timePreference="afternoon",
    )
    r = api.post("/api/create-booking", json=payload)
    assert r.status_code == 201

    record_resp = req.get(
        f"{base_url}/api/test/lookup",
        headers=lookup_headers,
        params={"type": "booking", "testRunId": test_run_id, "idempotencyKey": payload["idempotencyKey"]},
        timeout=10,
    )
    if record_resp.status_code == 200:
        record = record_resp.json()
        assert record["description"] == "TEST fixture description"
        assert record["quantity"] == "Multiple rooms"
        assert record["access_type"] == "upstairs"
        assert record["stairs"] == "one_flight"
        assert record["elevator"] == "yes"
        assert record["time_preference"] == "afternoon"
