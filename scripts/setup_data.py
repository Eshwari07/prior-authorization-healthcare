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

    print("== Prior Auth Agent — data setup ==\n")

    # 1. Validate config
    try:
        config.require("QDRANT_URL", "QDRANT_API_KEY", "NEON_DATABASE_URL")
    except RuntimeError as exc:
        print(f"[FAIL] {exc}")
        return 1

    # 2. Load embedding model
    print("Loading embedding model (first run downloads ~80MB)...")
    t0 = time.time()
    qdrant_store.get_embedder()
    print(f"  done in {time.time() - t0:.1f}s\n")

    # 3. Index procedures
    print("Indexing procedure (HCPCS/CPT) codes...")
    n = qdrant_store.index_procedures()
    print(f"  indexed {n} procedure codes\n")

    # 4. Index denial history
    print("Seeding denial history...")
    n = qdrant_store.index_denials()
    print(f"  indexed {n} denial cases\n")

    # 5. Index ICD-10
    if not args.skip_icd:
        limit = 5000 if args.quick else None
        label = f"{limit} (quick subset)" if limit else "all (~77k)"
        print(f"Indexing ICD-10 codes: {label}... this can take several minutes")
        t0 = time.time()
        n = qdrant_store.index_icd10(limit=limit)
        print(f"  indexed {n} ICD-10 codes in {time.time() - t0:.1f}s\n")
    else:
        print("Skipping ICD-10 indexing.\n")

    # 6. Init Neon DB
    print("Initializing Neon PostgreSQL table...")
    neon_store.init_db()
    print("  pa_requests table ready\n")

    # 7. Summary
    print("== Qdrant collection counts ==")
    print(f"  procedures:     {qdrant_store.collection_count(config.COLLECTION_HCPCS)}")
    print(f"  icd10:          {qdrant_store.collection_count(config.COLLECTION_ICD10)}")
    print(f"  denial_history: {qdrant_store.collection_count(config.COLLECTION_DENIALS)}")
    print("\nSetup complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
