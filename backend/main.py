"""
FastAPI Backend Application for Asset Intelligence Copilot.
Exposes REST endpoints for:
- Agent Chat with tool grounding & visual specs
- User profile picker & isolated private memory
- Well inventory & detailed 360-degree context
- Append-only corrections & shared notes
- Mapping-based re-ingestion
"""

import os
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from backend import config
from backend.db import (
    query_as_dicts,
    get_user_memories,
    set_user_memory,
    add_correction as db_add_correction,
    get_active_corrections,
    add_shared_note,
    get_shared_notes
)
from backend.tools import get_well_context, well_status, run_sql
from backend.agent import query_llm_with_tools
from backend.ingest import ingest_data

app = FastAPI(
    title="WellSight API",
    description="Oil & gas well intelligence platform grounded in operational data with citations",
    version="1.0.0"
)

# Enable CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    message: str
    user_id: str = "usr_sarah"
    history: Optional[List[Dict[str, Any]]] = None

class MemoryRequest(BaseModel):
    key: str
    value: str

class CorrectionRequest(BaseModel):
    scope: str
    target: str
    field: str
    original_value: str
    new_value: str
    author: str
    reason: str

class NoteRequest(BaseModel):
    well_id: str
    author: str
    note_text: str

class SqlRequest(BaseModel):
    query: str

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "provider": config.LLM_PROVIDER,
        "model": config.LLM_MODEL,
        "database": "DuckDB warehouse.duckdb"
    }

@app.post("/api/chat")
async def chat_endpoint(req: ChatRequest):
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    result = await query_llm_with_tools(
        message=req.message,
        user_id=req.user_id,
        history=req.history
    )
    return result

@app.get("/api/users")
def get_users():
    return query_as_dicts("""
        SELECT u.user_id, u.name, u.role, u.team_id, 
               COALESCE(t.name, u.team_id) as department,
               COALESCE(a.name, '') as default_area
        FROM raw_users u 
        LEFT JOIN raw_teams t ON u.team_id = t.team_id
        LEFT JOIN raw_areas a ON t.team_id = a.team_id
        ORDER BY u.user_id ASC
    """)

@app.get("/api/users/{user_id}/memory")
def get_user_memory_endpoint(user_id: str):
    return get_user_memories(user_id)

@app.post("/api/users/{user_id}/memory")
def save_user_memory_endpoint(user_id: str, req: MemoryRequest):
    return set_user_memory(user_id=user_id, key=req.key, value=req.value)

@app.get("/api/wells")
def list_wells():
    return query_as_dicts("SELECT * FROM raw_wells ORDER BY well_id ASC")

@app.get("/api/wells/{well_id}")
def get_well_details(well_id: str):
    ctx = get_well_context(well_id=well_id)
    if "error" in ctx:
        raise HTTPException(status_code=404, detail=ctx["error"])
    return ctx

@app.get("/api/citations/{citation_id}")
def inspect_citation(citation_id: str):
    clean_id = citation_id.strip("[] ").split()[0]
    if clean_id.startswith(("WELL-", "W-")):
        res = query_as_dicts("SELECT * FROM raw_wells WHERE well_id = ? OR asset_id = ?", (clean_id, clean_id))
        if res:
            ctx = get_well_context(clean_id)
            return {"type": "well", "payload": ctx}
    elif clean_id.startswith(("INS-", "INSP-")):
        res = query_as_dicts("SELECT * FROM v_inspections WHERE inspection_id = ?", (clean_id,))
        if res:
            return {"type": "inspection", "payload": res[0]}
    elif clean_id.startswith(("MNT-", "REP-")):
        res = query_as_dicts("SELECT * FROM v_repairs WHERE repair_id = ?", (clean_id,))
        if res:
            return {"type": "repair", "payload": res[0]}
    elif clean_id.startswith(("REG-", "EVT-")):
        res = query_as_dicts("SELECT * FROM raw_regulator_events WHERE event_id = ?", (clean_id,))
        if res:
            return {"type": "regulatory", "payload": res[0]}
    elif clean_id.startswith("CTX-"):
        res = query_as_dicts("SELECT * FROM raw_context WHERE note_id = ?", (clean_id,))
        if res:
            return {"type": "context", "payload": res[0]}
    elif clean_id.startswith(("OM-", "SOP-", "DOC-")):
        from backend.search_docs import search_manuals
        docs = search_manuals(clean_id, limit=3)
        return {"type": "document", "payload": {"results": docs}}
    
    raise HTTPException(status_code=404, detail=f"No record found for citation {citation_id}")

@app.get("/api/corrections")
def list_corrections():
    return get_active_corrections()

@app.post("/api/corrections")
def create_correction(req: CorrectionRequest):
    try:
        return db_add_correction(
            scope=req.scope,
            target=req.target,
            field=req.field,
            original_value=req.original_value,
            new_value=req.new_value,
            author=req.author,
            reason=req.reason
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/notes")
def list_notes(well_id: Optional[str] = None):
    return get_shared_notes(well_id=well_id)

@app.post("/api/notes")
def create_note(req: NoteRequest):
    try:
        return add_shared_note(
            well_id=req.well_id,
            author=req.author,
            note_text=req.note_text
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/sql")
def execute_sql_query(req: SqlRequest):
    result = run_sql(req.query)
    if not result.get("success", True):
        raise HTTPException(status_code=400, detail=result.get("error", "Query execution failed"))
    return result

@app.post("/api/reingest")
def trigger_reingestion():
    try:
        ingest_data(verbose=False)
        return {"success": True, "message": "Re-ingested all tables and updated views from mapping.yaml"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
