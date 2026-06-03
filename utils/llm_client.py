"""OpenRouter LLM client factory.

Provides Model A (fast/cheap) and Model B (strong reasoning) via LangChain's
ChatOpenAI pointed at OpenRouter's OpenAI-compatible endpoint. Includes an
automatic fallback to a free model if the primary call fails or rate-limits,
plus a structured-JSON helper used by all agents.
"""
from __future__ import annotations

import json
import re
from typing import Any

from langchain_openai import ChatOpenAI

import config


def _make_llm(model: str, temperature: float = 0.0) -> ChatOpenAI:
    config.require("OPENROUTER_API_KEY")
    if not model:
        raise RuntimeError(
            "Model name is empty. Set OPENROUTER_MODEL_A / OPENROUTER_MODEL_B "
            "in your .env or Streamlit secrets."
        )
    return ChatOpenAI(
        model=model,
        temperature=temperature,
        api_key=config.OPENROUTER_API_KEY,
        base_url=config.OPENROUTER_BASE_URL,
        timeout=60,
        max_retries=1,
        default_headers={
            "HTTP-Referer": "https://prior-auth-agent.vercel.app",
            "X-Title": "Prior Auth Agent",
        },
    )


def get_model_a(temperature: float = 0.0) -> ChatOpenAI:
    """Fast/cheap model for Agents 1 & 2 (eligibility, coding)."""
    return _make_llm(config.OPENROUTER_MODEL_A, temperature)


def get_model_b(temperature: float = 0.0) -> ChatOpenAI:
    """Strong reasoning model for Agents 3 & 4 (submission, denial analysis)."""
    return _make_llm(config.OPENROUTER_MODEL_B, temperature)


def get_fallback(temperature: float = 0.0) -> ChatOpenAI:
    """Free fallback model used when a primary model call fails."""
    return _make_llm(config.OPENROUTER_FALLBACK, temperature)


def _extract_json(text: str) -> dict[str, Any]:
    """Extract the first JSON object from an LLM response (handles code fences)."""
    text = text.strip()
    # Strip ```json ... ``` fences if present
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fence:
        text = fence.group(1)
    else:
        brace = re.search(r"\{.*\}", text, re.DOTALL)
        if brace:
            text = brace.group(0)
    return json.loads(text)


def invoke_json(
    llm: ChatOpenAI,
    prompt: str,
    *,
    use_fallback_on_error: bool = True,
) -> dict[str, Any]:
    """Invoke an LLM expecting a JSON object response. Falls back to the free
    model on any error (rate limit, timeout, malformed JSON)."""
    try:
        resp = llm.invoke(prompt)
        return _extract_json(resp.content)
    except Exception as primary_exc:  # noqa: BLE001
        if not use_fallback_on_error:
            raise
        try:
            resp = get_fallback().invoke(prompt)
            data = _extract_json(resp.content)
            data["_used_fallback"] = True
            return data
        except Exception as fallback_exc:  # noqa: BLE001
            raise RuntimeError(
                f"Both primary and fallback models failed. "
                f"Primary: {primary_exc}. Fallback: {fallback_exc}."
            ) from fallback_exc
