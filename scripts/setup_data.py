"""One-time setup script.

Indexes procedure codes, ICD-10 codes, and seed denial history into Qdrant
Cloud, and initializes the Neon PostgreSQL table.

Usage:
    python -m scripts.setup_data            # full ICD-10 index (~77k codes)
    python -m scripts.setup_data --quick    # index a 5k ICD-10 subset (faster)
"""
from __future__ import annotations

import argparse
import sys
import time


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--quick",
        action="store_true",
        help="Index a smaller ICD-10 subset for faster setup/testing.",
    )
    parser.add_argument(
        "--skip-icd",
        action="store_true",
        help="Skip ICD-10 indexing (useful if already done).",
    )
    args = parser.parse_args()

    import config
    from db import neon_store
    from vector_store import qdrant_store

    use_foundry = config.RETRIEVAL_PROVIDER == "foundry_iq"
    if use_foundry:
        from foundry_iq import search_store as store

        store_label = "Foundry IQ (Azure AI Search)"
        count_keys = [
            ("procedures", config.SEARCH_INDEX_HCPCS),
            ("icd10", config.SEARCH_INDEX_ICD10),
            ("denial_history", config.SEARCH_INDEX_DENIALS),
        ]
    else:
        store = qdrant_store
        store_label = "Qdrant"
        count_keys = [
            ("procedures", config.COLLECTION_HCPCS),
            ("icd10", config.COLLECTION_ICD10),
            ("denial_history", config.COLLECTION_DENIALS),
        ]

    print(f"== Prior Auth Agent — data setup (backend: {store_label}) ==\n")

    # 1. Validate config
    try:
        config.require("NEON_DATABASE_URL")
        if use_foundry:
            config.require("AZURE_SEARCH_ENDPOINT", "AZURE_SEARCH_KEY")
        else:
            config.require("QDRANT_URL", "QDRANT_API_KEY")
    except RuntimeError as exc:
        print(f"[FAIL] {exc}")
        return 1

    # 2. Load embedding model (both backends use local sentence-transformers)
    print("Loading embedding model (first run downloads ~80MB)...")
    t0 = time.time()
    qdrant_store.get_embedder()
    print(f"  done in {time.time() - t0:.1f}s\n")

    # 3. Index procedures
    print("Indexing procedure (HCPCS/CPT) codes...")
    n = store.index_procedures()
    print(f"  indexed {n} procedure codes\n")

    # 4. Index denial history
    print("Seeding denial history...")
    n = store.index_denials()
    print(f"  indexed {n} denial cases\n")

    # 5. Index ICD-10
    if not args.skip_icd:
        limit = 5000 if args.quick else None
        label = f"{limit} (quick subset)" if limit else "all (~77k)"
        print(f"Indexing ICD-10 codes: {label}... this can take several minutes")
        t0 = time.time()
        n = store.index_icd10(limit=limit)
        print(f"  indexed {n} ICD-10 codes in {time.time() - t0:.1f}s\n")
    else:
        print("Skipping ICD-10 indexing.\n")

    # 6. Init Neon DB
    print("Initializing Neon PostgreSQL table...")
    neon_store.init_db()
    print("  pa_requests table ready\n")

    # 7. Summary
    print(f"== {store_label} document counts ==")
    for label, key in count_keys:
        print(f"  {label}: {store.collection_count(key)}")
    print("\nSetup complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
