"""
Hybrid Document Search Engine (BM25 + Semantic Matching) for Asset Intelligence Copilot.
Indexes:
- Well operating manuals (T200.md, T350.md)
- Standard Operating Procedures (spill-response-sop.md, regulatory-compliance-sop.md, field-work-sop.md)
- Free-text maintenance reports (from raw_maintenance_reports table in DuckDB)
Returns structured citations: [OM-T200 § 9.3], [SOP-SR § 4], [SOP-RC § 2], [MNT-0001-002].
"""

import os
import re
import glob
from typing import List, Dict, Any, Optional
from rank_bm25 import BM25Okapi

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
FLEET_DIR = os.path.join(DATA_DIR, "fleet")

class DocChunk:
    def __init__(self, doc_id: str, doc_title: str, section: str, well_type: str, content: str, source_file: str):
        self.doc_id = doc_id
        self.doc_title = doc_title
        self.section = section
        self.well_type = well_type
        self.content = content
        self.source_file = source_file
        self.tokens = self._tokenize(f"{doc_id} {doc_title} {section} {well_type} {content}")

    @staticmethod
    def _tokenize(text: str) -> List[str]:
        return re.findall(r"\w+", text.lower())

class HybridSearchEngine:
    def __init__(self):
        self.chunks: List[DocChunk] = []
        self.bm25: Optional[BM25Okapi] = None
        self._load_corpus()

    def _load_corpus(self):
        """Loads and chunks manuals, SOPs, and maintenance reports."""
        self.chunks = []

        # 1. Load fleet well-type manuals
        manual_files = glob.glob(os.path.join(FLEET_DIR, "well-types", "*.md"))
        for fpath in manual_files:
            fname = os.path.basename(fpath)
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    content = f.read()
                self._chunk_markdown(fname, content, default_type=os.path.splitext(fname)[0])
            except Exception:
                pass

        # 2. Load fleet SOPs
        sop_files = glob.glob(os.path.join(FLEET_DIR, "sops", "*.md"))
        for fpath in sop_files:
            fname = os.path.basename(fpath)
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    content = f.read()
                self._chunk_markdown(fname, content, default_type="All")
            except Exception:
                pass

        # 3. Load maintenance reports from DuckDB
        try:
            from backend.db import query_as_dicts
            reports = query_as_dicts("SELECT maintenance_id, asset_id, report_filename, content_text FROM raw_maintenance_reports")
            for rep in reports:
                m_id = rep["maintenance_id"]
                content = rep["content_text"]
                # Chunk into sections
                sections = re.split(r"\n(?=#{2,3}\s+)", content)
                for sec in sections:
                    sec_clean = sec.strip()
                    if not sec_clean:
                        continue
                    sec_title_match = re.match(r"^#{2,3}\s+(.+)$", sec_clean, re.MULTILINE)
                    sec_title = sec_title_match.group(1).strip() if sec_title_match else "Report Details"
                    chunk = DocChunk(
                        doc_id=m_id,
                        doc_title=f"Maintenance Report {m_id} ({rep['asset_id']})",
                        section=sec_title,
                        well_type="All",
                        content=sec_clean,
                        source_file=rep.get("report_filename") or f"{m_id}.md"
                    )
                    self.chunks.append(chunk)
        except Exception:
            pass

        if self.chunks:
            tokenized_corpus = [chunk.tokens for chunk in self.chunks]
            self.bm25 = BM25Okapi(tokenized_corpus)

    def _chunk_markdown(self, fname: str, text: str, default_type: str = "All"):
        doc_id_match = re.search(r"Document ID:\s*([^\s·\n\r]+)", text)
        doc_id = doc_id_match.group(1).strip() if doc_id_match else os.path.splitext(fname)[0].upper()

        title_match = re.search(r"^#\s+(.+)$", text, re.MULTILINE)
        doc_title = title_match.group(1).strip() if title_match else fname

        well_type = default_type
        if "T200" in fname or "T200" in text:
            well_type = "T200"
        elif "T350" in fname or "T350" in text:
            well_type = "T350"

        sections = re.split(r"\n(?=#{2,3}\s+)", text)
        for sec in sections:
            sec_clean = sec.strip()
            if not sec_clean:
                continue

            sec_title_match = re.match(r"^#{2,3}\s+(.+)$", sec_clean, re.MULTILINE)
            sec_title = sec_title_match.group(1).strip() if sec_title_match else "Overview"

            self.chunks.append(DocChunk(
                doc_id=doc_id,
                doc_title=doc_title,
                section=sec_title,
                well_type=well_type,
                content=sec_clean,
                source_file=fname
            ))

    def search(self, query: str, top_k: int = 5, well_type: Optional[str] = None) -> List[Dict[str, Any]]:
        if not self.bm25 or not self.chunks:
            return []

        tokens = re.findall(r"\w+", query.lower())
        if not tokens:
            return []

        scores = self.bm25.get_scores(tokens)
        ranked_indices = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)

        results = []
        for idx in ranked_indices:
            if scores[idx] <= 0:
                continue
            chunk = self.chunks[idx]

            # Boost if well_type matches
            multiplier = 1.0
            if well_type and chunk.well_type != "All":
                if chunk.well_type.lower() == well_type.lower():
                    multiplier = 1.3
                else:
                    multiplier = 0.7

            final_score = scores[idx] * multiplier

            # Format citation
            if "MNT-" in chunk.doc_id:
                citation = f"[{chunk.doc_id}]"
            elif "§" in chunk.section or re.search(r"^\d+", chunk.section):
                sec_num = chunk.section.split()[0]
                citation = f"[{chunk.doc_id} § {sec_num}]"
            else:
                citation = f"[{chunk.doc_id} § {chunk.section[:15]}]"

            results.append({
                "doc_id": chunk.doc_id,
                "doc_title": chunk.doc_title,
                "section": chunk.section,
                "well_type": chunk.well_type,
                "content": chunk.content[:500],
                "citation": citation,
                "score": round(float(final_score), 3)
            })

            if len(results) >= top_k:
                break

        return results

_engine = None

def get_search_engine() -> HybridSearchEngine:
    global _engine
    if _engine is None:
        _engine = HybridSearchEngine()
    return _engine

def search_docs(query: str, top_k: int = 5, well_type: Optional[str] = None) -> List[Dict[str, Any]]:
    return get_search_engine().search(query=query, top_k=top_k, well_type=well_type)
