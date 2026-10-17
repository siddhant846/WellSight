"""
Deterministic Operational Tools for FlytBase Asset Intelligence Copilot.
All business rules are strictly computed in code (NEVER by the LLM).
Every result returns structured data with explicit record IDs for citation.
"""

import re
import functools
from datetime import datetime, date
from decimal import Decimal
from typing import List, Dict, Any, Optional

from backend.db import query_as_dicts, add_correction as db_add_correction, add_shared_note as db_add_shared_note, get_shared_notes, get_connection
from backend.domain import (
    compute_producing_status,
    resolve_effective_threshold,
    calculate_downtime_for_inspections,
    evaluate_spill_compliance,
    load_rules
)
from backend.search_docs import search_docs

def to_json_safe(obj: Any) -> Any:
    """Recursively converts date, datetime, and Decimal objects for JSON serialization."""
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, dict):
        return {str(k): to_json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, set)):
        return [to_json_safe(item) for item in obj]
    return obj

def json_safe_tool(func):
    """Decorator ensuring any tool return value is strictly JSON serializable."""
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        res = func(*args, **kwargs)
        return to_json_safe(res)
    return wrapper

# Regex pattern to extract record IDs from any text or data
RECORD_ID_PATTERN = re.compile(r"\b(WELL-\d+|INS-\d+-\d+|MNT-\d+-\d+|REG-\d+-\d+|CTX-\d+-\d+|CORR-\d+|NOTE-\d+)\b")

def extract_citations(data: Any) -> List[str]:
    """Helper to automatically discover and extract record IDs for grounding."""
    found = set()
    text = str(data)
    for match in RECORD_ID_PATTERN.finditer(text):
        found.add(match.group(1))
    return sorted(list(found))

def _normalize_asset_id(asset_id: str) -> str:
    """Normalizes input well ID (e.g., '1', 'W-101', 'WELL-0001') to standard 'WELL-XXXX'."""
    val = asset_id.strip().upper()
    if val.startswith("WELL-"):
        return val
    # Handle numbers: e.g. 1 -> WELL-0001
    m = re.search(r"(\d+)", val)
    if m:
        num = int(m.group(1))
        return f"WELL-{num:04d}"
    return val

