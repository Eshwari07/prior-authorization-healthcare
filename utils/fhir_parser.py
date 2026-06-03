"""Parser for Synthea FHIR R4 patient bundles.

Extracts the fields the agents need: demographics, insurance coverage, and
active conditions (ICD-10 coded). Tolerant of both Synthea's full export format
and the compact sample bundles in data/patients/.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any


def _resources(bundle: dict, resource_type: str) -> list[dict]:
    """Return all resources of a given type from a FHIR Bundle."""
    out = []
    for entry in bundle.get("entry", []):
        res = entry.get("resource", {})
        if res.get("resourceType") == resource_type:
            out.append(res)
    return out


def _strip_digits(part: str) -> str:
    """Remove Synthea's trailing numeric suffixes, e.g. 'Robert854' -> 'Robert'."""
    return re.sub(r"\d+$", "", part).strip()


def _patient_name(patient: dict) -> str:
    names = patient.get("name", [])
    if not names:
        return "Unknown"
    name = names[0]
    given = " ".join(_strip_digits(g) for g in name.get("given", []))
    family = _strip_digits(name.get("family", ""))
    full = f"{given} {family}".strip()
    return full or "Unknown"


def _coverage_status_active(coverage: dict) -> bool:
    return coverage.get("status", "").lower() == "active"


def _plan_type(coverage: dict) -> str:
    coding = coverage.get("type", {}).get("coding", [])
    if coding:
        return coding[0].get("code", "Unknown")
    return "Unknown"


def _insurer(coverage: dict) -> str:
    payors = coverage.get("payor", [])
    if payors:
        # Synthea uses either display text or a reference
        return payors[0].get("display") or payors[0].get("reference", "Unknown")
    return "Unknown"


def _plan_name(coverage: dict) -> str:
    for cls in coverage.get("class", []):
        if cls.get("name"):
            return cls["name"]
        if cls.get("value"):
            return cls["value"]
    return _plan_type(coverage)


def _conditions(bundle: dict) -> list[dict[str, str]]:
    out = []
    for cond in _resources(bundle, "Condition"):
        status = cond.get("clinicalStatus", {}).get("coding", [{}])
        is_active = any(c.get("code") == "active" for c in status) if status else True
        if not is_active:
            continue
        for coding in cond.get("code", {}).get("coding", []):
            out.append(
                {
                    "code": coding.get("code", ""),
                    "display": coding.get("display", "")
                    or cond.get("code", {}).get("text", ""),
                }
            )
    return out


def _medications(bundle: dict) -> list[str]:
    out = []
    for med in _resources(bundle, "MedicationRequest"):
        text = med.get("medicationCodeableConcept", {}).get("text")
        if text:
            out.append(text)
    return out


def parse_fhir_bundle(path: str | Path) -> dict[str, Any]:
    """Parse a Synthea FHIR bundle file into a flat patient dict."""
    path = Path(path)
    with open(path, "r", encoding="utf-8") as f:
        bundle = json.load(f)

    patients = _resources(bundle, "Patient")
    if not patients:
        raise ValueError(f"No Patient resource found in {path.name}")
    patient = patients[0]

    coverages = _resources(bundle, "Coverage")
    coverage = coverages[0] if coverages else {}

    return {
        "patient_id": patient.get("id", path.stem),
        "name": _patient_name(patient),
        "dob": patient.get("birthDate", "Unknown"),
        "gender": patient.get("gender", "Unknown"),
        "insurer": _insurer(coverage) if coverage else "None",
        "member_id": coverage.get("subscriberId", "Unknown") if coverage else "Unknown",
        "plan_type": _plan_type(coverage) if coverage else "None",
        "plan_name": _plan_name(coverage) if coverage else "None",
        "coverage_active": _coverage_status_active(coverage) if coverage else False,
        "coverage_period": coverage.get("period", {}) if coverage else {},
        "conditions": _conditions(bundle),
        "medications": _medications(bundle),
        "source_file": path.name,
    }


def list_patients(patients_dir: str | Path) -> list[dict[str, str]]:
    """Return a lightweight list of available patients for a UI dropdown."""
    patients_dir = Path(patients_dir)
    out = []
    for file in sorted(patients_dir.glob("*.json")):
        try:
            data = parse_fhir_bundle(file)
            out.append(
                {
                    "file": file.name,
                    "patient_id": data["patient_id"],
                    "name": data["name"],
                    "dob": data["dob"],
                    "insurer": data["insurer"],
                    "plan_name": data["plan_name"],
                    "coverage_active": data["coverage_active"],
                }
            )
        except Exception as exc:  # noqa: BLE001
            out.append({"file": file.name, "name": f"[parse error: {exc}]"})
    return out


def find_patient_by_name(patients_dir: str | Path, query: str) -> Path | None:
    """Find a patient by name. Matches if every token in the query appears in the
    patient's name (handles middle names, e.g. 'Jane Doe' -> 'Jane Elizabeth Doe'),
    or if the query matches the patient id. Case-insensitive."""
    query = query.strip().lower()
    if not query:
        return None
    tokens = query.split()
    for file in Path(patients_dir).glob("*.json"):
        try:
            data = parse_fhir_bundle(file)
        except Exception:  # noqa: BLE001
            continue
        name = data["name"].lower()
        if query in data["patient_id"].lower():
            return file
        if all(tok in name for tok in tokens):
            return file
    return None
