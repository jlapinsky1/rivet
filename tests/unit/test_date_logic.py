"""
Date-logic regression tests.

Exercises the real getAvailableBookingDates implementation via a Node subprocess.
referenceDate is passed explicitly so results are deterministic - no time-mocking.
"""
import json
import subprocess
from datetime import date, timedelta
from pathlib import Path

import pytest

ADAPTER = str(Path(__file__).parent.parent / "node-adapter" / "date-logic.js")


def call_date_logic(
    reference_date: str,
    days_ahead: int = 21,
    unavailable: list[str] | None = None,
    business_days: list[int] | None = None,
) -> list[str]:
    args = {"referenceDate": reference_date, "daysAhead": days_ahead}
    if unavailable is not None:
        args["unavailableDates"] = unavailable
    if business_days is not None:
        args["businessDays"] = business_days

    result = subprocess.run(
        ["node", ADAPTER, json.dumps(args)],
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert result.returncode == 0, f"Node adapter failed: {result.stderr}"
    return json.loads(result.stdout.strip())


# ── Basic window behaviour ────────────────────────────────────────────────────

def test_tomorrow_is_earliest_date():
    dates = call_date_logic("2025-01-01")
    assert len(dates) > 0
    assert dates[0] >= "2025-01-02"


def test_no_dates_on_or_before_reference():
    dates = call_date_logic("2025-06-15")
    for d in dates:
        assert d > "2025-06-15", f"Date {d} is not after reference"


def test_window_is_at_most_21_calendar_days():
    ref = date(2025, 3, 1)
    dates = call_date_logic(ref.strftime("%Y-%m-%d"))
    cutoff = ref + timedelta(days=21)
    for d in dates:
        assert date.fromisoformat(d) <= cutoff, f"{d} is outside the 21-day window"


def test_sundays_excluded():
    dates = call_date_logic("2025-01-01")
    for d in dates:
        parsed = date.fromisoformat(d)
        assert parsed.weekday() != 6, f"{d} is a Sunday (weekday=6)"


def test_returns_list_of_yyyy_mm_dd_strings():
    dates = call_date_logic("2025-01-01")
    for d in dates:
        parsed = date.fromisoformat(d)  # raises ValueError if format wrong
        assert isinstance(parsed, date)


# ── Month and year boundaries ─────────────────────────────────────────────────

def test_month_boundary():
    dates = call_date_logic("2025-01-28")
    feb_dates = [d for d in dates if d.startswith("2025-02")]
    assert len(feb_dates) > 0, "Expected dates crossing into February"


def test_year_boundary():
    dates = call_date_logic("2025-12-29")
    jan_dates = [d for d in dates if d.startswith("2026-01")]
    assert len(jan_dates) > 0, "Expected dates crossing into 2026"


def test_leap_year_feb_29_included():
    # 2024 is a leap year; reference 2024-02-27 should include 2024-02-29
    dates = call_date_logic("2024-02-27")
    assert "2024-02-29" in dates, "2024-02-29 should appear in leap year window"


def test_non_leap_year_no_feb_29():
    # 2025 is not a leap year
    dates = call_date_logic("2025-02-27")
    assert "2025-02-29" not in dates


# ── DST transitions (US Eastern) ──────────────────────────────────────────────

def test_dst_spring_forward_no_skipped_dates():
    """Spring forward 2025: 2025-03-09 at 2am. No day should be skipped."""
    dates = call_date_logic("2025-03-07")
    date_set = set(dates)
    # 2025-03-08 is Saturday (included); 2025-03-09 is Sunday (excluded by default)
    assert "2025-03-08" in date_set
    assert "2025-03-10" in date_set  # Monday after spring forward


def test_dst_fall_back_no_duplicate_dates():
    """Fall back 2025: 2025-11-02 at 2am. No date should appear twice."""
    dates = call_date_logic("2025-10-31")
    assert len(dates) == len(set(dates)), "Duplicate dates found around DST fall-back"


# ── Unavailable dates ─────────────────────────────────────────────────────────

def test_unavailable_dates_removed():
    dates_without = call_date_logic("2025-02-01")
    target = dates_without[2]  # pick a date that would normally appear
    dates_with = call_date_logic("2025-02-01", unavailable=[target])
    assert target not in dates_with


def test_unavailable_all_business_days_returns_empty_window():
    ref = date(2025, 2, 1)
    # Block every date in the 21-day window
    window = [
        (ref + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(1, 22)
    ]
    dates = call_date_logic(ref.strftime("%Y-%m-%d"), unavailable=window)
    assert dates == []


# ── Backup date ordering ──────────────────────────────────────────────────────

def test_dates_returned_in_ascending_order():
    dates = call_date_logic("2025-04-01")
    assert dates == sorted(dates), "Dates are not in ascending order"


def test_backup_dates_after_primary():
    dates = call_date_logic("2025-04-01")
    if len(dates) >= 2:
        primary = dates[0]
        for backup in dates[1:]:
            assert backup > primary, f"Backup {backup} is not after primary {primary}"


# ── Business-days customisation ───────────────────────────────────────────────

def test_only_monday_returned_when_business_days_is_1():
    dates = call_date_logic("2025-01-01", business_days=[1])  # Monday only
    for d in dates:
        parsed = date.fromisoformat(d)
        assert parsed.weekday() == 0, f"{d} is not a Monday"


def test_sundays_included_when_explicitly_added():
    dates = call_date_logic("2025-01-01", business_days=[0, 1, 2, 3, 4, 5, 6])
    sundays = [d for d in dates if date.fromisoformat(d).weekday() == 6]
    assert len(sundays) > 0, "Expected Sundays when businessDays includes 0"


# ── Late primary date ─────────────────────────────────────────────────────────

def test_late_primary_leaves_no_backup():
    # Make the 21-day window have only 1 available day (the last day)
    ref = date(2025, 4, 4)  # Friday
    # Block all days except the last Saturday in the window (Apr 26)
    all_days = call_date_logic(ref.strftime("%Y-%m-%d"))
    if len(all_days) <= 1:
        pytest.skip("Window has 0 or 1 days - nothing to test")
    # Block all but the final date
    block = all_days[:-1]
    remaining = call_date_logic(ref.strftime("%Y-%m-%d"), unavailable=block)
    assert len(remaining) <= 1, f"Expected at most 1 remaining date, got {remaining}"
