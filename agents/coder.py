"""Agent 2 — Prior Auth Coder (fast Foundry model + Foundry IQ RAG).

Maps the plain-English procedure to a CPT/HCPCS code via semantic search, selects
supporting ICD-10 diagnosis codes from the patient's active conditions, and
generates a clinical justification. Returns an AgentDecision with reasoning.
"""
from __future__ import annotations

from graph.state import AgentDecision
from utils import data_loader, llm_client, retrieval


def run(state: dict) -> dict:
    context = state["patient_context"]
    procedure_request = context["requesting_procedure"]
    conditions = context.get("conditions", [])

    # 1. Semantic search for candidate procedure codes
    cpt_candidates = retrieval.search_procedures(procedure_request, top_k=5)

    # 2. Semantic search for supporting ICD-10 codes (seeded by patient conditions)
    condition_text = " ".join(c["display"] for c in conditions) or procedure_request
    icd_query = f"{procedure_request}. Patient conditions: {condition_text}"
    icd_candidates = retrieval.search_icd10(icd_query, top_k=10)

    patient_condition_codes = [
        {"code": c["code"], "description": c["display"]} for c in conditions
    ]

    # 3. LLM selects and validates the best combination
    prompt = f"""You are a certified medical coder selecting codes for a prior authorization.

Requested procedure: "{procedure_request}"

Patient's active diagnoses (from FHIR record):
{patient_condition_codes}

Candidate procedure (CPT/HCPCS) codes from semantic search:
{[{"code": c["code"], "description": c["description"], "category": c.get("category")} for c in cpt_candidates]}

Candidate ICD-10 diagnosis codes from semantic search:
{[{"code": c["code"], "description": c["description"]} for c in icd_candidates]}

Select the single best CPT/HCPCS code and the most clinically specific PRIMARY
ICD-10 code that establishes medical necessity. Prefer the patient's own active
diagnoses when they support the procedure. Avoid vague symptom codes (e.g. low
back pain M54.5) as primary — use the underlying pathology instead.

Respond ONLY with JSON:
{{
  "cpt_code": "<code>",
  "cpt_description": "<description>",
  "primary_icd10": "<code>",
  "primary_icd10_description": "<description>",
  "secondary_icd10": ["<code>", ...],
  "clinical_justification": "<2-3 sentence medical necessity narrative>",
  "confidence": <0.0-1.0>,
  "reasoning": "<why these codes were chosen>"
}}"""

    try:
        data = llm_client.invoke_json(llm_client.get_model_a(), prompt)
    except Exception as exc:  # noqa: BLE001
        decision: AgentDecision = {
            "agent": "coder",
            "status": "escalated",
            "decision": "Coding failed",
            "reasoning": f"Could not determine codes: {exc}",
            "data_used": [f"{retrieval.provider_label()} (procedure + ICD-10)"],
            "confidence": 0.0,
            "details": {},
        }
        return {
            "coding_result": None,
            "agent_trace": [decision],
            "final_status": "escalated",
        }

    proc = data_loader.procedure_by_code().get(data.get("cpt_code", ""), {})
    coding_result = {
        "cpt_code": data.get("cpt_code", ""),
        "cpt_description": data.get("cpt_description", proc.get("description", "")),
        "primary_icd10": data.get("primary_icd10", ""),
        "primary_icd10_description": data.get("primary_icd10_description", ""),
        "secondary_icd10": data.get("secondary_icd10", []),
        "clinical_justification": data.get("clinical_justification", ""),
        "category": proc.get("category", context.get("procedure_category", "")),
        "typical_modifiers": proc.get("typical_modifiers", ""),
        "modifiers": [],
        "confidence": float(data.get("confidence", 0.7)),
    }

    top_score = cpt_candidates[0]["score"] if cpt_candidates else 0.0
    decision = {
        "agent": "coder",
        "status": "coded",
        "decision": (
            f"Mapped to CPT {coding_result['cpt_code']} — {coding_result['cpt_description']}"
        ),
        "reasoning": (
            f"{data.get('reasoning', '')} "
            f"Primary diagnosis {coding_result['primary_icd10']} "
            f"({coding_result['primary_icd10_description']}). "
            f"Top semantic match score: {top_score:.2f}."
        ),
        "data_used": [
            f"{retrieval.provider_label()} — procedure codes (RAG)",
            f"{retrieval.provider_label()} — ICD-10 codes (RAG)",
            "Patient active conditions",
        ],
        "confidence": round(coding_result["confidence"], 2),
        "details": {
            "cpt_code": coding_result["cpt_code"],
            "primary_icd10": coding_result["primary_icd10"],
            "secondary_icd10": coding_result["secondary_icd10"],
            "clinical_justification": coding_result["clinical_justification"],
            "citations": [
                c["citation"] for c in (cpt_candidates[:1] + icd_candidates[:3])
                if c.get("citation")
            ],
        },
    }
    return {"coding_result": coding_result, "agent_trace": [decision]}
