"""
Pytest Suite for Correction Scoping Logic (Hierarchy: 'well' > 'type' > 'all' > baseline)
and Spill Volume Overrides.
"""

import pytest
from backend.domain import resolve_effective_threshold, evaluate_spill_compliance
from backend.db import query_as_dicts, add_correction

def test_scope_precedence_baseline():
    # Baseline with no corrections
    corrections = []
    res = resolve_effective_threshold(
        base_threshold=10.0,
        well_id="W-101",
        well_type="Beam Pump",
        corrections=corrections
    )
    assert res["threshold"] == 10.0
    assert res["scope"] == "baseline"

def test_scope_precedence_all():
    corrections = [
        {"field": "temp_threshold", "scope": "all", "target": "*", "new_value": "9.0", "author": "David Kim", "timestamp": "2024-01-01"}
    ]
    res = resolve_effective_threshold(
        base_threshold=10.0,
        well_id="W-101",
        well_type="Beam Pump",
        corrections=corrections
    )
    assert res["threshold"] == 9.0
    assert res["scope"] == "all"
    assert res["corrected_by"] == "David Kim"

def test_scope_precedence_type_overrides_all():
    corrections = [
        {"field": "temp_threshold", "scope": "all", "target": "*", "new_value": "9.0", "author": "David Kim", "timestamp": "2024-01-01"},
        {"field": "temp_threshold", "scope": "type", "target": "Beam Pump", "new_value": "11.5", "author": "Sarah Chen", "timestamp": "2024-01-02"}
    ]
    # For Beam Pump, 'type' scope should override 'all'
    res_bp = resolve_effective_threshold(
        base_threshold=10.0,
        well_id="W-101",
        well_type="Beam Pump",
        corrections=corrections
    )
    assert res_bp["threshold"] == 11.5
    assert res_bp["scope"] == "type"
    assert res_bp["corrected_by"] == "Sarah Chen"

    # For ESP, 'all' scope still applies because type is ESP
    res_esp = resolve_effective_threshold(
        base_threshold=15.0,
        well_id="W-102",
        well_type="Electric Submersible Pump (ESP)",
        corrections=corrections
    )
    assert res_esp["threshold"] == 9.0
    assert res_esp["scope"] == "all"

def test_scope_precedence_well_overrides_type_and_all():
    corrections = [
        {"field": "temp_threshold", "scope": "all", "target": "*", "new_value": "9.0", "author": "David Kim", "timestamp": "2024-01-01"},
        {"field": "temp_threshold", "scope": "type", "target": "Beam Pump", "new_value": "11.5", "author": "Sarah Chen", "timestamp": "2024-01-02"},
        {"field": "temp_threshold", "scope": "well", "target": "W-101", "new_value": "13.2", "author": "Mike Rodriguez", "timestamp": "2024-01-03"}
    ]
    # W-101 has well-level override
    res_w101 = resolve_effective_threshold(
        base_threshold=10.0,
        well_id="W-101",
        well_type="Beam Pump",
        corrections=corrections
    )
    assert res_w101["threshold"] == 13.2
    assert res_w101["scope"] == "well"
    assert res_w101["corrected_by"] == "Mike Rodriguez"

    # W-104 (another Beam Pump without well-level override) gets type-level
    res_w104 = resolve_effective_threshold(
        base_threshold=10.0,
        well_id="W-104",
        well_type="Beam Pump",
        corrections=corrections
    )
    assert res_w104["threshold"] == 11.5
    assert res_w104["scope"] == "type"

def test_spill_correction_reclassifies_to_puddle_and_vacates_fine():
    # Initial spill: 12.0 bbl reported 44h post-incident (> 24h) -> would be fined!
    corrections = [
        {
            "field": "initial_volume_bbl",
            "scope": "well",
            "target": "EVT-SPILL-03",
            "original_value": "12.0",
            "new_value": "2.2",
            "author": "Elena Rostova",
            "reason": "Surveyor soil assessment proved 2.2 bbl puddle within secondary containment",
            "timestamp": "2024-02-23 11:30:00"
        }
    ]

    res = evaluate_spill_compliance(
        event_id="EVT-SPILL-03",
        well_id="W-104",
        event_timestamp="2024-02-20 14:00:00",
        reported_at="2024-02-22 10:00:00",
        initial_volume_bbl=12.0,
        corrections=corrections
    )

    # Effective volume should now be 2.2 bbl
    assert res["effective_volume_bbl"] == 2.2
    assert res["is_corrected"] is True
    assert res["original_volume_bbl"] == 12.0
    assert res["corrected_by"] == "Elena Rostova"
    # Because < 5 bbl, fine is $0 and status is exempt
    assert res["compliance_status"] == "Exempt / Under 5 bbl Threshold"
    assert res["fine_amount_usd"] == 0.0
    assert res["is_compliant"] is True

def test_database_views_reflect_corrections():
    # Verify DuckDB view v_inspections applies correction for INS-0001-0070 (CTX-0001-001 rainwater)
    inspections = query_as_dicts("SELECT * FROM v_inspections WHERE inspection_id = 'INS-0001-0070'")
    assert len(inspections) == 1
    insp = inspections[0]
    assert insp["raw_spill_detected"] is True
    assert insp["effective_spill_detected"] is False
    assert insp["is_corrected"] is True
    assert insp["effective_volume_bbl"] == 0.0
    assert "rainwater" in insp["correction_reason"].lower()
