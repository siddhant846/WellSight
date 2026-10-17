"""
DuckDB Database Manager & Scoped Overlay Operations.
Provides transactional access to warehouse.duckdb and ensures overlay tables
and views correctly propagate scoped corrections, notes, and user memories.
"""

import os
import duckdb
from typing import List, Dict, Any, Optional
from datetime import datetime

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BACKEND_DIR, "warehouse.duckdb")

def get_connection(read_only: bool = False):
    """Returns a DuckDB connection to warehouse.duckdb."""
    return duckdb.connect(DB_PATH, read_only=read_only)

def query_as_dicts(sql: str, params: Optional[List[Any]] = None, con=None) -> List[Dict[str, Any]]:
    """Helper to run a query and return rows as dictionaries."""
    should_close = False
    if con is None:
        con = get_connection(read_only=True)
        should_close = True

    try:
        cursor = con.execute(sql, params or [])
        col_names = [desc[0] for desc in cursor.description]
        rows = cursor.fetchall()
        result = []
        for r in rows:
            result.append(dict(zip(col_names, r)))
        return result
    finally:
        if should_close:
            con.close()

def get_active_corrections() -> List[Dict[str, Any]]:
    """Fetches all corrections ordered by timestamp."""
    return query_as_dicts("SELECT * FROM corrections ORDER BY timestamp ASC")

def add_correction(
    scope: str,
    target: str,
    field: str,
    original_value: str,
    new_value: str,
    author: str,
    reason: str
) -> Dict[str, Any]:
    """
    Appends a new correction to the corrections table.
    Enforces scope in ('well', 'type', 'all').
    """
    if scope not in ("inspection", "well", "type", "all"):
        raise ValueError(f"Invalid scope '{scope}'. Must be 'inspection', 'well', 'type', or 'all'.")

    con = get_connection(read_only=False)
    try:
        count = con.execute("SELECT COUNT(*) FROM corrections").fetchone()[0]
        corr_id = f"CORR-{count + 101:03d}"
        now_ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        con.execute("""
            INSERT INTO corrections (correction_id, scope, target, field, original_value, new_value, author, reason, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (corr_id, scope, target, field, str(original_value), str(new_value), author, reason, now_ts))

        # Re-apply views
        from backend.ingest import create_views
        create_views(con)

        return {
            "correction_id": corr_id,
            "scope": scope,
            "target": target,
            "field": field,
            "original_value": str(original_value),
            "new_value": str(new_value),
            "author": author,
            "reason": reason,
            "timestamp": now_ts
        }
    finally:
        con.close()

def add_shared_note(well_id: str, author: str, note_text: str) -> Dict[str, Any]:
    """Appends a shared note for a well."""
    con = get_connection(read_only=False)
    try:
        count = con.execute("SELECT COUNT(*) FROM shared_notes").fetchone()[0]
        note_id = f"NOTE-{count + 101:03d}"
        now_ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        con.execute("""
            INSERT INTO shared_notes (note_id, well_id, author, note_text, timestamp)
            VALUES (?, ?, ?, ?, ?)
        """, (note_id, well_id, author, note_text, now_ts))

        return {
            "note_id": note_id,
            "well_id": well_id,
            "author": author,
            "note_text": note_text,
            "timestamp": now_ts
        }
    finally:
        con.close()

def get_shared_notes(well_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Retrieves shared notes, optionally filtered by well_id."""
    if well_id:
        return query_as_dicts(
            "SELECT * FROM shared_notes WHERE well_id = ? ORDER BY timestamp DESC",
            [well_id]
        )
    return query_as_dicts("SELECT * FROM shared_notes ORDER BY timestamp DESC")

def get_user_memories(user_id: str) -> List[Dict[str, Any]]:
    """Retrieves private memory items for a specific user_id."""
    return query_as_dicts(
        "SELECT memory_id, memory_key, memory_value, updated_at FROM user_memory WHERE user_id = ? ORDER BY updated_at ASC",
        [user_id]
    )

def set_user_memory(user_id: str, key: str, value: str) -> Dict[str, Any]:
    """Saves or updates a private memory item for user_id."""
    con = get_connection(read_only=False)
    try:
        existing = con.execute(
            "SELECT memory_id FROM user_memory WHERE user_id = ? AND memory_key = ?",
            (user_id, key)
        ).fetchone()

        now_ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        if existing:
            mem_id = existing[0]
            con.execute(
                "UPDATE user_memory SET memory_value = ?, updated_at = ? WHERE memory_id = ?",
                (value, now_ts, mem_id)
            )
        else:
            count = con.execute("SELECT COUNT(*) FROM user_memory").fetchone()[0]
            mem_id = f"MEM-{count + 101:03d}"
            con.execute(
                "INSERT INTO user_memory (memory_id, user_id, memory_key, memory_value, updated_at) VALUES (?, ?, ?, ?, ?)",
                (mem_id, user_id, key, value, now_ts)
            )

        return {
            "memory_id": mem_id,
            "user_id": user_id,
            "memory_key": key,
            "memory_value": value,
            "updated_at": now_ts
        }
    finally:
        con.close()
