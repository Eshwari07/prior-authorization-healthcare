"""Deterministic inline mock payer.

Replaces a separate FastAPI service — runs in the same process so it works
identically locally and on Streamlit Cloud. Validates real rules so that the
Denial Analyst agent's corrections actually fix denials (demonstrable intelligence).

Decision rules (checked in order):
  Rule 1: primary ICD-10 is a symptom code        -> DENY CO-11
  Rule 2: procedure excluded for this insurer      -> DENY PR-96
  Rule 3: procedure needs a modifier but none given -> DENY CO-4
  Rule 4: all checks pass                            -> APPROVE

Note: corrected resubmissions within the same workflow run are NOT treated as
duplicates (CO-97) — a corrected claim referencing the original is legitimate,
so duplicate detection would wrongly block the agent's valid retries.
"""
from __future__ import annotations

import uuid
from datetime import date

from utils import data_loader


class MockPayer:
    """Per-run payer that adjudicates a PA submission against deterministic rules."""

    def adjudicate(self, submission: dict) -> dict:
        insurer = submission.get("insurer", "")
        cpt_code = submission.get("cpt_code", "")
        primary_icd10 = submission.get("primary_diagnosis", "")
        modifiers = submission.get("modifiers", [])

        proc = data_loader.procedure_by_code().get(cpt_code, {})
        requires_modifier = bool(proc.get("typical_modifiers"))

        # Rule 1 — symptom code as primary diagnosis
        if data_loader.is_symptom_code(primary_icd10):
            return self._deny(
                "CO-11",
                f"Primary diagnosis {primary_icd10} is a symptom/sign code and does "
                f"not establish medical necessity for procedure {cpt_code}.",
            )

        # Rule 2 — plan exclusion
        if not data_loader.is_procedure_covered(insurer, cpt_code):
            return self._deny(
                "PR-96",
                f"Procedure {cpt_code} is excluded under the {insurer} plan.",
            )

        # Rule 3 — missing required modifier
        if requires_modifier and not modifiers:
            return self._deny(
                "CO-4",
                f"Procedure {cpt_code} requires a modifier "
                f"(expected one of: {proc.get('typical_modifiers')}) but none was supplied.",
            )

        # Rule 4 — approve
        return self._approve(cpt_code)

    @staticmethod
    def _deny(code: str, reason: str) -> dict:
        return {
            "status": "denied",
            "denial_code": code,
            "denial_reason": reason,
            "denial_description": data_loader.DENIAL_CODES.get(code, ""),
        }

    @staticmethod
    def _approve(cpt_code: str) -> dict:
        auth = f"AUTH-{cpt_code}-{uuid.uuid4().hex[:6].upper()}"
        return {
            "status": "approved",
            "auth_number": auth,
            "valid_through": f"{date.today().year}-12-31",
        }
