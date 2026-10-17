"""
DuckDB Ingestion Engine for FlytBase Asset Intelligence Copilot.
Loads real dataset:
- fleet/areas.json -> raw_areas, raw_teams
- fleet/users.json -> raw_users
- assets/*/metadata.json -> raw_wells
- assets/*/inspections.jsonl -> raw_inspections
- assets/*/maintenance.jsonl -> raw_repairs (and raw_maintenance)
- assets/*/regulatory-events.jsonl -> raw_regulator_events
- assets/*/context.jsonl -> raw_context (and raw_shared_notes)
- assets/*/maintenance-reports/*.md -> raw_maintenance_reports
- fleet/well-types/*.md & fleet/sops/*.md -> raw_documents

Supports dynamic data directory via `python -m backend.ingest --data <dir>`.
Sets up overlay tables (corrections, shared_notes, user_memory) and analytical views.
"""

import os
import sys
import glob
import json
import yaml
import time
import argparse
import duckdb
from typing import Optional, Dict, Any, List

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(BASE_DIR, "backend")
DEFAULT_DATA_DIR = os.path.join(BASE_DIR, "data")
RULES_FILE = os.path.join(BACKEND_DIR, "rules.yaml")
DB_PATH = os.path.join(BACKEND_DIR, "warehouse.duckdb")

def load_rules():
    if os.path.exists(RULES_FILE):
        with open(RULES_FILE, "r", encoding="utf-8") as f:
            return yaml.safe_load(f)
    return {}

def get_connection(db_path=DB_PATH):
    return duckdb.connect(db_path)

