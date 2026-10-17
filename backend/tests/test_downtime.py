"""
Pytest Suite for Downtime Accounting Domain Logic (SOP-OPS-DOWNTIME-202).
Tests:
- 1 non-producing inspection = 7 days
- 2 consecutive non-producing inspections = 14 days
- Missed inspection week = 0 days added
- Repair downtime does NOT count toward operational downtime
- Resetting streaks on producing inspections
"""

import pytest
from backend.domain import calculate_downtime_for_inspections

def test_single_non_producing_inspection_accrues_7_days():
    inspections = [
        {"inspection_id": "INSP-1", "inspection_date": "2024-01-08", "is_producing": False}
    ]
    repairs = []
    res = calculate_downtime_for_inspections(inspections, repairs)
    assert res["gross_downtime_days"] == 7
    assert res["net_operational_downtime_days"] == 7
    assert res["non_producing_inspections_count"] == 1
    assert "INSP-1" in res["cited_inspection_ids"]

def test_consecutive_non_producing_inspections_compound():
    # 2 consecutive weeks of non-producing = 14 days
    inspections = [
        {"inspection_id": "INSP-1", "inspection_date": "2024-01-01", "is_producing": False},
        {"inspection_id": "INSP-2", "inspection_date": "2024-01-08", "is_producing": False},
        {"inspection_id": "INSP-3", "inspection_date": "2024-01-15", "is_producing": False}
    ]
    repairs = []
    res = calculate_downtime_for_inspections(inspections, repairs)
    # 3 consecutive non-producing inspections = 21 days
    assert res["gross_downtime_days"] == 21
    assert res["net_operational_downtime_days"] == 21
    assert res["records_evaluated"][0]["consecutive_streak"] == 1
    assert res["records_evaluated"][1]["consecutive_streak"] == 2
    assert res["records_evaluated"][2]["consecutive_streak"] == 3

def test_missed_inspections_add_zero_days():
    # Week 1: non-producing (Jan 1) -> 7 days
    # Week 2 (Jan 8): MISSED (gap between Jan 1 and Jan 22 is 21 days, skipping Jan 8 and Jan 15)
    # Week 3 (Jan 22): non-producing -> 7 days
    inspections = [
        {"inspection_id": "INSP-1", "inspection_date": "2024-01-01", "is_producing": False},
        # Missing Jan 8 and Jan 15 inspections!
        {"inspection_id": "INSP-2", "inspection_date": "2024-01-22", "is_producing": False}
    ]
    repairs = []
    res = calculate_downtime_for_inspections(inspections, repairs)
    # Only the two actual inspections add 7 days each = 14 days. Missed inspections add 0!
    assert res["gross_downtime_days"] == 14
    assert res["net_operational_downtime_days"] == 14
    assert len(res["missed_inspections"]) >= 1
    assert res["missed_inspections"][0]["downtime_added"] == 0

def test_producing_inspection_resets_streak():
    inspections = [
        {"inspection_id": "INSP-1", "inspection_date": "2024-01-01", "is_producing": False},
        {"inspection_id": "INSP-2", "inspection_date": "2024-01-08", "is_producing": True},  # producing
        {"inspection_id": "INSP-3", "inspection_date": "2024-01-15", "is_producing": False}
    ]
    repairs = []
    res = calculate_downtime_for_inspections(inspections, repairs)
    assert res["gross_downtime_days"] == 14
    assert res["net_operational_downtime_days"] == 14
    assert res["records_evaluated"][1]["consecutive_streak"] == 0
    assert res["records_evaluated"][2]["consecutive_streak"] == 1

def test_repairs_do_not_change_downtime():
    # Non-producing inspection on Feb 15
    # Active repair from Feb 12 to Feb 26 (REP-201)
    inspections = [
        {"inspection_id": "INSP-10", "inspection_date": "2024-02-15", "is_producing": False}
    ]
    repairs = [
        {
            "repair_id": "REP-201",
            "repair_type": "ESP Motor Overhaul",
            "start_date": "2024-02-12",
            "end_date": "2024-02-26",
            "cost_usd": 74500.0
        }
    ]
    res = calculate_downtime_for_inspections(inspections, repairs)
    # Domain Rule: Downtime is strictly 7 days x non-producing inspections.
    # Repairs do NOT subtract from or alter downtime; repairs only supply cost, cause, and narrative.
    assert res["gross_downtime_days"] == 7
    assert res["repair_days_deducted"] == 0
    assert res["net_operational_downtime_days"] == 7
    assert res["non_producing_inspections_count"] == 1
    assert "REP-201" in res["cited_repair_ids"]

