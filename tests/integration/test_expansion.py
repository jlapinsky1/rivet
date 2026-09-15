"""
POST /api/notify-expansion - validation and persistence.

This is the expansion-lead workflow (separate from portal signup via /api/signup).
These are out-of-zone customers who want to be notified when service expands.
"""
import uuid

import pytest
import requests as req

pytestmark = pytest.mark.integration


@pytest.mark.smoke
def test_valid_lead_returns_200(api, test_run_id):
    email = f"test-exp-{test_run_id[:6]}@squatterz-test.com"
    r = api.post("/api/notify-expansion", json={
        "email": email,
        "name": "TEST Fixture",
        "zip": "10001",
        "testRunId": test_run_id,
    })
    assert r.status_code == 200
    assert r.json() == {"success": True}


@pytest.mark.smoke
def test_valid_lead_persisted(api, test_run_id, base_url, lookup_headers):
    email = f"test-persist-{test_run_id[:6]}-{uuid.uuid4().hex[:4]}@squatterz-test.com"
    api.post("/api/notify-expansion", json={
        "email": email,
        "name": "TEST Persist",
        "zip": "10001",
        "testRunId": test_run_id,
    })

    lookup = req.get(
        f"{base_url}/api/test/lookup",
        headers=lookup_headers,
        params={"type": "expansion_lead", "testRunId": test_run_id, "email": email},
        timeout=10,
    )
    assert lookup.status_code == 200
    record = lookup.json()
    assert record["email"] == email
    assert record["name"] == "TEST Persist"
    assert record["zip"] == "10001"


def test_missing_email_returns_400(api):
    r = api.post("/api/notify-expansion", json={"name": "TEST User"})
    assert r.status_code == 400
    assert r.json()["error"] == "email_required"


def test_empty_email_returns_400(api):
    r = api.post("/api/notify-expansion", json={"email": ""})
    assert r.status_code == 400
    assert r.json()["error"] == "email_required"


def test_invalid_email_format_returns_400(api):
    r = api.post("/api/notify-expansion", json={"email": "not-an-email"})
    assert r.status_code == 400
    assert r.json()["error"] == "invalid_email"


def test_invalid_email_missing_tld_returns_400(api):
    r = api.post("/api/notify-expansion", json={"email": "user@domain"})
    assert r.status_code == 400
    assert r.json()["error"] == "invalid_email"


def test_empty_body_returns_400(api):
    r = api.post("/api/notify-expansion", json={})
    assert r.status_code == 400
    assert r.json()["error"] == "email_required"


def test_null_email_returns_400(api):
    r = api.post("/api/notify-expansion", json={"email": None})
    assert r.status_code == 400
    assert r.json()["error"] == "email_required"


def test_optional_name_and_zip_accepted(api, test_run_id):
    """Name and zip are optional - should not cause rejection."""
    email = f"test-optional-{test_run_id[:6]}@squatterz-test.com"
    r = api.post("/api/notify-expansion", json={"email": email, "testRunId": test_run_id})
    assert r.status_code == 200


def test_method_not_allowed(api):
    r = api.get("/api/notify-expansion")
    assert r.status_code == 405
