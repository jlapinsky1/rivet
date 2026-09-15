"""
POST /api/check-service-area - full parameter matrix.
All tests require the `test_service_area` fixture so the ZIP config is known.
"""
import pytest


pytestmark = pytest.mark.integration


@pytest.mark.smoke
def test_in_zone_zip_returns_serviceable(api, test_service_area, in_zone_zip):
    r = api.post("/api/check-service-area", json={"zip": in_zone_zip})
    assert r.status_code == 200
    body = r.json()
    assert body["serviceable"] is True
    assert body["reason"] == "serviceable"


def test_out_of_zone_zip_returns_outside(api, test_service_area, out_of_zone_zip):
    r = api.post("/api/check-service-area", json={"zip": out_of_zone_zip})
    assert r.status_code == 200
    body = r.json()
    assert body["serviceable"] is False
    assert body["reason"] == "outside"


def test_excluded_zip_returns_excluded(api, test_service_area, excluded_zip):
    r = api.post("/api/check-service-area", json={"zip": excluded_zip})
    assert r.status_code == 200
    body = r.json()
    assert body["serviceable"] is False
    assert body["reason"] == "excluded"


def test_unavailable_zip_returns_unavailable(api, test_service_area, unavailable_zip):
    r = api.post("/api/check-service-area", json={"zip": unavailable_zip})
    assert r.status_code == 200
    body = r.json()
    assert body["serviceable"] is False
    assert body["reason"] == "unavailable"


def test_excluded_takes_priority_over_serviceable(api, admin_headers, in_zone_zip):
    """A ZIP in both serviceableZips and excludedZips must be rejected."""
    collision_zip = in_zone_zip
    config = {
        "serviceableZips": [collision_zip],
        "excludedZips": [collision_zip],
        "unavailableZips": [],
    }
    api.put("/api/admin/service-area", json=config, headers=admin_headers)

    r = api.post("/api/check-service-area", json={"zip": collision_zip})
    assert r.status_code == 200
    body = r.json()
    assert body["serviceable"] is False
    assert body["reason"] == "excluded"


def test_unconfigured_fails_open(api, admin_headers):
    """Empty ZIP lists → unconfigured → booking is allowed (fail-open for unconfigured)."""
    api.put("/api/admin/service-area", json={
        "serviceableZips": [], "excludedZips": [], "unavailableZips": [],
    }, headers=admin_headers)

    r = api.post("/api/check-service-area", json={"zip": "30301"})
    assert r.status_code == 200
    body = r.json()
    assert body["serviceable"] is True
    assert body["reason"] == "unconfigured"


@pytest.mark.parametrize("bad_zip", [
    "",
    "1234",
    "123456",
    "abcde",
    "1234!",
    " 3030",
    "3030 ",
])
def test_invalid_zip_format_returns_invalid_zip(api, bad_zip):
    r = api.post("/api/check-service-area", json={"zip": bad_zip})
    assert r.status_code == 200
    body = r.json()
    assert body["serviceable"] is False
    assert body["reason"] == "invalid_zip"


def test_null_zip_returns_invalid(api):
    r = api.post("/api/check-service-area", json={"zip": None})
    assert r.status_code == 200
    body = r.json()
    assert body["serviceable"] is False
    assert body["reason"] == "invalid_zip"


def test_missing_zip_field(api):
    r = api.post("/api/check-service-area", json={})
    assert r.status_code in (200, 400)
    if r.status_code == 200:
        assert r.json()["reason"] == "invalid_zip"
        assert r.json()["serviceable"] is False


def test_malformed_json_returns_error(api):
    r = api.session.post(
        f"{api.base_url}/api/check-service-area",
        data="not json at all",
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code in (400, 422, 500)
    body = r.json()
    assert "error" in body or "serviceable" in body


def test_response_never_contains_stack_trace(api):
    r = api.post("/api/check-service-area", json={"zip": ""})
    text = r.text
    assert "Traceback" not in text
    assert "at Object." not in text
    assert "node_modules" not in text
