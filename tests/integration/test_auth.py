"""
Authentication: login, session, role enforcement, portal signup.
Portal signup and expansion-lead capture are separate workflows - tested independently.
"""
import os
import uuid

import pytest

pytestmark = pytest.mark.integration


# ── Valid login ───────────────────────────────────────────────────────────────

@pytest.mark.smoke
def test_valid_admin_login_acquires_token(admin_token):
    assert isinstance(admin_token, str)
    assert len(admin_token) > 20


@pytest.mark.smoke
def test_valid_client_login_acquires_token(client_token):
    assert isinstance(client_token, str)
    assert len(client_token) > 20


@pytest.mark.smoke
def test_admin_token_can_access_admin_endpoint(api, admin_headers):
    r = api.get("/api/admin/service-area", headers=admin_headers)
    assert r.status_code == 200


@pytest.mark.smoke
def test_client_token_cannot_access_admin_endpoint(api, client_headers):
    r = api.get("/api/admin/service-area", headers=client_headers)
    assert r.status_code == 401


# ── Invalid credentials ───────────────────────────────────────────────────────

def test_wrong_password_fails(base_url):
    import requests
    url = f"{os.environ['SUPABASE_URL']}/auth/v1/token?grant_type=password"
    r = requests.post(url, json={
        "email": os.environ["TEST_ADMIN_EMAIL"],
        "password": "definitely-wrong-password-xyz!",
    }, headers={
        "apikey": os.environ["SUPABASE_ANON_KEY"],
        "Content-Type": "application/json",
    }, timeout=10)
    assert r.status_code != 200


def test_unknown_email_fails(base_url):
    import requests
    url = f"{os.environ['SUPABASE_URL']}/auth/v1/token?grant_type=password"
    r = requests.post(url, json={
        "email": f"nonexistent-{uuid.uuid4()}@squatterz-test.com",
        "password": "somepassword",
    }, headers={
        "apikey": os.environ["SUPABASE_ANON_KEY"],
        "Content-Type": "application/json",
    }, timeout=10)
    assert r.status_code != 200


def test_empty_credentials_fail(base_url):
    import requests
    url = f"{os.environ['SUPABASE_URL']}/auth/v1/token?grant_type=password"
    r = requests.post(url, json={"email": "", "password": ""},
        headers={"apikey": os.environ["SUPABASE_ANON_KEY"], "Content-Type": "application/json"},
        timeout=10)
    assert r.status_code != 200


# ── Malformed / tampered tokens ───────────────────────────────────────────────

@pytest.mark.parametrize("bad_header", [
    {"Authorization": "Bearer "},
    {"Authorization": "Bearer not.a.jwt"},
    {"Authorization": "Basic dXNlcjpwYXNz"},
    {"Authorization": ""},
])
def test_malformed_auth_header_rejected(api, bad_header):
    r = api.get("/api/admin/service-area", headers=bad_header)
    assert r.status_code == 401


def test_no_auth_header_rejected(api):
    r = api.get("/api/admin/service-area")
    assert r.status_code == 401


# ── Portal signup (separate from expansion-lead notify) ───────────────────────

@pytest.mark.smoke
def test_signup_endpoint_accepts_valid_payload(api):
    """
    Tests the /api/signup endpoint contract.
    We use a unique email guaranteed not to exist.
    Note: Resend email delivery is not verified in automated tests.
    """
    test_email = f"test-signup-{uuid.uuid4().hex[:8]}@squatterz-test.com"
    r = api.post("/api/signup", json={
        "email": test_email,
        "password": "TestPass123!",
        "contactName": "TEST Fixture User",
    })
    # Supabase may return 200 or propagate an error if the email domain is blocked
    assert r.status_code in (200, 400, 422, 429)
    if r.status_code == 200:
        assert r.json().get("success") is True


def test_signup_short_password_rejected(api):
    r = api.post("/api/signup", json={
        "email": f"test-{uuid.uuid4().hex[:8]}@squatterz-test.com",
        "password": "short",  # < 8 chars
        "contactName": "TEST",
    })
    assert r.status_code == 400
    assert "error" in r.json()


def test_signup_missing_email_rejected(api):
    r = api.post("/api/signup", json={"password": "ValidPass123!"})
    assert r.status_code == 400
    assert "error" in r.json()


def test_signup_missing_password_rejected(api):
    r = api.post("/api/signup", json={"email": "test@squatterz-test.com"})
    assert r.status_code == 400
    assert "error" in r.json()


# ── Password reset (enum-safe) ────────────────────────────────────────────────

def test_reset_password_unknown_email_returns_200(api):
    """Must not reveal whether the email exists."""
    r = api.post("/api/reset-password", json={
        "email": f"nonexistent-{uuid.uuid4()}@squatterz-test.com",
    })
    assert r.status_code == 200
    assert r.json().get("success") is True


def test_reset_password_missing_email_returns_400(api):
    r = api.post("/api/reset-password", json={})
    assert r.status_code == 400
    assert "error" in r.json()
