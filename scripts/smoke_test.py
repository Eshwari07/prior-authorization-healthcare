"""End-to-end smoke test of the PA agentic pipeline.

Usage:
    python -m scripts.smoke_test "Jane Doe" "MRI of the lower back"
"""
from __future__ import annotations

import sys

from agents import submitter
from graph.pa_graph import build_graph, initial_state


def main() -> int:
    patient = sys.argv[1] if len(sys.argv) > 1 else "Jane Doe"
    procedure = sys.argv[2] if len(sys.argv) > 2 else "MRI of the lower back"

    print(f"\n=== Running PA workflow: {patient!r} / {procedure!r} ===\n")
    graph = build_graph()
    state = initial_state(patient, procedure)
    submitter.reset_payer(state["run_id"])

    final = graph.invoke(state)

    for t in final.get("agent_trace", []):
        print(f"[{t['agent']:<14}] {t['status']:<10} {t['decision']}")
        print(f"   reasoning: {t.get('reasoning', '')[:200]}")
        print()

    print(f"=== FINAL STATUS: {final.get('final_status')} ===")
    if final.get("final_auth_number"):
        print(f"Auth #: {final['final_auth_number']}")
    if final.get("retry_count"):
        print(f"Retries: {final['retry_count']}")
    if final.get("appeal_letter"):
        print(f"\nAppeal letter:\n{final['appeal_letter'][:500]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
