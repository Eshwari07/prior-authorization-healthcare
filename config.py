"""Central configuration. Reads from .env locally and from environment variables
when deployed (HF Spaces / Vercel inject env vars at build/runtime)."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()  # no-op on Streamlit Cloud, loads .env locally

# Project paths
ROOT_DIR = Path(__file__).resolve().parent
DATA_DIR = ROOT_DIR / "data"
PATIENTS_DIR = DATA_DIR / "patients"
ICD10_DIR = DATA_DIR / "icd10_codes"
HCPCS_DIR = DATA_DIR / "hcpcs_codes"
PA_RULES_FILE = DATA_DIR / "pa_required_codes.json"
SEED_DENIALS_FILE = DATA_DIR / "seed_denials.json"
PROCEDURES_FILE = DATA_DIR / "hcpcs_codes" / "procedures.csv"


def _get(key: str, default: str | None = None) -> str | None:
    """Fetch a config value from environment variables."""
    return os.getenv(key, default)


# ─── Provider selection ───────────────────────────────────────
# LLM_PROVIDER: "foundry" (Azure AI Foundry) or "openrouter".
# RETRIEVAL_PROVIDER: "foundry_iq" (Azure AI Search) or "qdrant".
LLM_PROVIDER = _get("LLM_PROVIDER", "openrouter").lower()
RETRIEVAL_PROVIDER = _get("RETRIEVAL_PROVIDER", "qdrant").lower()

# OpenRouter (primary when LLM_PROVIDER=openrouter; always the fallback path)
OPENROUTER_API_KEY = _get("OPENROUTER_API_KEY")
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
OPENROUTER_MODEL_A = _get("OPENROUTER_MODEL_A", "")
OPENROUTER_MODEL_B = _get("OPENROUTER_MODEL_B", "")
OPENROUTER_FALLBACK = _get("OPENROUTER_FALLBACK", "nvidia/nemotron-3-super-120b-a12b:free")

# Azure AI Foundry (Azure OpenAI v1, OpenAI-compatible endpoint)
AZURE_OPENAI_ENDPOINT = _get("AZURE_OPENAI_ENDPOINT")
AZURE_OPENAI_API_KEY = _get("AZURE_OPENAI_API_KEY")
AZURE_OPENAI_PROJECT_ENDPOINT = _get("AZURE_OPENAI_PROJECT_ENDPOINT")
# Deployment names created in the Foundry project. Fast can equal reasoning
# until a dedicated gpt-4o-mini deployment exists.
AZURE_MODEL_FAST = _get("AZURE_MODEL_FAST", "gpt-4o")
AZURE_MODEL_REASONING = _get("AZURE_MODEL_REASONING", "gpt-4o")

# Qdrant
QDRANT_URL = _get("QDRANT_URL")
QDRANT_API_KEY = _get("QDRANT_API_KEY")

# Azure AI Search (backs Foundry IQ knowledge retrieval)
AZURE_SEARCH_ENDPOINT = _get("AZURE_SEARCH_ENDPOINT")
AZURE_SEARCH_KEY = _get("AZURE_SEARCH_KEY")
SEARCH_INDEX_HCPCS = _get("SEARCH_INDEX_HCPCS", "pa-procedures")
SEARCH_INDEX_ICD10 = _get("SEARCH_INDEX_ICD10", "pa-icd10")
SEARCH_INDEX_DENIALS = _get("SEARCH_INDEX_DENIALS", "pa-denials")

# Neon PostgreSQL
NEON_DATABASE_URL = _get("NEON_DATABASE_URL")

# Embeddings
EMBEDDING_MODEL = "all-MiniLM-L6-v2"
EMBEDDING_DIM = 384  # all-MiniLM-L6-v2 output dimension

# Qdrant collection names
COLLECTION_HCPCS = "hcpcs_codes"
COLLECTION_ICD10 = "icd10_codes"
COLLECTION_DENIALS = "denial_history"

# Agent tuning
MAX_RETRIES = int(_get("MAX_RETRIES", "3"))


def require(*keys: str) -> None:
    """Raise a clear error if required config is missing."""
    missing = [k for k in keys if not globals().get(k)]
    if missing:
        raise RuntimeError(
            f"Missing required configuration: {', '.join(missing)}. "
            f"Set them in .env (local) or as environment variables (HF Spaces)."
        )
