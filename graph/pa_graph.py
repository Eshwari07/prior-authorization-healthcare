"""LangGraph state machine for the PA workflow.

Flow:
    eligibility ──► coder ──► submitter ──► (approved) ──► END
                                  │
                                  └► (denied) ──► denial_analyst ──► (retry) ──► submitter
                                                                  └► (escalate) ──► END

Early exits: eligibility can terminate immediately (ineligible / no PA required),
and coder can escalate if coding fails.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from langgraph.graph import END, StateGraph

import config
from agents import coder, denial_analyst, eligibility, submitter
from graph.state import PAState


# ─── Node wrappers ────────────────────────────────────────────────

def eligibility_node(state: PAState) -> dict:
    return eligibility.run(state)


def coder_node(state: PAState) -> dict:
    return coder.run(state)


def submitter_node(state: PAState) -> dict:
    return submitter.run(state)


def denial_analyst_node(state: PAState) -> dict:
    return denial_analyst.run(state)


# ─── Routing functions ────────────────────────────────────────────

def route_after_eligibility(state: PAState) -> str:
    # If eligibility set a terminal status, stop. Otherwise continue to coder.
    if state.get("final_status") in {"ineligible", "approved"}:
        return "end"
    return "coder"


def route_after_coder(state: PAState) -> str:
    if state.get("final_status") == "escalated":
        return "end"
    return "submit"


def route_after_submit(state: PAState) -> str:
    status = state["pa_request"]["status"]
    return "approved" if status == "approved" else "denied"


def route_after_denial(state: PAState) -> str:
    if state.get("final_status") == "escalated":
        return "escalate"
    return "retry"


# ─── Build & compile ──────────────────────────────────────────────

def build_graph():
    g = StateGraph(PAState)

    g.add_node("eligibility", eligibility_node)
    g.add_node("coder", coder_node)
    g.add_node("submitter", submitter_node)
    g.add_node("denial_analyst", denial_analyst_node)

    g.set_entry_point("eligibility")

    g.add_conditional_edges(
        "eligibility", route_after_eligibility, {"coder": "coder", "end": END}
    )
    g.add_conditional_edges(
        "coder", route_after_coder, {"submit": "submitter", "end": END}
    )
    g.add_conditional_edges(
        "submitter",
        route_after_submit,
        {"approved": END, "denied": "denial_analyst"},
    )
    g.add_conditional_edges(
        "denial_analyst",
        route_after_denial,
        {"retry": "submitter", "escalate": END},
    )

    return g.compile()


def initial_state(patient_query: str, procedure_request: str) -> PAState:
    return {
        "patient_query": patient_query,
        "procedure_request": procedure_request,
        "patient_context": None,
        "coding_result": None,
        "pa_request": None,
        "denial_analysis": None,
        "agent_trace": [],
        "retry_count": 0,
        "max_retries": config.MAX_RETRIES,
        "final_status": "",
        "final_auth_number": None,
        "appeal_letter": None,
        "run_id": uuid.uuid4().hex,
        "started_at": datetime.now(timezone.utc).isoformat(),
    }