@json_safe_tool
def well_status(well_id: Optional[str] = None, area: Optional[str] = None) -> Dict[str, Any]:
    """
    Computes current producing status for wells based strictly on thermal differential:
    producing iff wellhead_temp - air_temp >= threshold.
    Stale recorded_status is ignored and flagged.
    Checks active context notes and open maintenance repairs to supply the operational reason.
    """
    norm_id = _normalize_asset_id(well_id) if well_id else None

    sql = """
        WITH latest_insp AS (
            SELECT 
                asset_id, 
                MAX(inspected_at) AS max_insp
            FROM v_inspections
            GROUP BY asset_id
        )
        SELECT 
            i.inspection_id,
            i.asset_id,
            w.name AS well_name,
            w.well_type,
            w.area,
            w.area_id,
            w.recorded_status,
            i.inspected_at,
            CAST(i.inspected_at AS DATE) AS inspection_date,
            i.method,
            i.inspector_user_id,
            i.inspector_name,
            i.ambient_temp_c,
            i.wellhead_temp_c,
            i.delta_temp_c,
            i.temp_threshold,
            i.is_producing,
            i.notes AS inspection_notes,
            i.is_corrected,
            i.correction_reason,
            i.corrected_by
        FROM v_inspections i
        JOIN latest_insp li ON i.asset_id = li.asset_id AND i.inspected_at = li.max_insp
        JOIN v_wells w ON i.asset_id = w.asset_id
        WHERE 1=1
    """
    params = []
    if norm_id:
        sql += " AND (UPPER(i.asset_id) = UPPER(?) OR UPPER(w.name) LIKE UPPER(?))"
        params.extend([norm_id, f"%{norm_id}%"])
    if area:
        sql += " AND (UPPER(w.area) LIKE UPPER(?) OR UPPER(w.area_id) = UPPER(?))"
        params.extend([f"%{area.strip()}%", area.strip()])

    sql += " ORDER BY i.asset_id ASC"
    rows = query_as_dicts(sql, params)

    # Fetch active context notes and open repairs for these wells
    asset_ids = [r["asset_id"] for r in rows]
    active_notes = {}
    active_repairs = {}

    if asset_ids:
        placeholders = ", ".join(["?"] * len(asset_ids))
        # Context notes
        note_rows = query_as_dicts(f"""
            SELECT note_id, asset_id, note_type, author_user_id, text, valid_from, valid_to
            FROM raw_context
            WHERE asset_id IN ({placeholders})
            ORDER BY created_at DESC
        """, asset_ids)
        for nr in note_rows:
            aid = nr["asset_id"]
            if aid not in active_notes:
                active_notes[aid] = []
            active_notes[aid].append(nr)

        # Open / recent repairs (completed_at >= '2026-10-15' or in progress)
        repair_rows = query_as_dicts(f"""
            SELECT maintenance_id, asset_id, maintenance_type, equipment_kind, issue, action_taken, started_at, completed_at
            FROM raw_repairs
            WHERE asset_id IN ({placeholders})
              AND (completed_at >= '2026-10-15' OR started_at >= '2026-10-01')
            ORDER BY started_at DESC
        """, asset_ids)
        for rr in repair_rows:
            aid = rr["asset_id"]
            if aid not in active_repairs:
                active_repairs[aid] = []
            active_repairs[aid].append(rr)

    wells_output = []
    citations = set()

    for r in rows:
        aid = r["asset_id"]
        is_prod = bool(r["is_producing"])
        stale_rec = r["recorded_status"]
        stale_flag = (stale_rec == "active" and not is_prod) or (stale_rec == "down" and is_prod)

        # Determine operational reason for not producing
        reasons = []
        cited_records = [r["inspection_id"], aid]

        # Check context notes
        well_notes = active_notes.get(aid, [])
        for wn in well_notes:
            cited_records.append(wn["note_id"])
            if wn.get("valid_from") and str(wn.get("valid_from")) <= "2026-10-16":
                if not wn.get("valid_to") or str(wn.get("valid_to")) >= "2026-10-15":
                    reasons.append(f"Note {wn['note_id']}: {wn['text']}")

        # Check repairs
        well_reps = active_repairs.get(aid, [])
        for wr in well_reps:
            cited_records.append(wr["maintenance_id"])
            reasons.append(f"Repair {wr['maintenance_id']}: {wr['issue']} (started {str(wr['started_at'])[:10]})")

        # Check inspector remark
        if r["inspection_notes"]:
            reasons.append(f"Inspector remark: \"{r['inspection_notes']}\"")

        reason_str = "; ".join(reasons) if reasons else ("No recorded reason" if not is_prod else "Producing normally")

        status_info = {
            "asset_id": aid,
            "well_id": aid,
            "well_name": r["well_name"],
            "well_type": r["well_type"],
            "area": r["area"],
            "area_id": r["area_id"],
            "latest_inspection_id": r["inspection_id"],
            "inspected_at": str(r["inspected_at"]),
            "inspection_date": str(r["inspection_date"]),
            "inspector_name": r["inspector_name"] or r["inspector_user_id"],
            "inspector_user_id": r["inspector_user_id"],
            "method": r["method"],
            "ambient_temp_c": round(float(r["ambient_temp_c"]), 1),
            "wellhead_temp_c": round(float(r["wellhead_temp_c"]), 1),
            "delta_temp_c": round(float(r["delta_temp_c"]), 1),
            "threshold_c": round(float(r["temp_threshold"]), 1),
            "is_producing": is_prod,
            "status_label": "PRODUCING" if is_prod else "NOT PRODUCING",
            "recorded_status": stale_rec,
            "is_recorded_status_stale": stale_flag,
            "operational_reason": reason_str,
            "citations": cited_records
        }
        wells_output.append(status_info)
        citations.update(cited_records)

    return {
        "well_count": len(wells_output),
        "producing_count": sum(1 for w in wells_output if w["is_producing"]),
        "not_producing_count": sum(1 for w in wells_output if not w["is_producing"]),
        "wells": wells_output,
        "rule_enforced": "Delta T (wellhead_temp - ambient_temp) >= threshold (15°C for T200, 20°C for T350). Recorded status can be stale.",
        "citations": sorted(list(citations))
    }

