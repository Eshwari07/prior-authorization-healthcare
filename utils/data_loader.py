"""Loaders for reference data: ICD-10 codes, procedure (HCPCS/CPT) codes,
PA requirement rules, and denial reason codes (CARCs)."""
from __future__ import annotations

import csv
import json
from functools import lru_cache
from pathlib import Path

import config


# ─── Denial reason codes (X12 CARC standard subset) ───────────────
DENIAL_CODES: dict[str, str] = {
    "CO-4": "Procedure code inconsistent with modifier — check/add modifier (e.g. laterality LT/RT, -59)",
    "CO-11": "Diagnosis inconsistent with procedure — primary ICD-10 does not support the CPT/HCPCS code",
    "CO-22": "Service may be covered by another payer per coordination of benefits",
    "CO-97": "Service already adjudicated — duplicate submission",
    "CO-167": "Diagnosis not covered — primary ICD-10 not in payer's covered list for this procedure",
    "CO-B7": "Prior authorization was not obtained before the service",
    "PR-96": "Non-covered charge — plan exclusion for this procedure",
}


def insert_icd_decimal(code: str) -> str:
    """Format a raw ICD-10-CM code (no decimal) for display, e.g. M5116 -> M51.16."""
    code = code.strip().upper()
    if len(code) > 3:
        return f"{code[:3]}.{code[3:]}"
    return code


def strip_icd_decimal(code: str) -> str:
    """Normalize an ICD-10 code by removing the decimal, e.g. M51.16 -> M5116."""
    return code.replace(".", "").strip().upper()


@lru_cache(maxsize=1)
def load_icd10() -> dict[str, str]:
    """Load ICD-10-CM billable codes. Returns {code_no_decimal: description}.

    Reads from data/icd10_codes/icd10cm_codes_2024.txt if present, otherwise
    falls back to the original CMS folder at the project root.
    """
    candidates = [
        config.ICD10_DIR / "icd10cm_codes_2024.txt",
        config.ROOT_DIR / "FY24-CMS-1785-F-Code-Descriptions" / "icd10cm_codes_2024.txt",
    ]
    path = next((p for p in candidates if p.exists()), None)
    if path is None:
        return {}

    codes: dict[str, str] = {}
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.rstrip("\n")
            if not line.strip():
                continue
            parts = line.split(None, 1)  # split on first run of whitespace
            if len(parts) == 2:
                code, desc = parts
                codes[code.strip().upper()] = desc.strip()
    return codes


@lru_cache(maxsize=1)
def load_procedures() -> list[dict[str, str]]:
    """Load procedure (HCPCS/CPT) codes from data/hcpcs_codes/procedures.csv."""
    path = config.PROCEDURES_FILE
    if not path.exists():
        return []
    rows: list[dict[str, str]] = []
    with open(path, "r", encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            rows.append(
                {
                    "code": row["code"].strip(),
                    "description": row["description"].strip(),
                    "category": row.get("category", "").strip(),
                    "typical_modifiers": row.get("typical_modifiers", "").strip(),
                }
            )
    return rows


@lru_cache(maxsize=1)
def procedure_by_code() -> dict[str, dict[str, str]]:
    return {p["code"]: p for p in load_procedures()}


@lru_cache(maxsize=1)
def load_pa_rules() -> dict:
    """Load the PA requirement ruleset JSON."""
    if not config.PA_RULES_FILE.exists():
        return {}
    with open(config.PA_RULES_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def pa_required_for(category: str, plan_type: str) -> bool:
    """Determine whether a procedure category requires PA under a given plan type."""
    rules = load_pa_rules()
    base = set(rules.get("pa_required_categories", []))
    override = rules.get("plan_overrides", {}).get(plan_type.upper(), {})
    base |= set(override.get("additional_pa_categories", []))
    return category in base


def is_procedure_covered(insurer: str, code: str) -> bool:
    """Check the mock payer coverage rules: is this (insurer, code) excluded?"""
    rules = load_pa_rules()
    non_covered = rules.get("non_covered_examples", {})
    excluded = non_covered.get(insurer, [])
    return code not in excluded


def load_seed_denials() -> list[dict]:
    """Load synthetic denial resolution cases for the RAG cold-start seed."""
    if not config.SEED_DENIALS_FILE.exists():
        return []
    with open(config.SEED_DENIALS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def is_symptom_code(icd_code: str) -> bool:
    """Heuristic: symptom/sign codes (Chapter R) and common non-specific pain codes
    are not accepted as primary diagnosis for advanced procedures."""
    code = strip_icd_decimal(icd_code)
    if code.startswith("R"):
        return True
    # Common low-specificity symptom codes
    symptom_codes = {"M545", "M2550", "M25561", "M25562", "M79", "M796", "M7918"}
    return code in symptom_codes
