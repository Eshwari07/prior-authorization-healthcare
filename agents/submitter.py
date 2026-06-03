"""Agent 3 — PA Submitter (Model B + inline mock payer).

Assembles the PA request packet from patient context and coding result, submits
it to the deterministic inline mock payer, and records the decision. The mock
payer instance is stored on the state so duplicate-detection (CO-97) works
across retries within a single run.
"""
from __future__ import annotations

from datetime import datetime, timezone

from graph.state import AgentDecision
from mock_payer.mock_payer import MockPayer

# One payer per process run, keyed by run_id, so CO-97 duplicate detection works
# across the retry loop without leaking state between different workflow runs.
_payers: dict[str, MockPayer] = {}


def _get_payer(run_id: str) -> MockPayer:
    if run_id not in _payers:
        _payers[run_id] = MockPayer()
    return _payers[run_id]


def reset_payer(run_id: str) -> None:
    _payers.pop(run_id, None)


def run(state: dict) -> dict:
    context = state["patient_context"]
    coding = state["coding_result"]
    run_id = state["run_id"]
    retry_count = state.get("retry_count", 0)

    submission = {
        "member_id": context["member_id"],
        "insurer": context["insurer"],
        "cpt_code": coding["cpt_code"],
        "primary_diagnosis": coding["primary_icd10"],
        "secondary_diagnoses": coding.get("secondary_icd10", []),
        "modifiers": coding.get("modifiers", []),
        "clinical_notes": coding.get("clinical_justification", ""),
        "requesting_provider": "Dr. System Agent",
        "service_date": datetime.now(timezone.utc).date().isoformat(),
    }

    payer = _get_payer(run_id)
    result = payer.adjudicate(submission)

    attempt_label = "" if retry_count == 0 else f" (retry {retry_count})"

    pa_request = {
        "member_id": context["member_id"],
        "insurer": context["insurer"],
        "cpt_code": coding["cpt_code"],
        "primary_icd10": coding["primary_icd10"],
        "secondary_icd10": coding.get("secondary_icd10", []),
        "status": result["status"],
        "auth_number": result.get("auth_number"),
        "valid_through": result.get("valid_through"),
        "denial_code": result.get("denial_code"),
        "denial_reason": result.get("denial_reason"),
        "denial_description": result.get("denial_description"),
        "submitted_at": datetime.now(timezone.utc).isoformat(),
    }

    if result["status"] == "approved":
        decision: AgentDecision = {
            "agent": "submitter",
            "status": "approved",
            "decision": f"APPROVED{attempt_label} — Auth# {result['auth_number']}",
            "reasoning": (
                f"Submitted PA for CPT {coding['cpt_code']} with primary diagnosis "
                f"{coding['primary_icd10']} to {context['insurer']}. The payer approved "
                f"the request. Authorization {result['auth_number']} is valid through "
                f"{result.get('valid_through')}."
            ),
            "data_used": ["PA submission packet", "Payer adjudication response"],
            "confidence": 1.0,
            "details": pa_request,
        }
        return {
            "pa_request": pa_request,
            "agent_trace": [decision],
            "final_status": "approved",
            "final_auth_number": result["auth_number"],
        }

    # Denied
    decision = {
        "agent": "submitter",
        "status": "denied",
        "decision": f"DENIED{attempt_label} — {result['denial_code']}",
        "reasoning": (
            f"Submitted PA for CPT {coding['cpt_code']} (primary dx {coding['primary_icd10']}) "
            f"to {context['insurer']}. The payer denied it: "
            f"{result['denial_code']} — {result['denial_reason']}"
        ),
        "data_used": ["PA submission packet", "Payer adjudication response"],
        "confidence": 1.0,
        "details": pa_request,
    }
    return {"pa_request": pa_request, "agent_trace": [decision]}
