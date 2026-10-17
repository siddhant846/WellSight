"""
Pytest Suite for Deterministic Operational Tools and Hybrid Search on FlytBase Dataset.
"""

import pytest
from backend.tools import (
    well_status,
    downtime,
    spills,
    repair_costs,
    run_sql,
    get_well_context,
    search_documentation
)

def test_well_status_ignores_stale_status():
    # WELL-0001 recorded_status in metadata is 'active', but Delta T (3.2 °C < 15 °C) confirms NOT PRODUCING!
    res = well_status(well_id="WELL-0001")
    assert res["well_count"] == 1
    w = res["wells"][0]
    assert w["asset_id"] == "WELL-0001"
    assert w["is_producing"] is False
    assert w["status_label"] == "NOT PRODUCING"
    assert w["recorded_status"] == "active"
    assert w["is_recorded_status_stale"] is True
    assert len(w["citations"]) >= 2
    assert "WELL-0001" in res["citations"]

def test_spills_tool_reflects_corrections():
    # WELL-0001 has 6 verified spills (7 raw detections minus INS-0001-0070 rainwater correction)
    res = spills(well_id="WELL-0001")
    assert res["spill_count"] == 6
    assert abs(res["total_volume_bbl"] - 15.1) < 0.2
    # Ensure INS-0001-0070 is not in events
    event_ids = [e["inspection_id"] for e in res["events"]]
    assert "INS-0001-0070" not in event_ids
    assert "INS-0001-0185" in event_ids

def test_repair_costs_tool():
    res = repair_costs(well_id="WELL-0001")
    assert res["repair_count"] >= 10
    assert res["total_cost_usd"] > 10000.0
    assert "WELL-0001" in res["citations"]

def test_run_sql_security_enforcement():
    # Attempting DROP TABLE should fail validation
    res = run_sql("DROP TABLE raw_wells")
    assert res["success"] is False
    assert "Security Validation Failed" in res["error"]

    # Attempting DELETE should fail
    res_del = run_sql("DELETE FROM raw_wells WHERE 1=1")
    assert res_del["success"] is False

    # Valid SELECT query should succeed
    res_valid = run_sql("SELECT asset_id, name, well_type FROM raw_wells LIMIT 3")
    assert res_valid["success"] is True
    assert res_valid["row_count"] == 3
    assert len(res_valid["citations"]) > 0

def test_get_well_context():
    ctx = get_well_context("WELL-0001")
    assert ctx["well"]["asset_id"] == "WELL-0001"
    assert "status" in ctx
    assert "downtime_summary" in ctx
    assert "shared_notes" in ctx
    assert len(ctx["citations"]) >= 2

def test_search_documentation_hybrid():
    # Search for T200 production temperature threshold rule
    res = search_documentation("T200 production temperature rule ambient")
    assert len(res["results"]) > 0
    top = res["results"][0]
    assert "T200" in top["doc_id"] or "15" in top["content"]
    assert len(res["citations"]) > 0

    # Search for spill reporting 24 hour rule
    spill_res = search_documentation("spill reportable written notice 24 hours SR-01")
    assert len(spill_res["results"]) > 0
    assert any("SOP-SR" in r["doc_id"] or "SR-01" in r["content"] for r in spill_res["results"])