def create_views(con):
    """
    Creates analytical views that enforce domain business rules and apply scoped corrections
    (inspection > well > type > all > baseline).
    """
    rules_cfg = load_rules()
    type_thresholds = rules_cfg.get("well_type_thresholds", {"T200": 15.0, "T350": 20.0})

    # Build threshold CASE statement
    threshold_cases = []
    for w_type, thresh in type_thresholds.items():
        threshold_cases.append(f"WHEN w.well_type = '{w_type}' THEN {thresh}")
    threshold_sql_case = " ".join(threshold_cases)
    if not threshold_sql_case:
        threshold_sql_case = "WHEN w.well_type = 'T200' THEN 15.0 WHEN w.well_type = 'T350' THEN 20.0"

    views_sql = f"""
    -- View: v_wells with resolved base threshold
    CREATE OR REPLACE VIEW v_wells AS
    SELECT 
        w.asset_id,
        w.asset_id AS well_id,
        w.name,
        w.name AS well_name,
        w.well_type,
        w.area_id,
        COALESCE(a.name, w.area_id) AS area,
        COALESCE(a.name, w.area_id) AS area_name,
        w.team_id,
        w.in_charge_user_id,
        u.name AS in_charge_name,
        w.lat,
        w.lon,
        w.installed_on,
        w.recorded_status,
        CASE {threshold_sql_case} ELSE 15.0 END AS base_temp_threshold
    FROM raw_wells w
    LEFT JOIN raw_areas a ON w.area_id = a.area_id
    LEFT JOIN raw_users u ON w.in_charge_user_id = u.user_id;

    -- View: v_inspections with resolved physical producing status and corrections overlay
    CREATE OR REPLACE VIEW v_inspections AS
    WITH corr_insp AS (
        -- Corrections at inspection level
        SELECT target AS inspection_id, field, new_value, author, reason
        FROM corrections
        WHERE scope = 'inspection'
    ),
    ctx_corr AS (
        -- Context notes of type 'correction'
        SELECT 
            inspection_id,
            note_id,
            text,
            author_user_id,
            true as is_false_positive
        FROM raw_context
        WHERE note_type = 'correction' AND inspection_id IS NOT NULL
    )
    SELECT 
        i.inspection_id,
        i.asset_id,
        i.asset_id AS well_id,
        w.name AS well_name,
        w.well_type,
        w.area,
        w.area_id,
        i.inspected_at,
        i.inspector_user_id,
        u.name AS inspector_name,
        i.method,
        i.ambient_temp_c,
        i.ambient_temp_c AS air_temp_c,
        -- Effective wellhead temp with correction override if present
        COALESCE(
            TRY_CAST(c_temp.new_value AS DOUBLE),
            i.wellhead_temp_c
        ) AS wellhead_temp_c,
        -- Effective delta T
        ROUND(
            COALESCE(TRY_CAST(c_temp.new_value AS DOUBLE), i.wellhead_temp_c) - i.ambient_temp_c,
            2
        ) AS delta_temp_c,
        w.base_temp_threshold AS temp_threshold,
        -- Physical producing calculation (strictly computed)
        (
            (COALESCE(TRY_CAST(c_temp.new_value AS DOUBLE), i.wellhead_temp_c) - i.ambient_temp_c) >= w.base_temp_threshold
        ) AS is_producing,
        -- Effective spill detection factoring in corrections
        CASE 
            WHEN c_spill.is_false_positive THEN false
            WHEN c_vol.new_value IS NOT NULL AND TRY_CAST(c_vol.new_value AS DOUBLE) > 0 THEN true
            WHEN c_vol.new_value IS NOT NULL AND TRY_CAST(c_vol.new_value AS DOUBLE) <= 0 THEN false
            ELSE i.spill_detected
        END AS effective_spill_detected,
        i.spill_detected AS raw_spill_detected,
        i.spill_area_pct,
        -- Effective spill volume
        CASE 
            WHEN c_spill.is_false_positive THEN 0.0
            WHEN c_vol.new_value IS NOT NULL THEN TRY_CAST(c_vol.new_value AS DOUBLE)
            ELSE COALESCE(i.spill_est_volume_bbl, 0.0)
        END AS effective_volume_bbl,
        i.spill_est_volume_bbl AS raw_volume_bbl,
        (c_temp.new_value IS NOT NULL OR c_vol.new_value IS NOT NULL OR c_spill.is_false_positive) AS is_corrected,
        COALESCE(c_temp.reason, c_vol.reason, c_spill.text) AS correction_reason,
        COALESCE(c_temp.author, c_vol.author, c_spill.author_user_id) AS corrected_by,
        i.notes
    FROM raw_inspections i
    JOIN v_wells w ON i.asset_id = w.asset_id
    LEFT JOIN raw_users u ON i.inspector_user_id = u.user_id
    LEFT JOIN corr_insp c_temp ON i.inspection_id = c_temp.inspection_id AND c_temp.field = 'wellhead_temp_c'
    LEFT JOIN corr_insp c_vol ON i.inspection_id = c_vol.inspection_id AND c_vol.field = 'spill_est_volume_bbl'
    LEFT JOIN ctx_corr c_spill ON i.inspection_id = c_spill.inspection_id;

    -- View: v_regulator_events
    CREATE OR REPLACE VIEW v_regulator_events AS
    SELECT 
        e.event_id,
        e.asset_id,
        e.asset_id AS well_id,
        w.name AS well_name,
        w.area,
        w.area_id,
        e.date,
        e.event_timestamp,
        e.agency,
        e.event_type,
        e.protocol_id,
        e.related_inspection_id,
        e.hours_to_report,
        e.detail,
        e.detail AS description,
        e.fine_usd AS calculated_fine_usd,
        e.status
    FROM raw_regulator_events e
    JOIN v_wells w ON e.asset_id = w.asset_id;

    -- View: v_repairs
    CREATE OR REPLACE VIEW v_repairs AS
    SELECT 
        r.maintenance_id,
        r.maintenance_id AS repair_id,
        r.asset_id,
        r.asset_id AS well_id,
        w.name AS well_name,
        w.well_type,
        w.area,
        w.area_id,
        r.started_at,
        CAST(r.started_at AS DATE) AS start_date,
        r.completed_at,
        CAST(r.completed_at AS DATE) AS end_date,
        r.maintenance_type,
        r.maintenance_type AS repair_type,
        r.equipment_kind,
        r.issue,
        r.action_taken,
        r.technician_user_id,
        u.name AS technician_name,
        r.contractor,
        r.downtime_hours,
        r.cost_labor_usd,
        r.cost_parts_usd,
        r.cost_usd,
        r.triggered_by_inspection_id,
        r.report_file,
        rep.content_text AS report_markdown
    FROM raw_repairs r
    JOIN v_wells w ON r.asset_id = w.asset_id
    LEFT JOIN raw_users u ON r.technician_user_id = u.user_id
    LEFT JOIN raw_maintenance_reports rep ON r.maintenance_id = rep.maintenance_id;
    """
    con.execute(views_sql)

