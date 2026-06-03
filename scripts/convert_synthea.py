"""Convert raw Synthea FHIR R4 bundles into compact patient files.

Synthea's full bundles are ~700KB each and store insurance in
ExplanationOfBenefit (no Coverage resource) with SNOMED-coded conditions. This
script reads them directly from the downloaded zip, selects patients that have
active conditions, and writes small bundles in the simplified format that
utils/fhir_parser.py already understands (Patient + Coverage + Condition).

Real data preserved: patient names, demographics, SNOMED conditions (with
display text), and the real payer from the EOB. The Coder agent maps the
condition display text to ICD-10 via RAG, so SNOMED codes need no crosswalk.

Usage:
    python -m scripts.convert_synthea --count 20
"""
from __future__ import annotations

import argparse
import json
import re
import zipfile
from pathlib import Path

import config

ZIP_PATH = config.ROOT_DIR / "_synthea_tmp" / "synthea_fhir.zip"

# Synthea payer names -> plan type (drives PA-requirement rules). NO_INSURANCE
# and blanks become an inactive coverage to exercise the ineligible path.
PLAN_TYPE_BY_INSURER = {
    "Medicare": "HMO",
    "Medicaid": "HMO",
    "Dual Eligible": "HMO",
    "Aetna": "PPO",
    "Humana": "PPO",
    "UnitedHealthcare": "PPO",
    "Cigna Health": "PPO",
    "Cigna": "PPO",
    "Anthem": "EPO",
    "Blue Cross Blue Shield": "PPO",
}


def _clean_name_part(part: str) -> str:
    """Strip Synthea's trailing digits, e.g. 'Robert854' -> 'Robert'."""
    return re.sub(r"\d+$", "", part).strip()


def _resources(bundle: dict, rtype: str) -> list[dict]:
    return [
        e["resource"]
        for e in bundle.get("entry", [])
        if e.get("resource", {}).get("resourceType") == rtype
    ]


def _patient_name(patient: dict) -> tuple[str, str]:
    names = patient.get("name", [])
    if not names:
        return "Unknown", "patient"
    n = names[0]
    given = " ".join(_clean_name_part(g) for g in n.get("given", []))
    family = _clean_name_part(n.get("family", ""))
    full = f"{given} {family}".strip()
    file_stub = re.sub(r"[^a-z0-9]+", "_", full.lower()).strip("_") or "patient"
    return full or "Unknown", file_stub


def _extract_insurer(bundle: dict) -> str | None:
    """Pull the payer name from the most recent ExplanationOfBenefit."""
    for eob in _resources(bundle, "ExplanationOfBenefit"):
        insurer = eob.get("insurer", {}).get("display")
        if insurer:
            return insurer
        for ins in eob.get("insurance", []):
            disp = ins.get("coverage", {}).get("display")
            if disp:
                return disp
    return None


def _extract_conditions(bundle: dict, limit: int = 6) -> list[dict[str, str]]:
    out = []
    seen = set()
    for cond in _resources(bundle, "Condition"):
        # Synthea marks resolved conditions with abatement; keep active ones
        if cond.get("abatementDateTime"):
            continue
        for coding in cond.get("code", {}).get("coding", []):
            code = coding.get("code", "")
            display = coding.get("display", "") or cond.get("code", {}).get("text", "")
            if display and display not in seen:
                seen.add(display)
                out.append(
                    {
                        "code": code,
                        "display": display,
                        "system": coding.get("system", ""),
                    }
                )
    return out[:limit]


def _build_compact_bundle(patient: dict, name: str, insurer: str | None,
                          conditions: list[dict]) -> dict:
    pid = patient.get("id", "unknown")
    has_insurance = bool(insurer) and insurer.upper() != "NO_INSURANCE"
    plan_type = PLAN_TYPE_BY_INSURER.get(insurer or "", "PPO")
    plan_name = f"{insurer} {plan_type}" if has_insurance else "Uninsured"

    cond_resources = []
    for i, c in enumerate(conditions):
        cond_resources.append(
            {
                "resource": {
                    "resourceType": "Condition",
                    "id": f"cond-{pid}-{i}",
                    "clinicalStatus": {"coding": [{"code": "active"}]},
                    "code": {
                        "coding": [
                            {
                                "system": c["system"],
                                "code": c["code"],
                                "display": c["display"],
                            }
                        ],
                        "text": c["display"],
                    },
                    "subject": {"reference": f"Patient/{pid}"},
                }
            }
        )

    coverage = {
        "resource": {
            "resourceType": "Coverage",
            "id": f"coverage-{pid}",
            "status": "active" if has_insurance else "cancelled",
            "type": {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
                        "code": plan_type,
                    }
                ]
            },
            "subscriberId": f"SYN{pid[:8].upper()}",
            "beneficiary": {"reference": f"Patient/{pid}"},
            "payor": [{"display": insurer if has_insurance else "None"}],
            "class": [
                {"type": {"coding": [{"code": "plan"}]}, "name": plan_name}
            ],
        }
    }

    return {
        "resourceType": "Bundle",
        "type": "collection",
        "entry": [
            {
                "resource": {
                    "resourceType": "Patient",
                    "id": pid,
                    "name": [
                        {
                            "use": "official",
                            "family": name.split()[-1] if name.split() else name,
                            "given": name.split()[:-1] or [name],
                        }
                    ],
                    "gender": patient.get("gender", "unknown"),
                    "birthDate": patient.get("birthDate", "Unknown"),
                    "address": patient.get("address", []),
                }
            },
            coverage,
            *cond_resources,
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--count", type=int, default=20)
    parser.add_argument("--min-conditions", type=int, default=1)
    args = parser.parse_args()

    if not ZIP_PATH.exists():
        print(f"[FAIL] {ZIP_PATH} not found. Download the Synthea zip first.")
        return 1

    written = 0
    skipped_no_cond = 0
    with zipfile.ZipFile(ZIP_PATH) as zf:
        names = [
            n
            for n in zf.namelist()
            if n.endswith(".json")
            and "hospitalInformation" not in n
            and "practitionerInformation" not in n
        ]
        names.sort()
        for entry in names:
            if written >= args.count:
                break
            try:
                bundle = json.loads(zf.read(entry).decode("utf-8"))
            except Exception:  # noqa: BLE001
                continue
            patients = _resources(bundle, "Patient")
            if not patients:
                continue
            patient = patients[0]
            conditions = _extract_conditions(bundle)
            if len(conditions) < args.min_conditions:
                skipped_no_cond += 1
                continue
            name, stub = _patient_name(patient)
            insurer = _extract_insurer(bundle)
            compact = _build_compact_bundle(patient, name, insurer, conditions)

            out_path = config.PATIENTS_DIR / f"synthea_{stub}.json"
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(compact, f, indent=2)
            written += 1
            print(
                f"  {name:<28} | {insurer or 'NO_INSURANCE':<22} | "
                f"{len(conditions)} conditions -> {out_path.name}"
            )

    print(f"\nWrote {written} Synthea patients "
          f"(skipped {skipped_no_cond} with < {args.min_conditions} conditions).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
