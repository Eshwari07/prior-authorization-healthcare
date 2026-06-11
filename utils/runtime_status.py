"""Process-wide runtime status for reliability transparency.

Records provider fallback events (LLM and retrieval) so the UI can surface an
accessible banner when the system degrades from its primary Microsoft Foundry /
Foundry IQ path to the OpenRouter / Qdrant fallbacks. Thread-safe; keeps only a
short rolling window of recent events.
"""
from __future__ import annotations

import threading
import time

import config

_lock = threading.Lock()
_events: list[dict] = []
_MAX_EVENTS = 50


def record_fallback(kind: str, detail: str) -> None:
    """Record that a primary provider failed and a fallback was used.

    kind: "llm" or "retrieval".
    """
    with _lock:
        _events.append({"ts": time.time(), "kind": kind, "detail": detail})
        if len(_events) > _MAX_EVENTS:
            del _events[: len(_events) - _MAX_EVENTS]


def recent(window_seconds: int = 600) -> list[dict]:
    cutoff = time.time() - window_seconds
    with _lock:
        return [
            {**e, "age_seconds": round(time.time() - e["ts"])}
            for e in _events
            if e["ts"] >= cutoff
        ]


def snapshot(window_seconds: int = 600) -> dict:
    """Effective providers + any recent fallback events for the status banner."""
    fallbacks = recent(window_seconds)
    return {
        "llm_provider": config.LLM_PROVIDER,
        "retrieval_provider": config.RETRIEVAL_PROVIDER,
        "degraded": len(fallbacks) > 0,
        "fallbacks": fallbacks,
    }
