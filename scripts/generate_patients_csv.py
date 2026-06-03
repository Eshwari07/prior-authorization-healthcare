"""Generate a flat CSV of all patient data from the Synthea FHIR bundles.

Reads every *.json bundle in data/patients/ via the FHIR parser and writes a
single denormalized table to data/patients/patients.csv for display in the UI
reference panel.

Run:  python scripts/generate_patients_csv.py
"""
from __future__ import annotations

import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import config
from utils.fhir_parser import parse_fhir_bundle

CSV_PATH = config.PATIENTS_DIR / "patients.csv"

FIELDS = [
    "patient_id",
    "name",
    "dob",
    "gender",
    "insurer",
    "member_id",
    "plan_type",
    "plan_name",
    "coverage_active",
    "coverage_start",
    "coverage_end",
    "conditions",
    "medications",
    "source_file",
]


def _format_conditions(conditions: list[dict[str, str]]) -> str:
    parts = []
    for c in conditions:
        code = c.get("code", "").strip()
        display = c.get("display", "").strip()
        if code and display:
            parts.append(f"{code}: {display}")
        elif code:
            parts.append(code)
        elif display:
            parts.append(display)
    return " | ".join(parts)


def generate() -> None:
    rows = []
    for file in sorted(config.PATIENTS_DIR.glob("*.json")):
        try:
            data = parse_fhir_bundle(file)
        except Exception as exc:  # noqa: BLE001
            print(f"  skip {file.name}: {exc}")
            continue
        period = data.get("coverage_period") or {}
        rows.append(
            {
                "patient_id": data.get("patient_id", ""),
                "name": data.get("name", ""),
                "dob": data.get("dob", ""),
                "gender": data.get("gender", ""),
                "insurer": data.get("insurer", ""),
                "member_id": data.get("member_id", ""),
                "plan_type": data.get("plan_type", ""),
                "plan_name": data.get("plan_name", ""),
                "coverage_active": data.get("coverage_active", False),
                "coverage_start": period.get("start", ""),
                "coverage_end": period.get("end", ""),
                "conditions": _format_conditions(data.get("conditions", [])),
                "medications": "; ".join(data.get("medications", [])),
                "source_file": data.get("source_file", file.name),
            }
        )

    with open(CSV_PATH, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Wrote {len(rows)} patients to {CSV_PATH}")


if __name__ == "__main__":
    generate()