def ingest_data(data_dir: str = DEFAULT_DATA_DIR, db_path: str = DB_PATH, verbose: bool = True):
    t_start = time.perf_counter()

    if not os.path.isabs(data_dir):
        data_dir = os.path.abspath(data_dir)

    con = get_connection(db_path)

    if verbose:
        print(f"Connecting to DuckDB at {db_path}...")
        print(f"Ingesting FlytBase dataset from: {data_dir}")

    total_rows = 0

    # 1. Ingest Areas & Teams (fleet/areas.json)
    areas_path = os.path.join(data_dir, "fleet", "areas.json")
    if os.path.exists(areas_path):
        with open(areas_path, "r", encoding="utf-8") as f:
            areas_json = json.load(f)

        con.execute("DROP TABLE IF EXISTS raw_areas; CREATE TABLE raw_areas (area_id VARCHAR PRIMARY KEY, name VARCHAR, team_id VARCHAR, lat DOUBLE, lon DOUBLE);")
        con.execute("DROP TABLE IF EXISTS raw_teams; CREATE TABLE raw_teams (team_id VARCHAR PRIMARY KEY, name VARCHAR, lead_user_id VARCHAR);")

        for a in areas_json.get("areas", []):
            con.execute("INSERT INTO raw_areas VALUES (?, ?, ?, ?, ?)", (
                a["area_id"], a["name"], a.get("team_id"), a.get("center", {}).get("lat"), a.get("center", {}).get("lon")
            ))
        for t in areas_json.get("teams", []):
            con.execute("INSERT INTO raw_teams VALUES (?, ?, ?)", (
                t["team_id"], t["name"], t.get("lead_user_id")
            ))
        if verbose:
            print(f"  [+] Ingested {len(areas_json.get('areas', []))} areas and {len(areas_json.get('teams', []))} teams")

    # 2. Ingest Users (fleet/users.json)
    users_path = os.path.join(data_dir, "fleet", "users.json")
    if os.path.exists(users_path):
        with open(users_path, "r", encoding="utf-8") as f:
            users_json = json.load(f)
        con.execute("DROP TABLE IF EXISTS raw_users; CREATE TABLE raw_users (user_id VARCHAR PRIMARY KEY, name VARCHAR, role VARCHAR, team_id VARCHAR);")
        for u in users_json.get("users", []):
            con.execute("INSERT INTO raw_users VALUES (?, ?, ?, ?)", (
                u["user_id"], u["name"], u["role"], u.get("team_id")
            ))
        if verbose:
            print(f"  [+] Ingested {len(users_json.get('users', []))} users")

    # 3. Ingest Wells (assets/*/metadata.json)
    norm_meta_glob = os.path.join(data_dir, "assets", "*", "metadata.json").replace("\\", "/")
    con.execute(f"""
        DROP TABLE IF EXISTS raw_wells;
        CREATE TABLE raw_wells AS
        SELECT 
            asset_id,
            asset_id AS well_id,
            name,
            name AS well_name,
            asset_category,
            well_type,
            area_id,
            team_id,
            in_charge_user_id,
            location.lat AS lat,
            location.lon AS lon,
            CAST(installed_on AS DATE) AS installed_on,
            recorded_status
        FROM read_json_auto('{norm_meta_glob}');
    """)
    w_count = con.execute("SELECT COUNT(*) FROM raw_wells").fetchone()[0]
    total_rows += w_count
    if verbose:
        print(f"  [+] Ingested {w_count:,} wells from metadata.json")

    # 4. Ingest Inspections (assets/*/inspections.jsonl)
    norm_insp_glob = os.path.join(data_dir, "assets", "*", "inspections.jsonl").replace("\\", "/")
    con.execute(f"""
        DROP TABLE IF EXISTS raw_inspections;
        CREATE TABLE raw_inspections AS
        SELECT 
            inspection_id,
            asset_id,
            asset_id AS well_id,
            CAST(inspected_at AS TIMESTAMP) AS inspected_at,
            inspector_user_id,
            method,
            ambient_temp_c,
            ambient_temp_c AS air_temp_c,
            wellhead_temp_c,
            spill_detected,
            spill_area_pct,
            spill_est_volume_bbl,
            notes
        FROM read_json_auto('{norm_insp_glob}');
    """)
    insp_count = con.execute("SELECT COUNT(*) FROM raw_inspections").fetchone()[0]
    total_rows += insp_count
    if verbose:
        print(f"  [+] Ingested {insp_count:,} inspections from inspections.jsonl")

    # 5. Ingest Maintenance / Repairs (assets/*/maintenance.jsonl)
    norm_maint_glob = os.path.join(data_dir, "assets", "*", "maintenance.jsonl").replace("\\", "/")
    con.execute(f"""
        DROP TABLE IF EXISTS raw_repairs;
        CREATE TABLE raw_repairs AS
        SELECT 
            maintenance_id,
            maintenance_id AS repair_id,
            asset_id,
            asset_id AS well_id,
            CAST(started_at AS TIMESTAMP) AS started_at,
            CAST(completed_at AS TIMESTAMP) AS completed_at,
            maintenance_type,
            maintenance_type AS repair_type,
            equipment_kind,
            issue,
            action_taken,
            technician_user_id,
            contractor,
            downtime_hours,
            CAST(cost_usd.labor AS DOUBLE) AS cost_labor_usd,
            CAST(cost_usd.parts AS DOUBLE) AS cost_parts_usd,
            CAST(cost_usd.total AS DOUBLE) AS cost_usd,
            triggered_by_inspection_id,
            report_file
        FROM read_json_auto('{norm_maint_glob}');

        DROP TABLE IF EXISTS raw_maintenance;
        CREATE TABLE raw_maintenance AS SELECT * FROM raw_repairs;
    """)
    maint_count = con.execute("SELECT COUNT(*) FROM raw_repairs").fetchone()[0]
    total_rows += maint_count
    if verbose:
        print(f"  [+] Ingested {maint_count:,} maintenance jobs from maintenance.jsonl")

    # 6. Ingest Regulatory Events (assets/*/regulatory-events.jsonl)
    norm_reg_glob = os.path.join(data_dir, "assets", "*", "regulatory-events.jsonl").replace("\\", "/")
    con.execute(f"""
        DROP TABLE IF EXISTS raw_regulator_events;
        CREATE TABLE raw_regulator_events AS
        SELECT 
            event_id,
            asset_id,
            asset_id AS well_id,
            CAST(date AS DATE) AS date,
            CAST(date AS TIMESTAMP) AS event_timestamp,
            agency,
            event_type,
            protocol_id,
            related_inspection_id,
            hours_to_report,
            detail,
            detail AS description,
            fine_usd,
            status
        FROM read_json_auto('{norm_reg_glob}');
    """)
    reg_count = con.execute("SELECT COUNT(*) FROM raw_regulator_events").fetchone()[0]
    total_rows += reg_count
    if verbose:
        print(f"  [+] Ingested {reg_count:,} regulatory events from regulatory-events.jsonl")

    # 7. Ingest Context Notes (assets/*/context.jsonl)
    norm_ctx_glob = os.path.join(data_dir, "assets", "*", "context.jsonl").replace("\\", "/")
    con.execute(f"""
        DROP TABLE IF EXISTS raw_context;
        CREATE TABLE raw_context AS
        SELECT 
            note_id,
            asset_id,
            asset_id AS well_id,
            CAST(created_at AS TIMESTAMP) AS created_at,
            author_user_id,
            note_type,
            inspection_id,
            text,
            text AS note_text,
            CAST(valid_from AS DATE) AS valid_from,
            CAST(valid_to AS DATE) AS valid_to
        FROM read_json_auto('{norm_ctx_glob}');

        DROP TABLE IF EXISTS raw_shared_notes;
        CREATE TABLE raw_shared_notes AS SELECT * FROM raw_context;
    """)
    ctx_count = con.execute("SELECT COUNT(*) FROM raw_context").fetchone()[0]
    total_rows += ctx_count
    if verbose:
        print(f"  [+] Ingested {ctx_count:,} context notes from context.jsonl")

    # 8. Ingest Maintenance Reports (*.md files)
    report_files = glob.glob(os.path.join(data_dir, "assets", "*", "maintenance-reports", "*.md"))
    con.execute("""
        DROP TABLE IF EXISTS raw_maintenance_reports;
        CREATE TABLE raw_maintenance_reports (
            maintenance_id VARCHAR PRIMARY KEY,
            asset_id VARCHAR,
            report_filename VARCHAR,
            content_text VARCHAR
        );
    """)
    report_rows = []
    for rpath in report_files:
        fname = os.path.basename(rpath)
        m_id = os.path.splitext(fname)[0]
        # Parent asset folder
        asset_folder = os.path.basename(os.path.dirname(os.path.dirname(rpath)))
        try:
            with open(rpath, "r", encoding="utf-8") as rf:
                txt = rf.read()
            report_rows.append((m_id, asset_folder, fname, txt))
        except Exception:
            pass

    if report_rows:
        con.executemany("INSERT INTO raw_maintenance_reports VALUES (?, ?, ?, ?)", report_rows)
    total_rows += len(report_rows)
    if verbose:
        print(f"  [+] Ingested {len(report_rows):,} maintenance reports from markdown files")

    # 9. Ingest Manuals & SOPs
    doc_files = []
    doc_files.extend(glob.glob(os.path.join(data_dir, "fleet", "well-types", "*.md")))
    doc_files.extend(glob.glob(os.path.join(data_dir, "fleet", "sops", "*.md")))

    con.execute("""
        DROP TABLE IF EXISTS raw_documents;
        CREATE TABLE raw_documents (
            doc_id VARCHAR PRIMARY KEY,
            doc_type VARCHAR,
            title VARCHAR,
            file_path VARCHAR,
            content_text VARCHAR
        );
    """)
    doc_rows = []
    for dpath in doc_files:
        fname = os.path.basename(dpath)
        doc_id = os.path.splitext(fname)[0]
        dtype = "manual" if "well-types" in dpath else "sop"
        try:
            with open(dpath, "r", encoding="utf-8") as df:
                txt = df.read()
            # Title from first line
            first_line = txt.splitlines()[0].lstrip("#").strip() if txt.splitlines() else fname
            doc_rows.append((doc_id, dtype, first_line, dpath, txt))
        except Exception:
            pass

    if doc_rows:
        con.executemany("INSERT INTO raw_documents VALUES (?, ?, ?, ?, ?)", doc_rows)
    if verbose:
        print(f"  [+] Ingested {len(doc_rows):,} fleet documentation manuals and SOPs")

    # 10. Setup Overlay Tables
    con.execute("""
        CREATE TABLE IF NOT EXISTS corrections (
            correction_id VARCHAR PRIMARY KEY,
            scope VARCHAR,
            target VARCHAR,
            field VARCHAR,
            original_value VARCHAR,
            new_value VARCHAR,
            author VARCHAR,
            reason VARCHAR,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS shared_notes (
            note_id VARCHAR PRIMARY KEY,
            well_id VARCHAR,
            author VARCHAR,
            note_text VARCHAR,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS user_memory (
            user_id VARCHAR,
            memory_key VARCHAR,
            memory_value VARCHAR,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, memory_key)
        );
    """)

    # Seed corrections from context.jsonl where note_type == 'correction'
    con.execute("""
        INSERT INTO corrections (correction_id, scope, target, field, original_value, new_value, author, reason, timestamp)
        SELECT 
            note_id AS correction_id,
            'inspection' AS scope,
            inspection_id AS target,
            'spill_est_volume_bbl' AS field,
            'positive' AS original_value,
            '0.0' AS new_value,
            author_user_id AS author,
            text AS reason,
            created_at AS timestamp
        FROM raw_context
        WHERE note_type = 'correction' AND inspection_id IS NOT NULL
        ON CONFLICT (correction_id) DO NOTHING;
    """)

    # 11. Create Analytical Views
    create_views(con)

    # 12. Create Performance Indexes
    con.execute("""
        CREATE INDEX IF NOT EXISTS idx_inspections_asset ON raw_inspections(asset_id);
        CREATE INDEX IF NOT EXISTS idx_inspections_date ON raw_inspections(inspected_at);
        CREATE INDEX IF NOT EXISTS idx_repairs_asset ON raw_repairs(asset_id);
        CREATE INDEX IF NOT EXISTS idx_repairs_date ON raw_repairs(started_at);
        CREATE INDEX IF NOT EXISTS idx_reg_asset ON raw_regulator_events(asset_id);
        CREATE INDEX IF NOT EXISTS idx_context_asset ON raw_context(asset_id);
    """)

    t_elapsed = time.perf_counter() - t_start
    if verbose:
        print(f"Ingestion completed in {t_elapsed:.2f} seconds.")
        print(f"Total operational records ingested: {total_rows:,}")

    con.close()
    return total_rows

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest FlytBase Asset Intelligence dataset into DuckDB.")
    parser.add_argument("--data", type=str, default=DEFAULT_DATA_DIR, help="Path to data directory (holds fleet/ and assets/)")
    parser.add_argument("--db", type=str, default=DB_PATH, help="Path to DuckDB warehouse file")
    args = parser.parse_args()

    ingest_data(data_dir=args.data, db_path=args.db)