@json_safe_tool
def downtime(
    well_id: Optional[str] = None,
    area: Optional[str] = None,
    well_type: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
) -> Dict[str, Any]:
    """
    Calculates operational downtime strictly as 7 days per weekly inspection where the well is not producing.
    Missed inspections add 0 days.
    Repair duration does NOT subtract or alter operational downtime.
    """
    norm_id = _normalize_asset_id(well_id) if well_id else None

    sql = """
        SELECT 
            i.inspection_id,
            i.asset_id,
            w.name AS well_name,
            w.well_type,
            w.area,
            w.area_id,
            i.inspected_at,
            CAST(i.inspected_at AS DATE) AS inspection_date,
            i.ambient_temp_c,
            i.wellhead_temp_c,
            i.delta_temp_c,
            i.temp_threshold,
            i.is_producing
        FROM v_inspections i
        JOIN v_wells w ON i.asset_id = w.asset_id
        WHERE 1=1
    """
    params = []
    if norm_id:
        sql += " AND UPPER(i.asset_id) = UPPER(?)"
        params.append(norm_id)
    if area:
        sql += " AND (UPPER(w.area) LIKE UPPER(?) OR UPPER(w.area_id) = UPPER(?))"
        params.extend([f"%{area.strip()}%", area.strip()])
    if well_type:
        sql += " AND UPPER(w.well_type) = UPPER(?)"
        params.append(well_type.strip())
    if start_date:
        sql += " AND i.inspected_at >= ?"
        params.append(start_date)
    if end_date:
        # Include full end date
        end_val = f"{end_date} 23:59:59" if len(end_date) == 10 else end_date
        sql += " AND i.inspected_at <= ?"
        params.append(end_val)

    sql += " ORDER BY i.asset_id ASC, i.inspected_at ASC"
    rows = query_as_dicts(sql, params)

    # Group by well
    from collections import defaultdict
    by_well = defaultdict(list)
    for r in rows:
        by_well[r["asset_id"]].append(r)

    results_by_well = []
    total_downtime_days = 0
    all_cited_ids = set()

    for aid, insp_list in by_well.items():
        w_meta = insp_list[0]
        down_inspections = [insp for insp in insp_list if not bool(insp["is_producing"])]
        down_days = len(down_inspections) * 7
        total_downtime_days += down_days

        cited_ids = [aid] + [insp["inspection_id"] for insp in down_inspections]
        all_cited_ids.update(cited_ids)

        results_by_well.append({
            "asset_id": aid,
            "well_id": aid,
            "well_name": w_meta["well_name"],
            "well_type": w_meta["well_type"],
            "area": w_meta["area"],
            "inspection_count": len(insp_list),
            "non_producing_inspection_count": len(down_inspections),
            "operational_downtime_days": down_days,
            "non_producing_inspections": [
                {
                    "inspection_id": insp["inspection_id"],
                    "inspection_date": str(insp["inspection_date"]),
                    "wellhead_temp_c": round(float(insp["wellhead_temp_c"]), 1),
                    "ambient_temp_c": round(float(insp["ambient_temp_c"]), 1),
                    "delta_temp_c": round(float(insp["delta_temp_c"]), 1),
                    "threshold_c": round(float(insp["temp_threshold"]), 1)
                }
                for insp in down_inspections
            ],
            "citations": cited_ids
        })

    # Sort by downtime days descending
    results_by_well.sort(key=lambda x: x["operational_downtime_days"], reverse=True)

    return {
        "well_count": len(results_by_well),
        "total_fleet_downtime_days": total_downtime_days,
        "calculation_rules": [
            "Operational downtime = 7 days x count of inspections where (wellhead_temp - ambient_temp) < threshold.",
            "Missed inspections add 0 days.",
            "Repair duration does NOT alter or subtract from operational downtime."
        ],
        "wells": results_by_well[:30],  # Top 30 for safety
        "citations": sorted(list(all_cited_ids))
    }

