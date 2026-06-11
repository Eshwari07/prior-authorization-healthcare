"""Azure AI Search store backing Foundry IQ knowledge retrieval.

Mirrors the public query surface of ``vector_store.qdrant_store`` (same function
names, same ``list[dict]`` return shape with a ``score`` key) so the two are
interchangeable behind ``utils.retrieval``. Each returned hit also carries a
``citation`` string for grounding/transparency in the UI.

Embeddings reuse the local sentence-transformers model (no API cost, 384-dim)
so vector dimensions match the Qdrant path exactly.
"""
from __future__ import annotations

import json
import re
import uuid
from functools import lru_cache

from azure.core.credentials import AzureKeyCredential
from azure.search.documents import SearchClient
from azure.search.documents.indexes import SearchIndexClient
from azure.search.documents.indexes.models import (
    HnswAlgorithmConfiguration,
    SearchableField,
    SearchField,
    SearchFieldDataType,
    SearchIndex,
    SimpleField,
    VectorSearch,
    VectorSearchProfile,
)
from azure.search.documents.models import VectorizedQuery

import config
from utils import data_loader
from vector_store.qdrant_store import embed, embed_batch

_VECTOR_PROFILE = "default-profile"
_HNSW = "default-hnsw"


def _safe_key(value: str) -> str:
    """Azure Search document keys allow only letters, digits, _, -, =."""
    return re.sub(r"[^A-Za-z0-9_\-=]", "_", value.strip())


# ─── Clients ──────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def _credential() -> AzureKeyCredential:
    config.require("AZURE_SEARCH_ENDPOINT", "AZURE_SEARCH_KEY")
    return AzureKeyCredential(config.AZURE_SEARCH_KEY)


@lru_cache(maxsize=1)
def _index_client() -> SearchIndexClient:
    return SearchIndexClient(config.AZURE_SEARCH_ENDPOINT, _credential())


@lru_cache(maxsize=8)
def _search_client(index_name: str) -> SearchClient:
    return SearchClient(config.AZURE_SEARCH_ENDPOINT, index_name, _credential())


def _vector_field() -> SearchField:
    return SearchField(
        name="vector",
        type=SearchFieldDataType.Collection(SearchFieldDataType.Single),
        searchable=True,
        vector_search_dimensions=config.EMBEDDING_DIM,
        vector_search_profile_name=_VECTOR_PROFILE,
    )


def _vector_search() -> VectorSearch:
    return VectorSearch(
        algorithms=[HnswAlgorithmConfiguration(name=_HNSW)],
        profiles=[
            VectorSearchProfile(
                name=_VECTOR_PROFILE, algorithm_configuration_name=_HNSW
            )
        ],
    )


def _ensure_index(name: str, fields: list) -> None:
    index = SearchIndex(
        name=name,
        fields=[*fields, _vector_field()],
        vector_search=_vector_search(),
    )
    _index_client().create_or_update_index(index)


# ─── Index schemas ────────────────────────────────────────────────

def _procedure_fields() -> list:
    return [
        SimpleField(name="id", type=SearchFieldDataType.String, key=True),
        SimpleField(name="code", type=SearchFieldDataType.String, filterable=True),
        SearchableField(name="description", type=SearchFieldDataType.String),
        SimpleField(name="category", type=SearchFieldDataType.String),
        SimpleField(name="typical_modifiers", type=SearchFieldDataType.String),
    ]


def _icd10_fields() -> list:
    return [
        SimpleField(name="id", type=SearchFieldDataType.String, key=True),
        SimpleField(name="code", type=SearchFieldDataType.String, filterable=True),
        SimpleField(name="raw_code", type=SearchFieldDataType.String),
        SearchableField(name="description", type=SearchFieldDataType.String),
    ]


def _denial_fields() -> list:
    return [
        SimpleField(name="id", type=SearchFieldDataType.String, key=True),
        SimpleField(name="denial_code", type=SearchFieldDataType.String, filterable=True),
        SimpleField(name="cpt_code", type=SearchFieldDataType.String, filterable=True),
        SearchableField(name="context", type=SearchFieldDataType.String),
        SimpleField(name="resolution", type=SearchFieldDataType.String),
        SimpleField(name="corrected_primary_icd10", type=SearchFieldDataType.String),
        SimpleField(name="corrected_modifier", type=SearchFieldDataType.String),
        SimpleField(name="action", type=SearchFieldDataType.String),
        SimpleField(name="payload_json", type=SearchFieldDataType.String),
    ]


# ─── Indexing (run once during setup) ─────────────────────────────

def index_procedures() -> int:
    _ensure_index(config.SEARCH_INDEX_HCPCS, _procedure_fields())
    procedures = data_loader.load_procedures()
    texts = [f"{p['code']}: {p['description']} ({p['category']})" for p in procedures]
    vectors = embed_batch(texts)
    docs = [
        {
            "id": f"proc-{_safe_key(p['code'])}",
            "code": p["code"],
            "description": p["description"],
            "category": p["category"],
            "typical_modifiers": p["typical_modifiers"],
            "vector": vec,
        }
        for p, vec in zip(procedures, vectors)
    ]
    _search_client(config.SEARCH_INDEX_HCPCS).upload_documents(documents=docs)
    return len(docs)


