"""
Global pytest fixtures.

Session-scoped fixtures (admin_token, client_token, test_service_area) are
acquired once per run. Function-scoped fixtures (test_upload_session,
test_booking, etc.) are created fresh for each test and cleaned up after.

All test records include the session-scoped `test_run_id` so cleanup via
the /api/test/lookup DELETE endpoint is precise and never touches other runs.
"""
import os
import uuid

import pytest
import requests
from dotenv import load_dotenv

from tests.helpers.api import APIClient
from tests.helpers.auth import acquire_admin_token, acquire_client_token
from tests.helpers.supabase_client import get_service_client
from tests.fixtures.factories import make_booking

# Load .env.test if present (local development)
load_dotenv(dotenv_path=".env.test", override=False)


# ── Session-scoped ────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def test_run_id() -> str:
    """Unique ID for this pytest session. Injected into every created record."""
    return uuid.uuid4().hex[:12]


@pytest.fixture(scope="session")
def base_url() -> str:
    return os.environ.get("TEST_BASE_URL", "http://localhost:8888")


@pytest.fixture(scope="session")
def api(base_url) -> APIClient:
    return APIClient(base_url)


@pytest.fixture(scope="session")
def supabase():
    return get_service_client()


@pytest.fixture(scope="session")
def admin_token() -> str:
    return acquire_admin_token()


@pytest.fixture(scope="session")
def client_token() -> str:
    return acquire_client_token()


@pytest.fixture(scope="session")
def admin_headers(admin_token) -> dict:
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def client_headers(client_token) -> dict:
    return {"Authorization": f"Bearer {client_token}"}


@pytest.fixture(scope="session")
def lookup_secret() -> str:
    secret = os.environ.get("TEST_LOOKUP_SECRET", "")
    if not secret:
        pytest.skip("TEST_LOOKUP_SECRET not configured - test-lookup endpoint unavailable")
    return secret


@pytest.fixture(scope="session")
def lookup_headers(lookup_secret) -> dict:
    return {"X-Test-Secret": lookup_secret}


@pytest.fixture(scope="session")
def test_service_area(api, admin_headers, test_run_id):
    """
    Seeds a known service-area config for the test run and restores the
    original config on teardown.
    """
    # Capture current config
    original = api.get("/api/admin/service-area", headers=admin_headers).json()

    config = {
        "serviceableZips": [
            os.environ.get("TEST_IN_ZONE_ZIP", "30301"),
        ],
        "excludedZips": [
            os.environ.get("TEST_EXCLUDED_ZIP", "30399"),
        ],
        "unavailableZips": [
            os.environ.get("TEST_UNAVAILABLE_ZIP", "30350"),
        ],
        "radiusMiles": 30,
        "centerZip": os.environ.get("TEST_IN_ZONE_ZIP", "30301"),
    }
    api.put("/api/admin/service-area", json=config, headers=admin_headers)

    yield config

    # Restore original
    restore = {
        "serviceableZips": original.get("serviceableZips", []),
        "excludedZips": original.get("excludedZips", []),
        "unavailableZips": original.get("unavailableZips", []),
        "radiusMiles": original.get("radiusMiles", 30),
        "centerZip": original.get("centerZip", ""),
    }
    api.put("/api/admin/service-area", json=restore, headers=admin_headers)


# ── Function-scoped ───────────────────────────────────────────────────────────

@pytest.fixture
def test_upload_session(api) -> str:
    """Creates a fresh upload session and returns its sessionId."""
    resp = api.post("/api/create-upload-session", json={})
    assert resp.status_code == 200, f"Session creation failed: {resp.text}"
    return resp.json()["sessionId"]


@pytest.fixture
def test_booking(api, test_upload_session, test_run_id, test_service_area, lookup_headers, base_url):
    """
    Creates a complete booking via the API and yields its bookingId.
    Cleans up the booking record after the test via the test-lookup endpoint.
    """
    payload = make_booking(test_upload_session, test_run_id)
    resp = api.post("/api/create-booking", json=payload)
    assert resp.status_code == 201, f"Booking creation failed: {resp.text}"
    booking_id = resp.json()["bookingId"]
    idem_key = payload["idempotencyKey"]

    yield booking_id

    # Cleanup scoped to this test run
    requests.delete(
        f"{base_url}/api/test/lookup",
        headers=lookup_headers,
        params={"type": "test_run", "testRunId": test_run_id},
        timeout=10,
    )


# ── Env var accessors ─────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def in_zone_zip() -> str:
    return os.environ.get("TEST_IN_ZONE_ZIP", "30301")


@pytest.fixture(scope="session")
def out_of_zone_zip() -> str:
    return os.environ.get("TEST_OUT_OF_ZONE_ZIP", "10001")


@pytest.fixture(scope="session")
def excluded_zip() -> str:
    return os.environ.get("TEST_EXCLUDED_ZIP", "30399")


@pytest.fixture(scope="session")
def unavailable_zip() -> str:
    return os.environ.get("TEST_UNAVAILABLE_ZIP", "30350")