@json_safe_tool
def spills(
    well_id: Optional[str] = None,
    area: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    min_volume_bbl: Optional[float] = None
) -> Dict[str, Any]:
    """
    Retrieves oil spills across inspections and regulator events.
    Excludes false positive detections (e.g. rainwater patches corrected in context notes).
    Evaluates statutory reporting deadlines (SR-01: >= 5.0 bbl must be reported within 24h).
    """
    norm_id = _normalize_asset_id(well_id) if well_id else None

    sql = """
        SELECT 
            i.inspection_id,
            i.asset_id,
            w.name AS well_name,
            w.area,
            w.area_id,
            w.lat,
            w.lon,
            i.inspected_at,
            CAST(i.inspected_at AS DATE) AS inspection_date,
            i.raw_spill_detected,
            i.effective_spill_detected,
            i.spill_area_pct,
            i.raw_volume_bbl,
            i.effective_volume_bbl,
            i.is_corrected,
            i.correction_reason,
            i.corrected_by,
            i.notes,
            reg.regulator_event_ids,
            reg.hours_to_report,
            reg.fine_usd,
            reg.regulator_status
        FROM v_inspections i
        JOIN v_wells w ON i.asset_id = w.asset_id
        LEFT JOIN (
            SELECT 
                related_inspection_id,
                STRING_AGG(event_id, ', ') AS regulator_event_ids,
                MIN(hours_to_report) AS hours_to_report,
                SUM(fine_usd) AS fine_usd,
                STRING_AGG(status, ', ') AS regulator_status
            FROM raw_regulator_events
            GROUP BY related_inspection_id
        ) reg ON i.inspection_id = reg.related_inspection_id
        WHERE i.effective_spill_detected = true
    """
    params = []
    if norm_id:
        sql += " AND UPPER(i.asset_id) = UPPER(?)"
        params.append(norm_id)
    if area:
        sql += " AND (UPPER(w.area) LIKE UPPER(?) OR UPPER(w.area_id) = UPPER(?))"
        params.extend([f"%{area.strip()}%", area.strip()])
    if start_date:
        sql += " AND i.inspected_at >= ?"
        params.append(start_date)
    if end_date:
        end_val = f"{end_date} 23:59:59" if len(end_date) == 10 else end_date
        sql += " AND i.inspected_at <= ?"
        params.append(end_val)
    if min_volume_bbl is not None:
        sql += " AND i.effective_volume_bbl >= ?"
        params.append(min_volume_bbl)

    sql += " ORDER BY i.inspected_at DESC"
    spill_rows = query_as_dicts(sql, params)

    total_volume = sum(float(r["effective_volume_bbl"]) for r in spill_rows)
    citations = set()
    events = []

    for r in spill_rows:
        vol = round(float(r["effective_volume_bbl"]), 2)
        is_reportable = vol >= 5.0
        cited = [r["asset_id"], r["inspection_id"]]
        if r.get("regulator_event_ids"):
            for reg_id in r["regulator_event_ids"].split(", "):
                cited.append(reg_id.strip())
        citations.update(cited)

        events.append({
            "asset_id": r["asset_id"],
            "well_id": r["asset_id"],
            "well_name": r["well_name"],
            "area": r["area"],
            "lat": r["lat"],
            "lon": r["lon"],
            "inspection_id": r["inspection_id"],
            "inspected_at": str(r["inspected_at"]),
            "inspection_date": str(r["inspection_date"]),
            "volume_bbl": vol,
            "raw_volume_bbl": r["raw_volume_bbl"],
            "is_corrected": r["is_corrected"],
            "correction_reason": r["correction_reason"],
            "is_reportable": is_reportable,
            "regulator_event_id": r.get("regulator_event_ids"),
            "hours_to_report": r.get("hours_to_report"),
            "fine_usd": r.get("fine_usd", 0.0),
            "citations": cited
        })

    return {
        "spill_count": len(events),
        "total_volume_bbl": round(total_volume, 2),
        "reportable_count": sum(1 for e in events if e["is_reportable"]),
        "events": events,
        "rules": [
            "Minor: < 1 bbl; Moderate: 1-5 bbl; Reportable: >= 5.0 bbl (SR-01 notice due in 24h).",
            "Corrected detections (e.g. rainwater/mud) are excluded from statistics."
        ],
        "citations": sorted(list(citations))
    }

