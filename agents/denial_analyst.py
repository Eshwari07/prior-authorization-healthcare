"""Agent 4 — Denial Analyst (Model B + Qdrant RAG over denial history).

The core agentic component. On denial, it diagnoses the root cause using the
denial code plus RAG over similar past denials, then either corrects the coding
and signals a retry, or (when retries are exhausted or the issue is a plan
exclusion) generates an appeal letter and escalates.
"""
from __future__ import annotations

from graph.state import AgentDecision
from utils import data_loader, llm_client
from vector_store import qdrant_store


def _generate_appeal_letter(context: dict, coding: dict, pa_request: dict) -> str:
    prompt = f"""Draft a concise, professional prior-authorization appeal letter.

Patient: {context['name']} (DOB {context['dob']})
Insurer: {context['insurer']} — {context.get('plan_name', '')}
Member ID: {context['member_id']}
Procedure: CPT {coding['cpt_code']} — {coding['cpt_description']}
Primary diagnosis: {coding['primary_icd10']} — {coding.get('primary_icd10_description', '')}
Denial: {pa_request['denial_code']} — {pa_request['denial_reason']}
Clinical justification: {coding.get('clinical_justification', '')}

Write a 1-paragraph appeal arguing medical necessity. Return plain text only."""
    try:
        resp = llm_client.get_model_b().invoke(prompt)
        return resp.content.strip()
    except Exception as exc:  # noqa: BLE001
        return f"[Appeal letter generation failed: {exc}]"


def run(state: dict) -> dict:
    context = state["patient_context"]
    coding = state["coding_result"]
    pa_request = state["pa_request"]
    retry_count = state.get("retry_count", 0)
    max_retries = state.get("max_retries", 3)

    denial_code = pa_request.get("denial_code", "")
    denial_reason = pa_request.get("denial_reason", "")

    # RAG: find similar resolved denials
    similar = qdrant_store.search_denials(
        f"Denial {denial_code} on {coding['cpt_code']}: {denial_reason}", top_k=5
    )
    similar_brief = [
        {
            "denial_code": s.get("denial_code"),
            "cpt_code": s.get("cpt_code"),
            "resolution": s.get("resolution"),
            "corrected_primary_icd10": s.get("corrected_primary_icd10"),
            "corrected_modifier": s.get("corrected_modifier"),
            "action": s.get("action"),
        }
        for s in similar
    ]

    # PR-96 (plan exclusion) and CO-22 (other payer) are not fixable by recoding
    unfixable = denial_code in {"PR-96", "CO-22"}
    retries_exhausted = retry_count + 1 >= max_retries

    prompt = f"""You are a senior medical billing specialist analyzing a prior-authorization denial.

Denial code: {denial_code}
Denial meaning: {data_loader.DENIAL_CODES.get(denial_code, 'unknown')}
Payer message: {denial_reason}

Currently submitted:
  CPT/HCPCS: {coding['cpt_code']} — {coding['cpt_description']}
  Primary ICD-10: {coding['primary_icd10']} — {coding.get('primary_icd10_description', '')}
  Secondary ICD-10: {coding.get('secondary_icd10', [])}
  Modifiers: {coding.get('modifiers', [])}
  Typical valid modifiers for this code: {coding.get('typical_modifiers', 'none')}

Patient active conditions: {[{'code': c['code'], 'desc': c['display']} for c in context.get('conditions', [])]}

Similar past denials and how they were resolved (from history):
{similar_brief}

Retry attempt {retry_count + 1} of {max_retries}.

Diagnose the ROOT CAUSE and decide a corrective action. If the denial is a plan
exclusion or coordination-of-benefits issue, recommend "appeal". Otherwise prefer
"recode" with a concrete correction.

Respond ONLY with JSON:
{{
  "root_cause": "<one sentence>",
  "corrective_action": "recode" | "appeal",
  "corrected_primary_icd10": "<code or null>",
  "corrected_secondary_icd10": ["<code>", ...] ,
  "corrected_modifiers": ["<modifier>", ...],
  "reasoning": "<explanation referencing the denial code and any similar case>",
  "confidence": <0.0-1.0>
}}"""

    try:
        data = llm_client.invoke_json(llm_client.get_model_b(), prompt)
    except Exception as exc:  # noqa: BLE001
        data = {
            "root_cause": f"Analysis failed: {exc}",
            "corrective_action": "appeal",
            "reasoning": "Falling back to escalation due to analysis error.",
            "confidence": 0.0,
        }

    action = data.get("corrective_action", "recode")
    if unfixable:
        action = "appeal"

    # Apply correction to the coding result for the next retry
    corrected_coding = dict(coding)
    correction_summary = []
    if action == "recode":
        new_primary = data.get("corrected_primary_icd10")
        if new_primary and new_primary != coding["primary_icd10"]:
            # demote old primary into secondary
            secondary = list(coding.get("secondary_icd10", []))
            if coding["primary_icd10"] and coding["primary_icd10"] not in secondary:
                secondary.insert(0, coding["primary_icd10"])
            corrected_coding["primary_icd10"] = new_primary
            corrected_coding["secondary_icd10"] = data.get(
                "corrected_secondary_icd10"
            ) or secondary
            correction_summary.append(
                f"primary ICD-10 {coding['primary_icd10']} → {new_primary}"
            )
        new_mods = data.get("corrected_modifiers") or []
        if new_mods and new_mods != coding.get("modifiers"):
            corrected_coding["modifiers"] = new_mods
            correction_summary.append(f"added modifier(s) {', '.join(new_mods)}")

    # Decide routing outcome
    if action == "appeal" or retries_exhausted:
        appeal = _generate_appeal_letter(context, coding, pa_request)
        decision: AgentDecision = {
            "agent": "denial_analyst",
            "status": "escalated",
            "decision": f"Escalating — {data.get('root_cause', denial_code)}",
            "reasoning": (
                f"{data.get('reasoning', '')} "
                + (
                    "This denial type cannot be resolved by recoding; "
                    if unfixable
                    else ""
                )
                + (
                    f"Retry limit ({max_retries}) reached. "
                    if retries_exhausted and not unfixable
                    else ""
                )
                + "Generated an appeal letter for human review."
            ),
            "data_used": [
                f"Denial code reference ({denial_code})",
                "Qdrant denial-history RAG",
            ],
            "confidence": round(float(data.get("confidence", 0.6)), 2),
            "details": {
                "root_cause": data.get("root_cause"),
                "similar_cases": similar_brief[:3],
            },
        }
        return {
            "denial_analysis": data,
            "retry_count": retry_count + 1,
            "agent_trace": [decision],
            "final_status": "escalated",
            "appeal_letter": appeal,
        }

    # Recode + retry
    decision = {
        "agent": "denial_analyst",
        "status": "analyzed",
        "decision": f"Recode + retry — {', '.join(correction_summary) or 'adjusted submission'}",
        "reasoning": (
            f"Root cause: {data.get('root_cause', '')}. {data.get('reasoning', '')} "
            f"Applying correction and resubmitting (attempt {retry_count + 2})."
        ),
        "data_used": [
            f"Denial code reference ({denial_code})",
            "Qdrant denial-history RAG",
            "Patient active conditions",
        ],
        "confidence": round(float(data.get("confidence", 0.7)), 2),
        "details": {
            "root_cause": data.get("root_cause"),
            "correction": correction_summary,
            "similar_cases": similar_brief[:3],
        },
    }
    return {
        "denial_analysis": data,
        "coding_result": corrected_coding,
        "retry_count": retry_count + 1,
        "agent_trace": [decision],
    }
