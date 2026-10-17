# WellSight

An enterprise AI operations copilot answering plain-English questions about oil and gas wells, strictly grounded in operational data with verified citations and deterministic domain rule enforcement.

Licensed under the **MIT License**.

---

## 🏛️ Architecture & System Structure

```
├── /backend
│   ├── main.py                  # FastAPI server with chat, wells, corrections, and SQL endpoints
│   ├── agent.py                 # Grounded LLM loop, citation grounding, conflict detection
│   ├── domain.py                # Pure Python domain logic (NEVER calculated by LLM)
│   ├── db.py                    # DuckDB connection manager & overlay scoped operations
│   ├── tools.py                 # Deterministic tools (well_status, downtime, spills, etc.)
│   ├── search_docs.py           # Hybrid BM25 + dense semantic document search
│   ├── ingest.py                # One-command data ingestion engine
│   ├── mapping.yaml             # Configurable source-column to canonical-column mapping
│   ├── config.py                # Provider & environment loader
│   ├── warehouse.duckdb         # Embedded analytical DuckDB database
│   └── tests/
│       ├── test_downtime.py          # Pytest suite for downtime accounting rules
│       ├── test_corrections_scope.py # Pytest suite for overlay scoping precedence
│       └── test_tools.py             # Pytest suite for deterministic tools & hybrid search
├── /frontend
│   ├── src/app/page.tsx         # Chat UI, active user switcher, quick scenarios
│   ├── src/components/
│   │   ├── VisualRenderer.tsx   # Inline visual renderer (status_card, line, bar, map, heatmap, table)
│   │   ├── MapComponent.tsx     # Leaflet asset map with producing status pins
│   │   ├── CitationDrawer.tsx   # Grounded evidence inspector for record IDs & doc citations
│   │   └── CorrectionModal.tsx  # Append-only correction overlay interface
│   └── package.json             # Next.js 16 + React 19 + Tailwind CSS + Recharts + Leaflet
├── /data
│   ├── generate_synthetic.py    # Messy synthetic data generator
│   ├── wells.csv                # Wells master data with stale statuses
│   ├── inspections.csv          # Weekly thermal readings, delta T, missed weeks
│   ├── repairs.csv              # Component replacements & free-text workover logs
│   ├── regulator_events.csv     # Spills, reporting timestamps, and fines
│   ├── human_notes.csv          # Operator observations & engineering disputes
│   ├── users.csv                # User profiles for role-based switching
│   └── docs/                    # Equipment manuals & regulatory SOPs (.md)
├── LICENSE                      # MIT License
├── .env.example                 # Example environment variables
└── README.md
```

---

## ⚙️ Deterministic Domain Rules (Implemented in Code)

1. **Well Producing Criterion**:
   - A well is classified as **`PRODUCING`** if and only if:
     $$\Delta T = T_{\text{wellhead}} - T_{\text{air}} \ge \text{Threshold}$$
   - Baseline thresholds per equipment manual:
     - **Beam Pump**: $10.0^\circ\text{C}$ (`[DOC-MAN-BP-001 § 2.4]`)
     - **Electric Submersible Pump (ESP)**: $15.0^\circ\text{C}$ (`[DOC-MAN-ESP-002 § 2.5]`)
     - **Gas Lift**: $8.0^\circ\text{C}$ (`[DOC-MAN-GL-003 § 2.3]`)
   - The legacy `recorded_status` field from SCADA is explicitly **bypassed/ignored** as it is frequently stale.

2. **Downtime Accounting Rules**:
   - Each weekly inspection finding the well non-producing ($\Delta T < \text{Threshold}$) accrues **7 days** of operational downtime.
   - Consecutive non-producing inspections compound: 1st = 7 days, 2nd consecutive = 14 days, 3rd consecutive = 21 days (`[SOP-OPS-DOWNTIME-202 § 1.1]`).
   - Missed inspection weeks add **0 days** to calculated downtime (`[SOP-OPS-DOWNTIME-202 § 1.2]`).
   - **Repair Exclusion**: Days where a well is under active repair (`repairs` log) **do NOT count toward operational downtime** (`[SOP-OPS-DOWNTIME-202 § 2.2]`).