@json_safe_tool
def repair_costs(
    well_id: Optional[str] = None,
    area: Optional[str] = None,
    repair_type: Optional[str] = None,
    equipment_kind: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
) -> Dict[str, Any]:
    """
    Aggregates and retrieves repair costs and maintenance jobs with citations.
    """
    norm_id = _normalize_asset_id(well_id) if well_id else None

    sql = """
        SELECT 
            r.maintenance_id,
            r.asset_id,
            w.name AS well_name,
            w.well_type,
            w.area,
            r.started_at,
            CAST(r.started_at AS DATE) AS start_date,
            r.completed_at,
            CAST(r.completed_at AS DATE) AS end_date,
            r.maintenance_type,
            r.equipment_kind,
            r.issue,
            r.action_taken,
            r.technician_user_id,
            r.technician_name,
            r.contractor,
            r.downtime_hours,
            r.cost_labor_usd,
            r.cost_parts_usd,
            r.cost_usd,
            r.triggered_by_inspection_id,
            r.report_file
        FROM v_repairs r
        JOIN v_wells w ON r.asset_id = w.asset_id
        WHERE 1=1
    """
    params = []
    if norm_id:
        sql += " AND UPPER(r.asset_id) = UPPER(?)"
        params.append(norm_id)
    if area:
        sql += " AND (UPPER(w.area) LIKE UPPER(?) OR UPPER(w.area_id) = UPPER(?))"
        params.extend([f"%{area.strip()}%", area.strip()])
    if repair_type:
        sql += " AND UPPER(r.maintenance_type) = UPPER(?)"
        params.append(repair_type.strip())
    if equipment_kind:
        sql += " AND UPPER(r.equipment_kind) = UPPER(?)"
        params.append(equipment_kind.strip())
    if start_date:
        sql += " AND r.started_at >= ?"
        params.append(start_date)
    if end_date:
        end_val = f"{end_date} 23:59:59" if len(end_date) == 10 else end_date
        sql += " AND r.started_at <= ?"
        params.append(end_val)

    sql += " ORDER BY r.started_at DESC"
    repairs = query_as_dicts(sql, params)

    total_cost = sum(float(r["cost_usd"] or 0) for r in repairs)
    labor_cost = sum(float(r["cost_labor_usd"] or 0) for r in repairs)
    parts_cost = sum(float(r["cost_parts_usd"] or 0) for r in repairs)

    citations = set()
    for r in repairs:
        citations.add(r["asset_id"])
        citations.add(r["maintenance_id"])
        if r.get("triggered_by_inspection_id"):
            citations.add(r["triggered_by_inspection_id"])

    return {
        "repair_count": len(repairs),
        "total_cost_usd": round(total_cost, 2),
        "labor_cost_usd": round(labor_cost, 2),
        "parts_cost_usd": round(parts_cost, 2),
        "repairs": repairs[:50],  # cap at 50
        "citations": sorted(list(citations))
    }

@json_safe_tool
def run_sql(query: str) -> Dict[str, Any]:
    """
    Executes a read-only SQL query against DuckDB after strict validation.
    Forbidden keywords: DROP, DELETE, INSERT, UPDATE, ALTER, TRUNCATE, CREATE, ATTACH, DETACH, COPY, PRAGMA.
    """
    clean_query = query.strip()
    forbidden_words = [
        "DROP", "DELETE", "INSERT", "UPDATE", "ALTER", "TRUNCATE",
        "CREATE", "ATTACH", "DETACH", "COPY", "PRAGMA", "EXPORT", "IMPORT"
    ]

    upper_q = clean_query.upper()

    # Must start with SELECT or WITH
    if not (upper_q.startswith("SELECT") or upper_q.startswith("WITH") or upper_q.startswith("DESCRIBE") or upper_q.startswith("EXPLAIN")):
        return {
            "error": "Security Validation Failed: Only read-only queries (SELECT, WITH) are permitted.",
            "success": False
        }

    for word in forbidden_words:
        if re.search(rf"\b{word}\b", upper_q):
            return {
                "error": f"Security Validation Failed: Keyword '{word}' is forbidden in read-only mode.",
                "success": False
            }

    try:
        con = get_connection(read_only=True)
        cursor = con.execute(clean_query)
        col_names = [desc[0] for desc in cursor.description]
        rows = cursor.fetchall()
        con.close()

        records = [dict(zip(col_names, r)) for r in rows]
        citations = extract_citations(records)

        return {
            "success": True,
            "columns": col_names,
            "rows": records[:100],  # cap at 100
            "row_count": len(records),
            "citations": citations
        }
    except Exception as e:
        return {
            "error": f"SQL Execution Error: {str(e)}",
            "success": False
        }

