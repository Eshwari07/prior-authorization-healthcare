"""Qdrant Cloud vector store wrapper.

Manages three collections — procedure (HCPCS/CPT) codes, ICD-10 codes, and
denial history — using local sentence-transformers embeddings (no API cost).
The embedding model is loaded once and cached.
"""
from __future__ import annotations

import uuid
from functools import lru_cache

from qdrant_client import QdrantClient
from qdrant_client.models import Distance, PointStruct, VectorParams

import config
from utils import data_loader


@lru_cache(maxsize=1)
def get_embedder():
    """Load the sentence-transformers model once (cached)."""
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(config.EMBEDDING_MODEL)


def embed(text: str) -> list[float]:
    return get_embedder().encode(text, normalize_embeddings=True).tolist()


def embed_batch(texts: list[str]) -> list[list[float]]:
    return get_embedder().encode(texts, normalize_embeddings=True).tolist()


@lru_cache(maxsize=1)
def get_client() -> QdrantClient:
    config.require("QDRANT_URL", "QDRANT_API_KEY")
    return QdrantClient(url=config.QDRANT_URL, api_key=config.QDRANT_API_KEY)


def _ensure_collection(name: str) -> None:
    client = get_client()
    existing = {c.name for c in client.get_collections().collections}
    if name not in existing:
        client.create_collection(
            collection_name=name,
            vectors_config=VectorParams(
                size=config.EMBEDDING_DIM, distance=Distance.COSINE
            ),
        )


def collection_count(name: str) -> int:
    try:
        return get_client().count(collection_name=name).count
    except Exception:  # noqa: BLE001
        return 0


# ─── Indexing (run once during setup) ─────────────────────────────

def index_procedures() -> int:
    """Embed and upload procedure codes to Qdrant."""
    _ensure_collection(config.COLLECTION_HCPCS)
    procedures = data_loader.load_procedures()
    texts = [f"{p['code']}: {p['description']} ({p['category']})" for p in procedures]
    vectors = embed_batch(texts)
    points = [
        PointStruct(
            id=str(uuid.uuid4()),
            vector=vec,
            payload={
                "code": p["code"],
                "description": p["description"],
                "category": p["category"],
                "typical_modifiers": p["typical_modifiers"],
            },
        )
        for p, vec in zip(procedures, vectors)
    ]
    get_client().upsert(collection_name=config.COLLECTION_HCPCS, points=points)
    return len(points)


def index_icd10(limit: int | None = None) -> int:
    """Embed and upload ICD-10 codes to Qdrant. ~77k codes; use limit for testing."""
    _ensure_collection(config.COLLECTION_ICD10)
    codes = data_loader.load_icd10()
    items = list(codes.items())
    if limit:
        items = items[:limit]

    total = 0
    batch_size = 256
    client = get_client()
    for start in range(0, len(items), batch_size):
        chunk = items[start : start + batch_size]
        texts = [f"{data_loader.insert_icd_decimal(c)}: {d}" for c, d in chunk]
        vectors = embed_batch(texts)
        points = [
            PointStruct(
                id=str(uuid.uuid4()),
                vector=vec,
                payload={
                    "code": data_loader.insert_icd_decimal(code),
                    "raw_code": code,
                    "description": desc,
                },
            )
            for (code, desc), vec in zip(chunk, vectors)
        ]
        client.upsert(collection_name=config.COLLECTION_ICD10, points=points)
        total += len(points)
    return total


def index_denials() -> int:
    """Embed and upload seed denial cases to Qdrant."""
    _ensure_collection(config.COLLECTION_DENIALS)
    denials = data_loader.load_seed_denials()
    texts = [
        f"Denial {d['denial_code']} on {d['cpt_code']}: {d['context']}" for d in denials
    ]
    vectors = embed_batch(texts)
    points = [
        PointStruct(id=str(uuid.uuid4()), vector=vec, payload=d)
        for d, vec in zip(denials, vectors)
    ]
    get_client().upsert(collection_name=config.COLLECTION_DENIALS, points=points)
    return len(points)


def add_denial_resolution(case: dict) -> None:
    """Append a newly resolved denial to the history collection for future RAG."""
    _ensure_collection(config.COLLECTION_DENIALS)
    text = f"Denial {case.get('denial_code')} on {case.get('cpt_code')}: {case.get('context', '')}"
    get_client().upsert(
        collection_name=config.COLLECTION_DENIALS,
        points=[PointStruct(id=str(uuid.uuid4()), vector=embed(text), payload=case)],
    )


# ─── Querying (used by agents) ────────────────────────────────────

def search_procedures(query: str, top_k: int = 5) -> list[dict]:
    hits = get_client().search(
        collection_name=config.COLLECTION_HCPCS, query_vector=embed(query), limit=top_k
    )
    return [{**h.payload, "score": h.score} for h in hits]


def search_icd10(query: str, top_k: int = 10) -> list[dict]:
    hits = get_client().search(
        collection_name=config.COLLECTION_ICD10, query_vector=embed(query), limit=top_k
    )
    return [{**h.payload, "score": h.score} for h in hits]


def search_denials(query: str, top_k: int = 5) -> list[dict]:
    hits = get_client().search(
        collection_name=config.COLLECTION_DENIALS, query_vector=embed(query), limit=top_k
    )
    return [{**h.payload, "score": h.score} for h in hits]
