"""Retrieval facade — selects the knowledge backend at runtime.

Agents import this module instead of a concrete store so the retrieval engine
can be switched via ``config.RETRIEVAL_PROVIDER``:

- ``foundry_iq`` → Azure AI Search (Microsoft Foundry IQ knowledge retrieval)
- ``qdrant``     → Qdrant Cloud (fallback)

Both backends expose the same function names and return ``list[dict]`` hits with
a ``score`` key; the Foundry IQ backend additionally includes a ``citation``.
"""
from __future__ import annotations

import config


def _use_foundry() -> bool:
    return config.RETRIEVAL_PROVIDER == "foundry_iq"


def _dispatch(method: str, *args, **kwargs):
    """Call the active backend, falling back to Qdrant if Foundry IQ errors.

    Any Foundry IQ failure is recorded so the UI can show a reliability banner.
    """
    if _use_foundry():
        try:
            from foundry_iq import search_store

            return getattr(search_store, method)(*args, **kwargs)
        except Exception as exc:  # noqa: BLE001
            from utils import runtime_status

            runtime_status.record_fallback(
                "retrieval",
                f"Foundry IQ ({method}) failed ({exc}); used Qdrant fallback.",
            )
            from vector_store import qdrant_store

            return getattr(qdrant_store, method)(*args, **kwargs)
    from vector_store import qdrant_store

    return getattr(qdrant_store, method)(*args, **kwargs)


def search_procedures(query: str, top_k: int = 5) -> list[dict]:
    return _dispatch("search_procedures", query, top_k=top_k)


def search_icd10(query: str, top_k: int = 10) -> list[dict]:
    return _dispatch("search_icd10", query, top_k=top_k)


def search_denials(query: str, top_k: int = 5) -> list[dict]:
    return _dispatch("search_denials", query, top_k=top_k)


def add_denial_resolution(case: dict) -> None:
    _dispatch("add_denial_resolution", case)


def provider_label() -> str:
    """Human-readable name of the active backend (for agent_trace/data_used)."""
    return (
        "Foundry IQ knowledge base (Azure AI Search)"
        if _use_foundry()
        else "Qdrant vector store"
    )
