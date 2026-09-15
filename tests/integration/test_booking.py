"""
Residential booking submission - comprehensive validation and server enforcement.
Smoke tests marked with @pytest.mark.smoke for fast CI gate.
"""
import uuid

import pytest

from tests.fixtures.factories import make_booking

pytestmark = pytest.mark.integration


@pytest.mark.smoke
def test_booking_creates_201(api, test_upload_session, test_run_id, test_service_area):
    payload = make_booking(test_upload_session, test_run_id)
    r = api.post("/api/create-booking", json=payload)
    assert r.status_code == 201
    assert "bookingId" in r.json()


def test_booking_response_has_booking_id(api, test_upload_session, test_run_id, test_service_area):
    payload = make_booking(test_upload_session, test_run_id)
    r = api.post("/api/create-booking", json=payload)
    body = r.json()
    assert isinstance(body["bookingId"], str)
    assert len(body["bookingId"]) == 36  # UUID format


@pytest.mark.smoke
def test_server_blocks_out_of_zone_zip(api, test_upload_session, test_run_id, test_service_area, out_of_zone_zip):
    """Bypass the frontend - POST directly with an out-of-zone ZIP."""
    payload = make_booking(test_upload_session, test_run_id, zip=out_of_zone_zip,
                            fullAddress=f"123 Test St, New York, NY {out_of_zone_zip}")
    r = api.post("/api/create-booking", json=payload)
    assert r.status_code == 422


def test_invalid_zip_format_rejected_by_server(api, test_upload_session, test_run_id, test_service_area):
    payload = make_booking(test_upload_session, test_run_id, zip="ABCDE")
    r = api.post("/api/create-booking", json=payload)
    assert r.status_code in (400, 422)


def test_excluded_zip_rejected_by_server(api, test_upload_session, test_run_id, test_service_area, excluded_zip):
    payload = make_booking(test_upload_session, test_run_id, zip=excluded_zip)
    r = api.post("/api/create-booking", json=payload)
    assert r.status_code == 422


def test_unavailable_zip_rejected_by_server(api, test_upload_session, test_run_id, test_service_area, unavailable_zip):
    payload = make_booking(test_upload_session, test_run_id, zip=unavailable_zip)
    r = api.post("/api/create-booking", json=payload)
    assert r.status_code == 422


@pytest.mark.smoke
def test_idempotency_key_deduplicates(api, test_upload_session, test_run_id, test_service_area):
    payload = make_booking(test_upload_session, test_run_id)
    r1 = api.post("/api/create-booking", json=payload)
    assert r1.status_code == 201
    booking_id = r1.json()["bookingId"]

    r2 = api.post("/api/create-booking", json={**payload, "sessionId": "other-session"})
    assert r2.json()["bookingId"] == booking_id
    assert r2.json().get("idempotent") is True


def test_expired_session_returns_400(api, test_run_id, test_service_area, supabase):
    """Pre-expire a session, then attempt to create a booking."""
    # Create session then manually expire it
    session_r = api.post("/api/create-upload-session", json={})
    session_id = session_r.json()["sessionId"]
    supabase.update("upload_sessions", {"expires_at": "2020-01-01T00:00:00Z"}, {"id": f"eq.{session_id}"})

    payload = make_booking(session_id, test_run_id)
    r = api.post("/api/create-booking", json=payload)
    assert r.status_code == 400
    body = r.json()
    assert "error" in body
    assert "expire" in body["error"].lower()


def test_method_not_allowed(api):
    r = api.get("/api/create-booking")
    assert r.status_code == 405


def test_no_stack_trace_on_bad_payload(api):
    r = api.post("/api/create-booking", json={})
    assert r.status_code == 400
    assert "Traceback" not in r.text
    assert "at Object." not in r.text