3. **Environmental Spill Compliance**:
   - A spill $\ge 5.0\text{ bbl}$ must be reported to the regulator within **24 hours** of occurrence (`[SOP-ENV-SPILL-101 § 2.1, § 3.2]`).
   - Spills reported after $> 24.0\text{ hours}$ or unreported incur statutory regulatory fines ($15,000 to $25,000).
   - Spills $< 5.0\text{ bbl}$ are exempt minor containment events.
   - Later official **corrections** (e.g. soil surveyor certification) **override the original volume**. If corrected below 5 bbl, late penalties are vacated.

4. **Append-Only Correction Overlays & Scoping Precedence**:
   - Overlay tables (`corrections`, `shared_notes`, `user_memory`) are append-only.
   - Views dynamically resolve effective values following strict hierarchy:
     $$\text{Scope 'well'} > \text{Scope 'type'} > \text{Scope 'all'} > \text{Baseline}$$
   - Keeps raw data immutable while providing full provenance (author, timestamp, rationale).

5. **Conflict Detection**:
   - Detects discrepancies between human notes (e.g. Mike Rodriguez in `[NOTE-001]` vs Sarah Chen in `[NOTE-002]` on W-104) and between human claims vs physical sensor data.
   - Transparently presents both sides along with the grounded physical determination.

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- Python 3.11+
- Node.js 18+ & npm

### 2. Backend Setup & Ingestion
```bash
# Navigate to backend and create virtual environment
python -m venv backend/.venv

# Activate virtualenv (Windows)
backend\.venv\Scripts\activate
# (Linux/macOS: source backend/.venv/bin/activate)

# Install Python dependencies
pip install -r backend/requirements.txt

# Ingest messy CSVs into DuckDB with mapping.yaml
python backend/ingest.py

# Run backend tests
pytest backend/tests
```

### 3. Start Backend Server
```bash
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

### 4. Frontend Setup & Run
```bash
cd frontend
npm install --legacy-peer-deps
npm run build
npm run start -- -p 3000
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔄 Swappable LLM Configuration

The Copilot supports pluggable LLM backends configured in `.env` (copy from `.env.example`):

```ini
# Swappable provider: 'gemini' | 'anthropic' | 'local'
LLM_PROVIDER=gemini
LLM_MODEL=gemini-1.5-flash

# API Keys
GEMINI_API_KEY=your_gemini_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

> **Zero-Config Local Mode**: If no API key is set, the system runs with a built-in deterministic reasoning engine that performs complete tool calling, citation generation, visual spec rendering, and conflict detection out of the box!

---

## 🧪 Automated Testing

All domain calculations and scoping precedence are covered by Pytest:

```bash
backend\.venv\Scripts\pytest backend/tests -v
```

17 automated tests verify:
- Downtime single week (7 days) and consecutive weeks (14, 21 days).
- Missed inspection week additions (0 days).
- Exclusion of active repair periods from operational downtime.
- Correction scope hierarchy: `well` overriding `type`, `type` overriding `all`.
- Spill volume reclassification from 12.0 bbl to 2.2 bbl puddle vacating fines.
- Read-only SQL safety validation (blocking DROP, DELETE, INSERT).
- Hybrid BM25 + dense documentation search citations.

---

## 📊 Inline Visual Specifications (`render_visual`)

The agent returns declarative visual specs rendered directly in the chat UI:
- `status_card`: Thermal delta gauge, producing badge, pressure, and SCADA bypass notice.
- `map`: Interactive Leaflet map with colored asset pins and popup details.
- `line`: Recharts temperature differential trend vs threshold line.
- `bar`: Net operational downtime by well or area, repair expenses breakdown.
- `heatmap`: Weekly inspection matrix across all wells.
- `table`: Searchable and sortable tabular data views.
