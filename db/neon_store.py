"""Neon PostgreSQL persistence for completed PA requests.

Uses SQLAlchemy Core so the same code runs against Neon (cloud) or any
PostgreSQL. Stores one row per completed PA workflow run for the History and
Analytics tabs.
"""
from __future__ import annotations

from datetime import datetime, timezone
from functools import lru_cache

from sqlalchemy import (
    JSON,
    Column,
    DateTime,
    Integer,
    MetaData,
    String,
    Table,
    Text,
    create_engine,
    insert,
    select,
)
from sqlalchemy.engine import Engine

import config

metadata = MetaData()
pa_requests = Table(
    "pa_requests",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("run_id", String(64), nullable=False),
    Column("patient_id", String(100)),
    Column("patient_name", String(200)),
    Column("insurer", String(200)),
    Column("plan_name", String(200)),
    Column("procedure_desc", Text),
    Column("cpt_code", String(20)),
    Column("primary_icd10", String(20)),
    Column("secondary_icd10", JSON),
    Column("final_status", String(50)),
    Column("auth_number", String(100)),
    Column("denial_code", String(20)),
    Column("denial_reason", Text),
    Column("retry_count", Integer, default=0),
    Column("appeal_letter", Text),
    Column("agent_trace", JSON),
    Column("created_at", DateTime(timezone=True)),
)


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    config.require("NEON_DATABASE_URL")
    url = config.NEON_DATABASE_URL
    # SQLAlchemy needs the psycopg2 driver prefix
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg2://", 1)
    return create_engine(url, pool_pre_ping=True)


def init_db() -> None:
    """Create the pa_requests table if it does not exist."""
    metadata.create_all(get_engine())


def save_run(record: dict) -> None:
    """Persist one completed PA workflow run."""
    init_db()
    record = {**record}
    record.setdefault("created_at", datetime.now(timezone.utc))
    with get_engine().begin() as conn:
        conn.execute(insert(pa_requests).values(**record))


def get_all_runs(limit: int = 200) -> list[dict]:
    """Return recent PA runs (most recent first) for History/Analytics."""
    init_db()
    with get_engine().connect() as conn:
        rows = conn.execute(
            select(pa_requests).order_by(pa_requests.c.created_at.desc()).limit(limit)
        ).mappings().all()
    return [dict(r) for r in rows]