def index_icd10(limit: int | None = None) -> int:
    _ensure_index(config.SEARCH_INDEX_ICD10, _icd10_fields())
    codes = data_loader.load_icd10()
    items = list(codes.items())
    if limit:
        items = items[:limit]

    client = _search_client(config.SEARCH_INDEX_ICD10)
    total = 0
    batch_size = 1000
    for start in range(0, len(items), batch_size):
        chunk = items[start : start + batch_size]
        texts = [f"{data_loader.insert_icd_decimal(c)}: {d}" for c, d in chunk]
        vectors = embed_batch(texts)
        docs = [
            {
                "id": f"icd-{_safe_key(code)}",
                "code": data_loader.insert_icd_decimal(code),
                "raw_code": code,
                "description": desc,
                "vector": vec,
            }
            for (code, desc), vec in zip(chunk, vectors)
        ]
        client.upload_documents(documents=docs)
        total += len(docs)
    return total


def _denial_doc(case: dict, doc_id: str | None = None) -> dict:
    text = (
        f"Denial {case.get('denial_code')} on {case.get('cpt_code')}: "
        f"{case.get('context', '')}"
    )
    return {
        "id": doc_id or uuid.uuid4().hex,
        "denial_code": case.get("denial_code", ""),
        "cpt_code": case.get("cpt_code", ""),
        "context": case.get("context", ""),
        "resolution": case.get("resolution", ""),
        "corrected_primary_icd10": case.get("corrected_primary_icd10", ""),
        "corrected_modifier": case.get("corrected_modifier", ""),
        "action": case.get("action", ""),
        "payload_json": json.dumps(case),
        "vector": embed(text),
    }


def index_denials() -> int:
    _ensure_index(config.SEARCH_INDEX_DENIALS, _denial_fields())
    denials = data_loader.load_seed_denials()
    docs = [_denial_doc(d, doc_id=f"seed-{i}") for i, d in enumerate(denials)]
    _search_client(config.SEARCH_INDEX_DENIALS).upload_documents(documents=docs)
    return len(docs)


def add_denial_resolution(case: dict) -> None:
    """Append a newly resolved denial for future RAG (mirrors qdrant_store)."""
    _ensure_index(config.SEARCH_INDEX_DENIALS, _denial_fields())
    _search_client(config.SEARCH_INDEX_DENIALS).upload_documents(
        documents=[_denial_doc(case)]
    )


def reset_indexes() -> None:
    """Delete all three indexes (clears stale docs before a clean re-index)."""
    client = _index_client()
    for name in (
        config.SEARCH_INDEX_HCPCS,
        config.SEARCH_INDEX_ICD10,
        config.SEARCH_INDEX_DENIALS,
    ):
        try:
            client.delete_index(name)
        except Exception:  # noqa: BLE001
            pass


def collection_count(index_name: str) -> int:
    try:
        return _search_client(index_name).get_document_count()
    except Exception:  # noqa: BLE001
        return 0


# ─── Querying (used by agents) ────────────────────────────────────

def _run_vector_query(index_name: str, query: str, top_k: int) -> list[dict]:
    vq = VectorizedQuery(
        vector=embed(query), k_nearest_neighbors=top_k, fields="vector"
    )
    results = _search_client(index_name).search(
        search_text=None, vector_queries=[vq], top=top_k
    )
    hits: list[dict] = []
    for r in results:
        payload = {k: v for k, v in r.items() if not k.startswith("@") and k != "vector"}
        payload["score"] = r.get("@search.score", 0.0)
        hits.append(payload)
    return hits


def search_procedures(query: str, top_k: int = 5) -> list[dict]:
    hits = _run_vector_query(config.SEARCH_INDEX_HCPCS, query, top_k)
    for h in hits:
        h["citation"] = f"Procedure code {h.get('code')} — {h.get('description')}"
    return hits


def search_icd10(query: str, top_k: int = 10) -> list[dict]:
    hits = _run_vector_query(config.SEARCH_INDEX_ICD10, query, top_k)
    for h in hits:
        h["citation"] = f"ICD-10 {h.get('code')} — {h.get('description')}"
    return hits


def search_denials(query: str, top_k: int = 5) -> list[dict]:
    hits = _run_vector_query(config.SEARCH_INDEX_DENIALS, query, top_k)
    out: list[dict] = []
    for h in hits:
        payload = {}
        if h.get("payload_json"):
            try:
                payload = json.loads(h["payload_json"])
            except (ValueError, TypeError):
                payload = {}
        payload.update({k: v for k, v in h.items() if k != "payload_json"})
        payload["citation"] = (
            f"Resolved denial {payload.get('denial_code')} on "
            f"{payload.get('cpt_code')}: {payload.get('resolution', '')}"
        )
        out.append(payload)
    return out
