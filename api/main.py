"""FastAPI backend for the Prior Authorization Automation system.

Exposes:
  POST /api/patients          — list patients
  GET  /api/patients          — list patients (same)
  POST /api/submit            — run PA workflow, returns JSON result
  POST /api/submit/stream     — run PA workflow, SSE stream of agent trace
  GET  /api/history           — all runs from Neon
  GET  /api/analytics         — aggregated stats
  GET  /health                — liveness check
"""
from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path
from typing import Any

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

# Make repo root importable when running from api/ directory
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import config
from agents import submitter as submitter_agent
from graph.pa_graph import build_graph, initial_state
from utils.fhir_parser import list_patients

app = FastAPI(title="Prior Auth API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Cache the compiled graph (expensive to rebuild)
_graph = None


def get_graph():
    global _graph
    if _graph is None:
        _graph = build_graph()
    return _graph


# ─── Request / Response models ────────────────────────────────────────────────

class SubmitRequest(BaseModel):
    patient_name: str
    procedure_request: str


class PatientOut(BaseModel):
    patient_id: str
    name: str
    dob: str | None = None
    insurer: str | None = None
    plan_name: str | None = None
    coverage_status: str | None = None


# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/patients")
def get_patients():
    patients = list_patients(config.PATIENTS_DIR)
    return {"patients": patients}


@app.post("/api/submit")
def submit(req: SubmitRequest):
    """Run the full PA workflow and return the final state."""
    graph = get_graph()
    state = initial_state(req.patient_name, req.procedure_request)
    submitter_agent.reset_payer(state["run_id"])

    final_state = state
    for chunk in graph.stream(state, stream_mode="values"):
        final_state = chunk

    _persist(final_state)
    return _serialize_state(final_state)


@app.post("/api/submit/stream")
async def submit_stream(req: SubmitRequest):
    """Run the PA workflow and stream agent trace steps via SSE."""

    async def event_generator():
        graph = get_graph()
        state = initial_state(req.patient_name, req.procedure_request)
        submitter_agent.reset_payer(state["run_id"])

        rendered = 0
        final_state = state

        loop = asyncio.get_event_loop()

        def run_graph():
            results = []
            for chunk in graph.stream(state, stream_mode="values"):
                results.append(chunk)
            return results

        chunks = await loop.run_in_executor(None, run_graph)

        for chunk in chunks:
            final_state = chunk
            trace = chunk.get("agent_trace", [])
            for step in trace[rendered:]:
                data = json.dumps({"type": "trace_step", "step": step})
                yield f"data: {data}\n\n"
                await asyncio.sleep(0)
            rendered = len(trace)

        _persist(final_state)
        final_data = json.dumps({"type": "final", "state": _serialize_state(final_state)})
        yield f"data: {final_data}\n\n"
        yield "data: {\"type\": \"done\"}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/history")
def get_history():
    try:
        from db import neon_store
        runs = neon_store.get_all_runs()
        return {"runs": runs}
    except Exception as exc:
        return {"runs": [], "error": str(exc)}


@app.get("/api/reference/patients-detail")
def get_patients_detail():
    """Return the full denormalized patient table (from patients.csv)."""
    try:
        from utils.data_loader import load_patients_csv
        return {"patients": load_patients_csv()}
    except Exception as exc:  # noqa: BLE001
        return {"patients": [], "error": str(exc)}


@app.get("/api/reference/icd10")
def get_icd10(q: str = "", limit: int = 500):
    """Return ICD-10-CM codes matching the search term (code or description).

    With no query, returns the first `limit` codes plus the total count so the
    UI can display a paginated table over the full ~74k-code set.
    """
    from utils.data_loader import load_icd10
    codes = load_icd10()
    total = len(codes)
    term = q.strip().lower()
    if term:
        matched = [
            {"code": code, "description": desc}
            for code, desc in codes.items()
            if term in code.lower() or term in desc.lower()
        ]
    else:
        matched = [{"code": code, "description": desc} for code, desc in codes.items()]
    return {"codes": matched[:limit], "total": total, "matched": len(matched)}


@app.get("/api/reference/procedures")
def get_procedures():
    """Return all procedure (CPT/HCPCS) codes from the local CSV."""
    from utils.data_loader import load_procedures
    return {"procedures": load_procedures()}


@app.get("/api/reference/pa-rules")
def get_pa_rules():
    """Return the PA requirement ruleset JSON."""
    from utils.data_loader import load_pa_rules
    return load_pa_rules()


@app.get("/api/analytics")
def get_analytics():
    try:
        from db import neon_store
        runs = neon_store.get_all_runs()
        if not runs:
            return {"total": 0, "approved": 0, "escalated": 0, "ineligible": 0,
                    "avg_retries": 0.0, "denial_breakdown": {}}

        total = len(runs)
        approved = sum(1 for r in runs if r.get("final_status") == "approved")
        escalated = sum(1 for r in runs if r.get("final_status") == "escalated")
        ineligible = sum(1 for r in runs if r.get("final_status") == "ineligible")
        retries = [r.get("retry_count") or 0 for r in runs]
        avg_retries = sum(retries) / total if total else 0.0

        denial_breakdown: dict[str, int] = {}
        for r in runs:
            code = r.get("denial_code")
            if code:
                denial_breakdown[code] = denial_breakdown.get(code, 0) + 1

        return {
            "total": total,
            "approved": approved,
            "escalated": escalated,
            "ineligible": ineligible,
            "avg_retries": round(avg_retries, 2),
            "denial_breakdown": denial_breakdown,
        }
    except Exception as exc:
        return {"error": str(exc)}


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _persist(state: dict) -> None:
    try:
        from db import neon_store
        ctx = state.get("patient_context") or {}
        coding = state.get("coding_result") or {}
        pa = state.get("pa_request") or {}
        neon_store.save_run({
            "run_id": state["run_id"],
            "patient_id": ctx.get("patient_id"),
            "patient_name": ctx.get("name"),
            "insurer": ctx.get("insurer"),
            "plan_name": ctx.get("plan_name"),
            "procedure_desc": state.get("procedure_request"),
            "cpt_code": coding.get("cpt_code"),
            "primary_icd10": coding.get("primary_icd10"),
            "secondary_icd10": coding.get("secondary_icd10"),
            "final_status": state.get("final_status"),
            "auth_number": state.get("final_auth_number"),
            "denial_code": pa.get("denial_code"),
            "denial_reason": pa.get("denial_reason"),
            "retry_count": state.get("retry_count", 0),
            "appeal_letter": state.get("appeal_letter"),
            "agent_trace": state.get("agent_trace"),
        })
    except Exception:
        pass


def _serialize_state(state: dict) -> dict[str, Any]:
    """Return a JSON-safe subset of the graph state."""
    return {
        "run_id": state.get("run_id"),
        "final_status": state.get("final_status"),
        "final_auth_number": state.get("final_auth_number"),
        "retry_count": state.get("retry_count", 0),
        "appeal_letter": state.get("appeal_letter"),
        "patient_context": state.get("patient_context"),
        "coding_result": state.get("coding_result"),
        "pa_request": state.get("pa_request"),
        "denial_analysis": state.get("denial_analysis"),
        "agent_trace": state.get("agent_trace", []),
    }


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
