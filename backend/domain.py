"""
Domain Rules Engine for Asset Intelligence Copilot.
Pure Python domain logic (NEVER calculated by LLM):
1. Producing logic: wellhead_temp - air_temp >= threshold (threshold from backend/rules.yaml + scoped corrections).
   Stale recorded status is strictly ignored.
2. Downtime logic:
   - Downtime is strictly: days_per_non_producing_inspection (7) x count of inspections where the well is not producing.
   - Consecutive non-producing inspections compound linearly (7, 14, 21, etc.).
   - Missed inspections add 0 days.
   - Repair duration does NOT alter or subtract from downtime; repairs only supply cost, cause, and narrative.
3. Spill compliance:
   - Loaded from rules.yaml: spill threshold (5.0 bbl), 24h reporting window, fine amounts.
   - Later corrections override original volume.
4. Correction scoping:
   - Hierarchy: 'well' > 'type' > 'all' > baseline
"""

import os
import yaml
from datetime import datetime, date, timedelta
from typing import List, Dict, Any, Optional

RULES_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "rules.yaml")

def load_rules() -> Dict[str, Any]:
    """Loads operational and regulatory rules from backend/rules.yaml."""
    if os.path.exists(RULES_PATH):
        with open(RULES_PATH, "r", encoding="utf-8") as f:
            return yaml.safe_load(f)
    # Default fallback if rules.yaml is temporarily missing
    return {
        "well_type_thresholds": {
            "T200": 15.0,
            "T350": 20.0,
            "Beam Pump": 15.0,
            "Electric Submersible Pump (ESP)": 20.0,
            "Gas Lift": 15.0
        },
        "regulatory_rules": {
            "spill_threshold_bbl": 5.0,
            "reporting_window_hours": 24.0,
            "late_reporting_fine_usd": 5000.0,
            "unreported_fine_usd": 5000.0
        },
        "downtime_rules": {
            "days_per_non_producing_inspection": 7,
            "missed_inspection_downtime_days": 0,
            "repair_deduction_enabled": False
        }
    }

def _to_date(d: Any) -> Optional[date]:
    if d is None:
        return None
    if isinstance(d, datetime):
        return d.date()
    if isinstance(d, date):
        return d
    try:
        return datetime.strptime(str(d)[:10], "%Y-%m-%d").date()
    except Exception:
        return None

def compute_producing_status(wellhead_temp: float, air_temp: float, threshold: float, temp_offset: float = 0.0) -> Dict[str, Any]:
    """
    Evaluates whether a well is producing based strictly on thermal differential.
    Calibrated Wellhead Temp = wellhead_temp + temp_offset
    Delta T = Calibrated Wellhead Temp - air_temp
    Producing iff Delta T >= threshold
    """
    calibrated_wellhead = round(wellhead_temp + temp_offset, 2)
    delta_t = round(calibrated_wellhead - air_temp, 2)
    is_producing = delta_t >= threshold
    return {
        "calibrated_wellhead_temp_c": calibrated_wellhead,
        "air_temp_c": air_temp,
        "delta_temp_c": delta_t,
        "threshold_c": threshold,
        "is_producing": is_producing,
        "status_str": "PRODUCING" if is_producing else "NOT PRODUCING"
    }

