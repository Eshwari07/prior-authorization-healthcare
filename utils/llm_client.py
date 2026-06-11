"""LLM client factory (provider-pluggable).

Provides Model A (fast/cheap) and Model B (strong reasoning) via LangChain's
ChatOpenAI. The primary provider is selected by ``config.LLM_PROVIDER``:

- ``foundry``    → Azure AI Foundry (Azure OpenAI v1, OpenAI-compatible endpoint)
- ``openrouter`` → OpenRouter's OpenAI-compatible endpoint

Regardless of provider, a free OpenRouter model is used as an automatic
fallback when a primary call fails or rate-limits. A structured-JSON helper
used by all agents is included; its contract is unchanged.
"""
from __future__ import annotations

import json
import re
from typing import Any

from langchain_openai import ChatOpenAI

import config


def _make_openrouter_llm(model: str, temperature: float = 0.0) -> ChatOpenAI:
    config.require("OPENROUTER_API_KEY")
    if not model:
        raise RuntimeError(
            "Model name is empty. Set OPENROUTER_MODEL_A / OPENROUTER_MODEL_B "
            "in your .env."
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


def _make_azure_llm(model: str, temperature: float = 0.0) -> ChatOpenAI:
    """Azure AI Foundry via the OpenAI-compatible Azure OpenAI v1 endpoint.

    ``model`` is the Foundry *deployment name* (e.g. ``gpt-4o``). The endpoint
    must end in ``/openai/v1`` so the OpenAI SDK can talk to it directly.
    """
    config.require("AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_API_KEY")
    if not model:
        raise RuntimeError(
            "Azure deployment name is empty. Set AZURE_MODEL_FAST / "
            "AZURE_MODEL_REASONING in your .env."
        )
    return ChatOpenAI(
        model=model,
        temperature=temperature,
        api_key=config.AZURE_OPENAI_API_KEY,
        base_url=config.AZURE_OPENAI_ENDPOINT,
        timeout=60,
        max_retries=1,
    )


def _make_primary(fast: bool, temperature: float) -> ChatOpenAI:
    """Build a primary LLM for the active provider. ``fast`` selects Model A."""
    if config.LLM_PROVIDER == "foundry":
        model = config.AZURE_MODEL_FAST if fast else config.AZURE_MODEL_REASONING
        return _make_azure_llm(model, temperature)
    model = config.OPENROUTER_MODEL_A if fast else config.OPENROUTER_MODEL_B
    return _make_openrouter_llm(model, temperature)


def get_model_a(temperature: float = 0.0) -> ChatOpenAI:
    """Fast/cheap model for Agents 1 & 2 (eligibility, coding)."""
    return _make_primary(fast=True, temperature=temperature)


def get_model_b(temperature: float = 0.0) -> ChatOpenAI:
    """Strong reasoning model for Agents 3 & 4 (submission, denial analysis)."""
    return _make_primary(fast=False, temperature=temperature)


def get_fallback(temperature: float = 0.0) -> ChatOpenAI:
    """Free OpenRouter model used when a primary (Azure or OpenRouter) call fails."""
    return _make_openrouter_llm(config.OPENROUTER_FALLBACK, temperature)


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
            from utils import runtime_status

            runtime_status.record_fallback(
                "llm",
                f"{config.LLM_PROVIDER} model failed ({primary_exc}); "
                f"used OpenRouter fallback.",
            )
            return data
        except Exception as fallback_exc:  # noqa: BLE001
            raise RuntimeError(
                f"Both primary and fallback models failed. "
                f"Primary: {primary_exc}. Fallback: {fallback_exc}."
            ) from fallback_exc
