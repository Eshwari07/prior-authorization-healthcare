"""LangGraph state definition for the PA workflow.

The `agent_trace` list is the transparency backbone: each agent appends one
`AgentDecision` with its verdict, reasoning, the data it consulted, and a
confidence score. The Streamlit UI renders these live.
"""
from __future__ import annotations

import operator
from typing import Annotated, Any, TypedDict


class AgentDecision(TypedDict, total=False):
    agent: str            # eligibility | coder | submitter | denial_analyst
    status: str           # eligible | ineligible | coded | approved | denied | analyzed | escalated
    decision: str         # short human-readable verdict
    reasoning: str        # explanation / chain-of-thought
    data_used: list[str]  # which FHIR fields / code tables were consulted
    confidence: float     # 0.0 - 1.0
    details: dict[str, Any]  # agent-specific extra payload (codes, denial info, etc.)


class PAState(TypedDict, total=False):
    # ── Inputs ──
    patient_query: str
    procedure_request: str

    # ── Resolved data (populated as graph runs) ──
    patient_context: dict[str, Any] | None
    coding_result: dict[str, Any] | None
    pa_request: dict[str, Any] | None
    denial_analysis: dict[str, Any] | None

    # ── Transparency trace (appended by every agent) ──
    agent_trace: Annotated[list[AgentDecision], operator.add]

    # ── Control ──
    retry_count: int
    max_retries: int
    final_status: str          # approved | denied | escalated | ineligible | error
    final_auth_number: str | None
    appeal_letter: str | None

    # ── Metadata ──
    run_id: str
    started_at: str