def resolve_effective_threshold(
    base_threshold: Optional[float],
    well_id: str,
    well_type: str,
    corrections: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Applies corrections with scope precedence:
    'well' > 'type' > 'all' > baseline from rules.yaml
    """
    rules = load_rules()
    if base_threshold is None:
        base_threshold = float(rules.get("well_type_thresholds", {}).get(well_type, 10.0))

    sorted_corr = sorted(
        corrections,
        key=lambda x: str(x.get("timestamp", "")),
        reverse=True
    )

    # 1. Check well scope
    for c in sorted_corr:
        if c.get("field") == "temp_threshold" and c.get("scope") == "well" and c.get("target") == well_id:
            return {
                "threshold": float(c["new_value"]),
                "scope": "well",
                "corrected_by": c.get("author"),
                "reason": c.get("reason"),
                "timestamp": str(c.get("timestamp"))
            }

    # 2. Check type scope
    for c in sorted_corr:
        if c.get("field") == "temp_threshold" and c.get("scope") == "type" and c.get("target") == well_type:
            return {
                "threshold": float(c["new_value"]),
                "scope": "type",
                "corrected_by": c.get("author"),
                "reason": c.get("reason"),
                "timestamp": str(c.get("timestamp"))
            }

    # 3. Check all scope
    for c in sorted_corr:
        if c.get("field") == "temp_threshold" and (c.get("scope") == "all" or c.get("target") in ("*", "all")):
            return {
                "threshold": float(c["new_value"]),
                "scope": "all",
                "corrected_by": c.get("author"),
                "reason": c.get("reason"),
                "timestamp": str(c.get("timestamp"))
            }

    return {
        "threshold": float(base_threshold),
        "scope": "baseline",
        "corrected_by": None,
        "reason": None,
        "timestamp": None
    }

def calculate_downtime_for_inspections(
    inspections: List[Dict[str, Any]],
    repairs: Optional[List[Dict[str, Any]]] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
) -> Dict[str, Any]:
    """
    Calculates operational downtime according to domain rules:
    - Downtime is strictly: days_per_non_producing_inspection (7) x count of inspections where well is not producing.
    - Consecutive non-producing inspections add up (1st = 7 days, 2 consecutive = 14 days, 3 = 21 days).
    - Missed inspections add 0 days.
    - Repair duration does NOT alter or subtract from downtime; repairs only supply cost, cause, and narrative.
    """
    rules = load_rules()
    dt_rules = rules.get("downtime_rules", {})
    days_per_insp = int(dt_rules.get("days_per_non_producing_inspection", 7))

    start_dt = _to_date(start_date)
    end_dt = _to_date(end_date)

    # Sort inspections chronologically
    sorted_insps = sorted(
        inspections,
        key=lambda x: str(x.get("inspection_date", ""))
    )

    records_evaluated = []
    consecutive_non_prod_count = 0
    non_producing_count = 0
    missed_gaps_detected = []
    cited_inspection_ids = []

    last_date = None

    for insp in sorted_insps:
        cur_date = _to_date(insp["inspection_date"])
        if not cur_date:
            continue

        if start_dt and cur_date < start_dt:
            continue
        if end_dt and cur_date > end_dt:
            continue

        cited_inspection_ids.append(insp["inspection_id"])
        insp_date_str = cur_date.strftime("%Y-%m-%d")

        # Check for missed weekly inspections (gap > 10 days between inspections)
        if last_date:
            gap_days = (cur_date - last_date).days
            if gap_days > 10:
                missed_weeks = (gap_days // 7) - 1
                if missed_weeks > 0:
                    missed_gaps_detected.append({
                        "between": f"{last_date} and {cur_date}",
                        "missed_weeks_count": missed_weeks,
                        "downtime_added": 0,
                        "rule": "Missed inspection adds 0 days"
                    })
                    consecutive_non_prod_count = 0

        last_date = cur_date
        is_producing = insp["is_producing"]

        if is_producing:
            consecutive_non_prod_count = 0
            records_evaluated.append({
                "inspection_id": insp["inspection_id"],
                "date": insp_date_str,
                "is_producing": True,
                "consecutive_streak": 0,
                "downtime_accrued_days": 0
            })
        else:
            consecutive_non_prod_count += 1
            non_producing_count += 1
            records_evaluated.append({
                "inspection_id": insp["inspection_id"],
                "date": insp_date_str,
                "is_producing": False,
                "consecutive_streak": consecutive_non_prod_count,
                "downtime_accrued_days": days_per_insp
            })

    # Total downtime is strictly: 7 days x non-producing inspections
    total_downtime_days = non_producing_count * days_per_insp

    # Process repair records for narrative/cost context only (repairs NEVER reduce or alter downtime)
    cited_repair_ids = []
    repair_summary = []
    if repairs:
        for r in repairs:
            cited_repair_ids.append(r["repair_id"])
            repair_summary.append({
                "repair_id": r["repair_id"],
                "repair_type": r.get("repair_type", "Workover"),
                "cost_usd": float(r.get("cost_usd", 0.0)),
                "start_date": str(r.get("start_date", ""))[:10],
                "end_date": str(r.get("end_date", ""))[:10]
            })

    return {
        "gross_downtime_days": total_downtime_days,
        "repair_days_deducted": 0,  # Strict domain rule: repairs do NOT subtract from downtime
        "net_operational_downtime_days": total_downtime_days,
        "non_producing_inspections_count": non_producing_count,
        "records_evaluated": records_evaluated,
        "missed_inspections": missed_gaps_detected,
        "repair_context": repair_summary,
        "cited_inspection_ids": cited_inspection_ids,
        "cited_repair_ids": cited_repair_ids
    }

def evaluate_spill_compliance(
    event_id: str,
    well_id: str,
    event_timestamp: str,
    reported_at: Optional[str],
    initial_volume_bbl: float,
    corrections: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Evaluates spill compliance according to rules.yaml:
    - Spill >= spill_threshold_bbl (5.0) must be reported within reporting_window_hours (24.0h) or fined.
    - Later corrections override original volume.
    """
    rules = load_rules()
    reg_rules = rules.get("regulatory_rules", {})
    spill_threshold = float(reg_rules.get("spill_threshold_bbl", 5.0))
    window_hours = float(reg_rules.get("reporting_window_hours", 24.0))
    late_fine = float(reg_rules.get("late_reporting_fine_usd", 15000.0))
    unreported_fine = float(reg_rules.get("unreported_fine_usd", 25000.0))

    # Check for volume corrections
    effective_vol = initial_volume_bbl
    is_corrected = False
    corr_by = None
    corr_reason = None
    corr_time = None

    sorted_corr = sorted(
        corrections,
        key=lambda x: str(x.get("timestamp", "")),
        reverse=True
    )

    for c in sorted_corr:
        if c.get("field") == "initial_volume_bbl" and c.get("target") in (event_id, well_id):
            effective_vol = float(c["new_value"])
            is_corrected = True
            corr_by = c.get("author")
            corr_reason = c.get("reason")
            corr_time = str(c.get("timestamp"))
            break

    # Calculate hours to report
    event_dt = datetime.strptime(str(event_timestamp)[:19], "%Y-%m-%d %H:%M:%S")
    hours_to_report = None
    if reported_at and str(reported_at).strip():
        rep_dt = datetime.strptime(str(reported_at)[:19], "%Y-%m-%d %H:%M:%S")
        hours_to_report = round((rep_dt - event_dt).total_seconds() / 3600.0, 1)

    # Statutory rules from rules.yaml:
    thresh_label = int(spill_threshold) if spill_threshold.is_integer() else spill_threshold
    window_label = int(window_hours) if window_hours.is_integer() else window_hours

    if effective_vol < spill_threshold:
        compliance_status = f"Exempt / Under {thresh_label} bbl Threshold"
        is_compliant = True
        fine_amount = 0.0
        reason_explanation = f"Effective volume {effective_vol} bbl is strictly below {spill_threshold} bbl statutory threshold."
    elif hours_to_report is None:
        compliance_status = "Overdue / Unreported"
        is_compliant = False
        fine_amount = unreported_fine
        reason_explanation = f"Spill of {effective_vol} bbl has not been reported to regulator."
    elif hours_to_report <= window_hours:
        compliance_status = f"Compliant (<={window_label}h)"
        is_compliant = True
        fine_amount = 0.0
        reason_explanation = f"Spill of {effective_vol} bbl reported within {hours_to_report}h (<={window_label}h statutory window)."
    else:
        compliance_status = f"Fined - Late Notification (>{window_label}h)"
        is_compliant = False
        fine_amount = late_fine
        reason_explanation = f"Spill of {effective_vol} bbl was reported after {hours_to_report}h (>{window_label}h limit). Penalty applies."

    return {
        "event_id": event_id,
        "well_id": well_id,
        "event_timestamp": event_timestamp,
        "initial_volume_bbl": initial_volume_bbl,
        "effective_volume_bbl": effective_vol,
        "reported_at": reported_at,
        "hours_to_report": hours_to_report,
        "compliance_status": compliance_status,
        "is_compliant": is_compliant,
        "fine_amount_usd": fine_amount,
        "reason_explanation": reason_explanation,
        "is_corrected": is_corrected,
        "original_volume_bbl": initial_volume_bbl if is_corrected else None,
        "corrected_by": corr_by,
        "correction_reason": corr_reason,
        "correction_timestamp": corr_time
    }
