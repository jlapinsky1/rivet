"""
Security regression tests.
Verify injection strings, oversized payloads, field tampering, and
absence of stack traces in all error responses.
"""
import pytest

from tests.fixtures.factories import make_booking

pytestmark = [pytest.mark.integration, pytest.mark.security]


# ── Injection strings ─────────────────────────────────────────────────────────

@pytest.mark.parametrize("field,value", [
    ("customerName", "'; DROP TABLE bookings; --"),
    ("customerName", "<script>alert(document.cookie)</script>"),
    ("customerName", "Robert'); DROP TABLE students;--"),
    ("description", "' OR '1'='1"),
    ("description", "\" OR \"1\"=\"1"),
    ("address", "1 Main St'; DELETE FROM bookings WHERE '1'='1"),
    ("city", "<img src=x onerror=alert(1)>"),
])
def test_injection_string_handled_safely(
    field, value, api, test_upload_session, test_run_id, test_service_area
):
    payload = make_booking(test_upload_session, test_run_id, **{field: value})
    r = api.post("/api/create-booking", json=payload)

    # Allowed outcomes: created (201), rejected (400/422), too large (413)
    assert r.status_code in (201, 400, 413, 422), \
        f"Unexpected status {r.status_code} for injection in {field!r}"

    text = r.text
    assert "Traceback" not in text
    assert "at Object." not in text  # Node.js stack frame
    assert "node_modules" not in text
    assert "SUPABASE" not in text
    assert "SERVICE_ROLE" not in text


@pytest.mark.parametrize("field,value", [
    ("email", "user@example.com'; DROP TABLE expansion_leads; --"),
    ("name", "<script>alert(1)</script>"),
    ("zip", "' OR 1=1; --"),
])
def test_expansion_injection_safe(field, value, api):
    payload = {"email": "valid@squatterz-test.com", field: value}
    r = api.post("/api/notify-expansion", json=payload)
    assert r.status_code in (200, 400)
    assert "Traceback" not in r.text
    assert "at Object." not in r.text


# ── Oversized payloads ────────────────────────────────────────────────────────

def test_oversized_customer_name_handled(api, test_upload_session, test_run_id, test_service_area):
    payload = make_booking(test_upload_session, test_run_id, customerName="A" * 10_000)
    r = api.post("/api/create-booking", json=payload)
    assert r.status_code in (201, 400, 413, 422)
    assert "Traceback" not in r.text


def test_oversized_description_handled(api, test_upload_session, test_run_id, test_service_area):
    payload = make_booking(test_upload_session, test_run_id, description="X" * 100_000)
    r = api.post("/api/create-booking", json=payload)
    assert r.status_code in (201, 400, 413, 422)


def test_oversized_json_body_handled(api):
    huge_body = {"zip": "30301", "extra": "Y" * 500_000}
    r = api.post("/api/check-service-area", json=huge_body)
    assert r.status_code in (200, 400, 413, 422, 431)


# ── Field tampering ───────────────────────────────────────────────────────────

def test_cannot_set_booking_status_to_completed(
    api, test_upload_session, test_run_id, test_service_area, base_url, lookup_headers
):
    import requests as req
    payload = make_booking(test_upload_session, test_run_id, status="completed")
    r = api.post("/api/create-booking", json=payload)

    if r.status_code == 201:
        record_resp = req.get(
            f"{base_url}/api/test/lookup",
            headers=lookup_headers,
            params={"type": "booking", "testRunId": test_run_id,
                    "idempotencyKey": payload["idempotencyKey"]},
            timeout=10,
        )
        if record_resp.status_code == 200:
            assert record_resp.json()["status"] == "pending_review", \
                "Server must ignore client-supplied status field"


def test_extra_json_fields_do_not_break_endpoint(api, test_upload_session, test_run_id, test_service_area):
    payload = make_booking(test_upload_session, test_run_id,
                           admin_override=True,
                           is_admin=True,
                           role="admin",
                           payment_status="paid")
    r = api.post("/api/create-booking", json=payload)
    # Should either succeed normally or fail on a known validation rule - not 500
    assert r.status_code in (201, 400, 422)


def test_cannot_set_approved_price_in_booking(api, test_upload_session, test_run_id, test_service_area):
    payload = make_booking(test_upload_session, test_run_id,
                           approved_price=0,
                           approvedPrice=0)
    r = api.post("/api/create-booking", json=payload)
    assert r.status_code in (201, 400)  # not 500


# ── No stack traces in any error response ─────────────────────────────────────

@pytest.mark.parametrize("endpoint,body", [
    ("/api/create-booking", {"broken": True}),
    ("/api/check-service-area", {"wrong_field": "value"}),
    ("/api/notify-expansion", {"broken": True}),
    ("/api/get-upload-url", {"broken": True}),
    ("/api/approve-quote", {"broken": True}),
    ("/api/complete-job", {"broken": True}),
])
def test_no_stack_trace_in_error_response(api, endpoint, body):
    r = api.post(endpoint, json=body)
    text = r.text
    assert "Traceback" not in text, f"Python traceback in {endpoint} response"
    assert "at Object." not in text, f"Node stack frame in {endpoint} response"
    assert "node_modules" not in text, f"node_modules path in {endpoint} response"
    assert "SUPABASE_URL" not in text, f"Env var leaked in {endpoint} response"
    assert "SERVICE_ROLE_KEY" not in text, f"Secret leaked in {endpoint} response"


# ── Malformed auth headers ────────────────────────────────────────────────────

@pytest.mark.parametrize("header_value", [
    "Bearer ' OR '1'='1",
    "Bearer <script>alert(1)</script>",
    "Bearer " + "A" * 10_000,
    "Bearer\x00null",
])
def test_malformed_auth_header_safe(api, header_value):
    r = api.get("/api/admin/service-area", headers={"Authorization": header_value})
    assert r.status_code == 401
    assert "Traceback" not in r.text
