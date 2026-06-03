"""Agent 1 — Eligibility Verifier (Model A).

Loads the patient FHIR bundle, confirms active coverage, and determines whether
the requested procedure requires prior authorization under the patient's plan.
Returns an AgentDecision with transparent reasoning. Halts the workflow early
(ineligible / no-PA-needed) when appropriate.
"""
from __future__ import annotations

import config
from graph.state import AgentDecision
from utils import data_loader, llm_client
from utils.fhir_parser import find_patient_by_name, parse_fhir_bundle


def _classify_procedure_category(procedure_request: str) -> tuple[str, float, str]:
    """Use Model A to map a plain-English procedure to one of the known categories."""
    categories = sorted(
        {p["category"] for p in data_loader.load_procedures()}
    )
    prompt = f"""You are a healthcare prior-authorization triage assistant.
Classify the requested procedure into exactly ONE of these categories:
{", ".join(categories)}

Procedure request: "{procedure_request}"

Respond ONLY with JSON:
{{"category": "<one category from the list>", "confidence": <0.0-1.0>, "reasoning": "<one sentence>"}}"""
    try:
        data = llm_client.invoke_json(llm_client.get_model_a(), prompt)
        return (
            data.get("category", "Unknown"),
            float(data.get("confidence", 0.5)),
            data.get("reasoning", ""),
        )
    except Exception as exc:  # noqa: BLE001
        return "Unknown", 0.0, f"Classification failed: {exc}"


def run(state: dict) -> dict:
    patient_query = state["patient_query"]
    procedure_request = state["procedure_request"]

    # 1. Locate the patient FHIR bundle
    path = find_patient_by_name(config.PATIENTS_DIR, patient_query)
    if path is None:
        decision: AgentDecision = {
            "agent": "eligibility",
            "status": "ineligible",
            "decision": "Patient not found",
            "reasoning": (
                f'No patient matching "{patient_query}" was found in the FHIR records. '
                f"Verify the spelling or member name."
            ),
            "data_used": ["FHIR patient directory"],
            "confidence": 1.0,
            "details": {},
        }
        return {
            "patient_context": None,
            "agent_trace": [decision],
            "final_status": "ineligible",
        }

    context = parse_fhir_bundle(path)

    # 2. Check active coverage
    if not context["coverage_active"]:
        period = context.get("coverage_period", {})
        decision = {
            "agent": "eligibility",
            "status": "ineligible",
            "decision": "Coverage inactive",
            "reasoning": (
                f"{context['name']}'s {context['insurer']} coverage is not active "
                f"(coverage period {period.get('start', '?')} to {period.get('end', '?')}). "
                f"Prior authorization cannot proceed without active coverage."
            ),
            "data_used": ["Coverage resource (status, period)"],
            "confidence": 1.0,
            "details": {"insurer": context["insurer"], "period": period},
        }
        return {
            "patient_context": context,
            "agent_trace": [decision],
            "final_status": "ineligible",
        }

    # 3. Classify procedure and check PA requirement
    category, cat_conf, cat_reason = _classify_procedure_category(procedure_request)
    pa_required = data_loader.pa_required_for(category, context["plan_type"])
    context["requesting_procedure"] = procedure_request
    context["procedure_category"] = category
    context["pa_required"] = pa_required

    conditions_str = ", ".join(
        f"{c['code']} ({c['display']})" for c in context["conditions"]
    ) or "none recorded"

    if not pa_required:
        decision = {
            "agent": "eligibility",
            "status": "eligible",
            "decision": "No prior authorization required",
            "reasoning": (
                f"{context['name']} has active {context['plan_name']} coverage. "
                f'The requested "{procedure_request}" maps to category "{category}", '
                f"which does not require PA under a {context['plan_type']} plan. "
                f"The procedure may proceed without authorization."
            ),
            "data_used": [
                "Coverage resource",
                "PA requirement ruleset",
                f"procedure category: {category}",
            ],
            "confidence": round(min(cat_conf, 0.95), 2),
            "details": {
                "pa_required": False,
                "category": category,
                "insurer": context["insurer"],
                "plan_type": context["plan_type"],
            },
        }
        return {
            "patient_context": context,
            "agent_trace": [decision],
            "final_status": "approved",
            "final_auth_number": "N/A — PA not required",
        }

    # 4. Eligible and PA is required → continue to coder
    decision = {
        "agent": "eligibility",
        "status": "eligible",
        "decision": "Coverage active — PA required",
        "reasoning": (
            f"{context['name']} (DOB {context['dob']}) has active {context['plan_name']} "
            f"coverage with {context['insurer']}. Active conditions: {conditions_str}. "
            f'The requested "{procedure_request}" maps to category "{category}", which '
            f"requires prior authorization under a {context['plan_type']} plan. Proceeding to coding."
        ),
        "data_used": [
            "Patient resource (name, DOB)",
            "Coverage resource (insurer, plan, status)",
            "Condition resources (active ICD-10)",
            "PA requirement ruleset",
        ],
        "confidence": round(min(cat_conf, 0.95), 2),
        "details": {
            "pa_required": True,
            "category": category,
            "insurer": context["insurer"],
            "plan_type": context["plan_type"],
            "category_reasoning": cat_reason,
        },
    }
    return {"patient_context": context, "agent_trace": [decision]}