@json_safe_tool
def get_well_context(well_id: str) -> Dict[str, Any]:
    """
    Aggregates complete 360-degree operational context for a single well:
    - Master details and equipment
    - Latest computed producing status
    - Downtime analysis
    - Spills & environmental events
    - Maintenance history & costs
    - Human notes & operator comments
    - Active corrections
    """
    norm_id = _normalize_asset_id(well_id)

    well_info = query_as_dicts(
        "SELECT * FROM v_wells WHERE UPPER(asset_id) = UPPER(?)",
        [norm_id]
    )
    if not well_info:
        return {"error": f"Well '{well_id}' ({norm_id}) not found", "citations": []}

    well_record = well_info[0]

    status_data = well_status(well_id=norm_id)
    downtime_data = downtime(well_id=norm_id)
    spill_data = spills(well_id=norm_id)
    repairs_data = repair_costs(well_id=norm_id)
    notes_data = query_as_dicts("SELECT * FROM raw_context WHERE UPPER(asset_id) = UPPER(?) ORDER BY created_at DESC", [norm_id])

    # Scoped corrections applied to this well
    corrections_data = query_as_dicts(
        "SELECT * FROM corrections WHERE target = ? OR (scope = 'type' AND target = ?) OR scope = 'all'",
        [norm_id, well_record["well_type"]]
    )

    all_citations = set()
    all_citations.add(norm_id)
    all_citations.update(status_data.get("citations", []))
    all_citations.update(downtime_data.get("citations", []))
    all_citations.update(spill_data.get("citations", []))
    all_citations.update(repairs_data.get("citations", []))
    all_citations.update(extract_citations(notes_data))
    all_citations.update(extract_citations(corrections_data))

    return {
        "well": well_record,
        "status": status_data.get("wells", [{}])[0] if status_data.get("wells") else {},
        "downtime_summary": downtime_data.get("wells", [{}])[0] if downtime_data.get("wells") else {},
        "spills": spill_data.get("events", []),
        "repairs": repairs_data.get("repairs", []),
        "shared_notes": notes_data,
        "corrections": corrections_data,
        "citations": sorted(list(all_citations))
    }

@json_safe_tool
def add_correction_tool(
    scope: str,
    target: str,
    field: str,
    original_value: str,
    new_value: str,
    author: str,
    reason: str
) -> Dict[str, Any]:
    """Records an append-only correction overlay (scope in: 'inspection', 'well', 'type', 'all')."""
    try:
        norm_scope = scope.lower().strip()
        if norm_scope not in ("inspection", "well", "type", "all"):
            norm_scope = "well"

        result = db_add_correction(
            scope=norm_scope,
            target=target.strip(),
            field=field.strip(),
            original_value=original_value,
            new_value=new_value,
            author=author,
            reason=reason
        )
        return {
            "success": True,
            "correction": result,
            "citation": f"[{result['correction_id']}]"
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

@json_safe_tool
def add_note_tool(well_id: str, author: str, note_text: str) -> Dict[str, Any]:
    """Records an operational note for a well."""
    try:
        norm_id = _normalize_asset_id(well_id)
        result = db_add_shared_note(well_id=norm_id, author=author, note_text=note_text)
        return {
            "success": True,
            "note": result,
            "citation": f"[{result['note_id']}]"
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

@json_safe_tool
def render_visual(
    visual_type: str,
    title: str,
    data: Any,
    options: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Returns a declarative visual specification rendered inline by the frontend.
    Allowed visual_type: 'status_card', 'table', 'line', 'bar', 'map', 'heatmap'.
    """
    valid_types = ["status_card", "table", "line", "bar", "map", "heatmap"]
    v_type = visual_type.lower()
    if v_type not in valid_types:
        v_type = "table"

    return {
        "visual_type": v_type,
        "title": title,
        "data": data,
        "options": options or {}
    }

@json_safe_tool
def search_documentation(query: str, well_type: Optional[str] = None) -> Dict[str, Any]:
    """Executes hybrid BM25 + keyword search over SOPs, manuals, and repair logs."""
    results = search_docs(query=query, top_k=4, well_type=well_type)
    return {
        "query": query,
        "results": results,
        "citations": [r["citation"] for r in results]
    }
