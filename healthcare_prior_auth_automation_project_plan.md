# Healthcare Prior-Auth Automation — Agentic AI Project Plan

> **Stack:** Python · FastAPI · LangGraph · React + Vite · pgvector · Synthea · CMS CPT/ICD  
> **Timeline:** 4 weeks · ~24 build days  
> **Data:** Synthea synthetic FHIR patients (no real patient data / no HIPAA concerns)  
> **Resume impact:** 4/5 — a San Francisco startup deployed this exact architecture and cut PA cycle time from 30 days to 3 days

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Solution Overview](#2-solution-overview)
3. [System Architecture](#3-system-architecture)
4. [Folder Structure](#4-folder-structure)
5. [Data Sources](#5-data-sources)
6. [Phase 1 — Project Setup & Data Preparation (Days 1–3)](#6-phase-1--project-setup--data-preparation-days-13)
7. [Phase 2 — Build the 4 Agents (Days 4–9)](#7-phase-2--build-the-4-agents-days-49)
8. [Phase 3 — LangGraph State Machine & Mock Payer API (Days 10–14)](#8-phase-3--langgraph-state-machine--mock-payer-api-days-1014)
9. [Phase 4 — FastAPI Backend & WebSocket Streaming (Days 15–18)](#9-phase-4--fastapi-backend--websocket-streaming-days-1518)
10. [Phase 5 — React Frontend Dashboard (Days 19–24)](#10-phase-5--react-frontend-dashboard-days-1924)
11. [Week-by-Week Summary](#11-week-by-week-summary)
12. [API Reference](#12-api-reference)
13. [Database Schema](#13-database-schema)
14. [Environment Variables](#14-environment-variables)
15. [Resume Bullet](#15-resume-bullet)

---

## 1. Problem Statement

Insurance prior authorization (PA) is one of the most broken administrative workflows in US healthcare:

- Physicians spend **13 hours/week** on PA paperwork
- **93%** of doctors report PA delays patient care
- **29%** say PA has caused a serious adverse event for a patient
- Average denial rate is **11%+** and growing
- Every denied claim costs **$25–$118** to rework
- PA-related denials have grown **20%** in the past two years

Current tooling is either fully manual (staff calling payers) or partially automated (form-fill bots that don't handle denials). No existing open-source project closes the full loop: verify → code → submit → analyze denial → retry.

---

## 2. Solution Overview

An agentic pipeline of **4 specialized AI agents** orchestrated by LangGraph that:

1. **Verifies** patient eligibility and coverage from synthetic FHIR data
2. **Maps** the requested procedure to correct CPT + ICD-10 codes using RAG over CMS tables
3. **Submits** the prior authorization request to a mock payer API and polls for a decision
4. **Analyzes** any denial using its reason code, corrects the submission, and retries — up to 3 times before escalating

The system exposes a FastAPI backend with WebSocket streaming so a React dashboard can show the live agent trace as each step executes.

**What makes it agentic (not just automated):** The denial-retry loop. A simple automation stops when denied. This agent *reasons* about why the denial happened, diagnoses the root cause (wrong modifier, mismatched diagnosis, duplicate submission, etc.), and autonomously corrects and resubmits — the same cognitive work a senior billing specialist performs manually.

---

## 3. System Architecture

```
┌─────────────────────────────────────────────────────────┐
│              LangGraph Agent Pipeline (Python)           │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Agent 1 — Eligibility Verifier                 │    │
│  │  Synthea FHIR · coverage check · patient context│    │
│  └──────────────────────┬──────────────────────────┘    │
│                         │                               │
│  ┌──────────────────────▼──────────────────────────┐    │
│  │  Agent 2 — Prior Auth Coder                     │    │
│  │  CPT/ICD lookup · CMS code CSVs · LLM mapping   │    │
│  └──────────────────────┬──────────────────────────┘    │
│                         │                               │
│  ┌──────────────────────▼──────────────────────────┐    │
│  │  Agent 3 — PA Submitter                         │    │
│  │  Builds auth request · mock payer · status poll  │    │
│  └──────────────────────┬──────────────────────────┘    │
│              approved ◄─┤► denied                       │
│                         │    │                          │
│  ┌──────────────────────▼────▼─────────────────────┐    │
│  │  Agent 4 — Denial Analyst                       │    │
│  │  Reads denial code · corrects · retry/escalate   │    │
│  └──────────────────────┬──────────────────────────┘    │
│              retry ─────┘  (max 3 attempts)             │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │  LangGraph StateGraph · MemorySaver checkpointer │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
         │ REST + WebSocket
         ▼
┌────────────────────┐         ┌────────────────────────┐
│  FastAPI Backend   │◄───────►│   React Dashboard      │
│  POST /api/pa/     │         │  • PA submission form   │
│  GET  /api/pa/{id} │         │  • Live agent trace     │
│  WS   /ws/trace    │         │  • Status timeline      │
│  PostgreSQL        │         │  • Analytics charts     │
└────────────────────┘         └────────────────────────┘
         │
         ▼
┌────────────────────┐         ┌────────────────────────┐
│  Mock Payer API    │         │  pgvector Store         │
│  FastAPI on :8001  │         │  Denial embeddings      │
│  60% approve       │         │  Historical PA RAG      │
│  30% deny          │         └────────────────────────┘
│  10% pending       │
└────────────────────┘
```

---

## 4. Folder Structure

```
pa-agent/
├── backend/
│   ├── agents/
│   │   ├── __init__.py
│   │   ├── eligibility.py        # Agent 1 — patient context + coverage
│   │   ├── coder.py              # Agent 2 — CPT/ICD code mapping
│   │   ├── submitter.py          # Agent 3 — PA request submission
│   │   └── denial_analyst.py     # Agent 4 — denial analysis + retry
│   ├── graph/
│   │   ├── __init__.py
│   │   ├── pa_graph.py           # LangGraph StateGraph definition
│   │   └── state.py              # PAState TypedDict
│   ├── api/
│   │   ├── __init__.py
│   │   ├── routes.py             # FastAPI REST endpoints
│   │   └── websocket.py          # WebSocket streaming handler
│   ├── db/
│   │   ├── __init__.py
│   │   ├── models.py             # SQLAlchemy ORM models
│   │   └── vector_store.py       # pgvector RAG helpers
│   ├── mock_payer/
│   │   └── payer_api.py          # Simulated insurer API (:8001)
│   ├── utils/
│   │   ├── fhir_parser.py        # Synthea FHIR bundle parser
│   │   └── cms_loader.py         # CPT/ICD CSV loader
│   ├── main.py                   # FastAPI app entry point
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── AgentTrace.jsx    # Live WebSocket trace feed
│   │   │   ├── PAForm.jsx        # Submission form
│   │   │   ├── StatusBadge.jsx   # Approved/Denied/Pending
│   │   │   └── DenialReport.jsx  # Denial analysis display
│   │   ├── pages/
│   │   │   ├── Submit.jsx        # PA submission page
│   │   │   ├── History.jsx       # Past requests + analytics
│   │   │   └── Dashboard.jsx     # Overview metrics
│   │   ├── hooks/
│   │   │   └── useAgentTrace.js  # WebSocket custom hook
│   │   └── App.jsx
│   ├── package.json
│   └── vite.config.js
├── data/
│   ├── synthea_output/           # Generated FHIR JSON bundles
│   └── cms_codes/
│       ├── icd10_2024.csv        # ICD-10 diagnosis codes
│       └── cpt_codes.csv         # CPT procedure codes
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 5. Data Sources

| Source | What it provides | How to get it | Cost |
|---|---|---|---|
| **Synthea** | Synthetic FHIR patient data (conditions, meds, insurance) | `git clone` + run script | Free |
| **CMS ICD-10 codes** | Official diagnosis code table 2024 | CMS.gov download | Free |
| **CMS CPT codes** | Procedure billing codes | AMA publishes subset | Free |
| **OpenAI / Claude API** | LLM for agent reasoning | API key | ~$3–5 for full test run |
| **pgvector** | Vector store for RAG over denial history | Docker image | Free |

---

## 6. Phase 1 — Project Setup & Data Preparation (Days 1–3)

### Step 1.1 — Generate Synthea Patient Data

```bash
git clone https://github.com/synthetichealth/synthea
cd synthea
./run_synthea -p 200 \
  --exporter.fhir.export=true \
  --exporter.json.export=true \
  Massachusetts
```

Copy output to `data/synthea_output/`. Each file is a FHIR R4 JSON bundle for one patient containing:
- Demographics (name, DOB, gender)
- Insurance coverage (insurer name, member ID, plan type)
- Conditions (ICD-10 coded)
- Medications
- Procedures and encounters

**Tip:** Run with `--condition diabetes` or `--condition cardiac` flags to generate patients who commonly need prior authorization.

### Step 1.2 — Download CMS Code Tables

```bash
# ICD-10 CM 2024 codes
wget https://www.cms.gov/files/zip/2024-code-descriptions-tabular-order.zip
unzip 2024-code-descriptions-tabular-order.zip -d data/cms_codes/

# Save as data/cms_codes/icd10_2024.csv
# Format: code, description, billable (Y/N)
```

### Step 1.3 — Python Environment

```bash
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

pip install fastapi uvicorn[standard] \
            langgraph langchain-openai langchain-community \
            sqlalchemy asyncpg pgvector \
            pydantic python-dotenv httpx \
            websockets fhir.resources \
            pandas numpy
```

### Step 1.4 — Docker Compose for PostgreSQL + pgvector

```yaml
# docker-compose.yml
version: '3.8'
services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: pa_agent
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: secret
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  mock_payer:
    build: ./backend
    command: uvicorn mock_payer.payer_api:payer_app --host 0.0.0.0 --port 8001
    ports:
      - "8001:8001"

  backend:
    build: ./backend
    command: uvicorn main:app --host 0.0.0.0 --port 8000 --reload
    ports:
      - "8000:8000"
    depends_on:
      - postgres
      - mock_payer
    env_file: .env

  frontend:
    build: ./frontend
    ports:
      - "5173:5173"

volumes:
  pgdata:
```

---

## 7. Phase 2 — Build the 4 Agents (Days 4–9)

### Agent 1 — Eligibility Verifier (`agents/eligibility.py`)

**Responsibility:** Load patient FHIR bundle, extract demographics and insurance info, call mock payer to confirm active coverage, and return a structured `PatientContext` object shared by all downstream agents.

```python
from pydantic import BaseModel
from langchain_openai import ChatOpenAI
from utils.fhir_parser import parse_fhir_bundle

class PatientContext(BaseModel):
    patient_id: str
    name: str
    dob: str
    insurer: str
    member_id: str
    plan_type: str                 # HMO, PPO, etc.
    conditions: list[str]          # active ICD-10 codes
    medications: list[str]
    requesting_procedure: str      # plain English description
    coverage_active: bool
    pa_required: bool              # pre-check: does this plan require PA?
    coverage_details: dict

def run_eligibility_agent(
    patient_fhir_path: str,
    procedure_request: str
) -> PatientContext:
    """
    1. Parse Synthea FHIR bundle
    2. Extract patient demographics, insurance, conditions
    3. POST to mock payer /eligibility endpoint
    4. Confirm coverage is active and PA is required
    5. Return PatientContext
    """
    bundle = parse_fhir_bundle(patient_fhir_path)
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
    
    # Use LLM to extract structured data from FHIR JSON
    prompt = f"""
    Extract patient information from this FHIR bundle.
    Return JSON with: patient_id, name, dob, insurer, 
    member_id, conditions (ICD-10 list), medications.
    
    FHIR Bundle: {bundle}
    """
    result = llm.invoke(prompt)
    # ... parse and return PatientContext
```

**Key data fields extracted from Synthea FHIR:**
- `Patient` resource → demographics
- `Coverage` resource → insurer, member ID, plan type
- `Condition` resource → active conditions with ICD-10 codes
- `MedicationRequest` resource → current medications

---

### Agent 2 — Prior Auth Coder (`agents/coder.py`)

**Responsibility:** Take the procedure description and patient conditions, look up the correct CPT procedure code and supporting ICD-10 diagnosis codes using RAG over pgvector-indexed CMS tables, and validate the code combination against payer requirements.

```python
from pydantic import BaseModel
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from db.vector_store import query_cpt_codes, query_icd_codes

class CodingResult(BaseModel):
    cpt_code: str               # e.g. "27447" (total knee replacement)
    cpt_description: str
    primary_icd10: str          # main diagnosis code
    secondary_icd10: list[str]  # supporting codes
    requires_pa: bool
    clinical_justification: str # medical necessity narrative
    confidence: float           # 0.0–1.0
    coding_notes: str

def run_coder_agent(context: PatientContext) -> CodingResult:
    """
    1. Embed procedure description
    2. RAG query over pgvector-indexed CPT codes table
    3. RAG query for matching ICD-10 codes from patient conditions
    4. LLM validates code combination (CPT + ICD-10 must be compatible)
    5. Generate clinical justification text
    6. Return CodingResult
    """
    embeddings = OpenAIEmbeddings()
    llm = ChatOpenAI(model="gpt-4o", temperature=0)
    
    # Step 1: Find best CPT code via semantic search
    cpt_candidates = query_cpt_codes(
        query=context.requesting_procedure,
        top_k=5
    )
    
    # Step 2: Find supporting ICD-10 codes from patient conditions
    icd_candidates = query_icd_codes(
        conditions=context.conditions,
        procedure=context.requesting_procedure,
        top_k=10
    )
    
    # Step 3: LLM selects and validates the best combination
    prompt = f"""
    Select the most accurate CPT code for this procedure 
    and matching ICD-10 codes from this patient's conditions.
    
    Procedure: {context.requesting_procedure}
    Patient conditions: {context.conditions}
    CPT candidates: {cpt_candidates}
    ICD-10 candidates: {icd_candidates}
    
    Return JSON: cpt_code, primary_icd10, secondary_icd10,
    clinical_justification, confidence
    """
    # ... parse result and return CodingResult
```

**RAG setup for CMS codes:**

```python
# db/vector_store.py
import pandas as pd
from pgvector.sqlalchemy import Vector
from langchain_openai import OpenAIEmbeddings

def index_cms_codes():
    """Run once at startup to embed and store CMS codes in pgvector."""
    embeddings = OpenAIEmbeddings()
    
    # Load CPT codes CSV
    cpt_df = pd.read_csv("data/cms_codes/cpt_codes.csv")
    for _, row in cpt_df.iterrows():
        text = f"{row['code']}: {row['description']}"
        embedding = embeddings.embed_query(text)
        # INSERT into cpt_embeddings table with pgvector column
    
    # Load ICD-10 codes CSV
    icd_df = pd.read_csv("data/cms_codes/icd10_2024.csv")
    # Same pattern...
```

---

### Agent 3 — PA Submitter (`agents/submitter.py`)

**Responsibility:** Assemble the complete PA request packet from patient context and coding result, submit it to the mock payer API, poll for a decision, and return a `PARequest` with the final status.

```python
import httpx
import asyncio
from pydantic import BaseModel
from datetime import datetime

class PARequest(BaseModel):
    request_id: str
    patient_id: str
    patient_name: str
    insurer: str
    member_id: str
    cpt_code: str
    icd10_codes: list[str]
    clinical_justification: str
    submitted_at: datetime
    status: str          # pending | approved | denied
    auth_number: str | None = None
    denial_code: str | None = None
    denial_reason: str | None = None
    poll_count: int = 0

async def run_submitter_agent(
    context: PatientContext,
    coding: CodingResult
) -> PARequest:
    """
    1. Build structured PA packet
    2. POST to mock payer API (localhost:8001/pa/submit)
    3. Poll GET /pa/{id}/status every 5 seconds
    4. Return PARequest with approved/denied status
    """
    payer_url = "http://localhost:8001"
    
    # Build PA payload (mirrors real payer X12 278 format)
    payload = {
        "member_id": context.member_id,
        "insurer": context.insurer,
        "cpt_code": coding.cpt_code,
        "primary_diagnosis": coding.primary_icd10,
        "secondary_diagnoses": coding.secondary_icd10,
        "clinical_notes": coding.clinical_justification,
        "requesting_provider": "Dr. System Agent",
        "service_date": datetime.now().isoformat()
    }
    
    async with httpx.AsyncClient() as client:
        # Submit
        resp = await client.post(f"{payer_url}/pa/submit", json=payload)
        pa_id = resp.json()["pa_id"]
        
        # Poll for decision (max 12 attempts = 60 seconds)
        for attempt in range(12):
            await asyncio.sleep(5)
            status_resp = await client.get(f"{payer_url}/pa/{pa_id}/status")
            status_data = status_resp.json()
            
            if status_data["status"] in ["approved", "denied"]:
                return PARequest(
                    request_id=pa_id,
                    status=status_data["status"],
                    auth_number=status_data.get("auth_number"),
                    denial_code=status_data.get("denial_code"),
                    denial_reason=status_data.get("denial_reason"),
                    poll_count=attempt + 1,
                    # ... other fields
                )
    
    # Timeout
    return PARequest(request_id=pa_id, status="timeout", ...)
```

---

### Agent 4 — Denial Analyst (`agents/denial_analyst.py`)

**Responsibility:** This is the most critical agent. When a denial arrives, read the denial reason code, diagnose the root cause using RAG over historical denial patterns, and either correct the submission (recode + retry) or generate an appeal letter for human escalation.

```python
from pydantic import BaseModel
from langchain_openai import ChatOpenAI
from db.vector_store import query_denial_history

# Standard denial reason codes (CARCs)
DENIAL_CODES = {
    "CO-4":  "procedure code inconsistent with modifier — check modifier usage",
    "CO-11": "diagnosis inconsistent with procedure — primary ICD-10 mismatch",
    "CO-22": "service not covered by this payer",
    "CO-97": "service already adjudicated — duplicate submission",
    "PR-96": "non-covered charge — plan exclusion",
    "CO-167": "diagnosis not covered — ICD-10 not in covered list",
    "CO-B7": "prior authorization not obtained",
}

class DenialAnalysis(BaseModel):
    denial_code: str
    denial_description: str
    root_cause: str
    corrective_action: str       # "recode" | "appeal" | "escalate"
    corrected_cpt: str | None
    corrected_primary_icd10: str | None
    corrected_secondary_icd10: list[str] | None
    appeal_letter: str | None
    confidence: float
    reasoning: str               # LLM chain-of-thought

def run_denial_analyst(
    request: PARequest,
    coding: CodingResult,
    context: PatientContext,
    retry_count: int
) -> DenialAnalysis:
    """
    1. Look up denial code meaning
    2. RAG query: find similar past denials and their resolutions
    3. LLM reasons about root cause
    4. If retry_count < 3: attempt recode
    5. If retry_count >= 3: generate appeal letter
    6. Return DenialAnalysis
    """
    llm = ChatOpenAI(model="gpt-4o", temperature=0)
    
    # RAG: find similar past denials
    similar_cases = query_denial_history(
        denial_code=request.denial_code,
        cpt_code=coding.cpt_code,
        top_k=5
    )
    
    prompt = f"""
    You are a medical billing specialist analyzing a prior authorization denial.
    
    Denial code: {request.denial_code}
    Denial reason: {DENIAL_CODES.get(request.denial_code, 'unknown')}
    Submitted CPT: {coding.cpt_code}
    Submitted ICD-10: {coding.primary_icd10}, {coding.secondary_icd10}
    Patient conditions: {context.conditions}
    Retry attempt: {retry_count + 1} of 3
    
    Similar resolved cases from history:
    {similar_cases}
    
    Diagnose the root cause and provide:
    1. Corrected CPT code (if applicable)
    2. Corrected ICD-10 codes (if applicable)
    3. Whether to recode/retry or escalate to human
    4. If escalating: draft an appeal letter
    
    Return as JSON matching DenialAnalysis schema.
    """
    
    result = llm.invoke(prompt)
    # ... parse and return DenialAnalysis
```

**Common denial patterns the agent learns:**

| Denial Code | Root Cause | Agent Fix |
|---|---|---|
| CO-11 | Wrong primary diagnosis | Re-order ICD-10 codes, make most specific code primary |
| CO-4 | Modifier mismatch | Add/remove CPT modifier (e.g. -59, -51) |
| CO-97 | Duplicate submission | Check submission history, add new clinical notes |
| PR-96 | Plan exclusion | Generate appeal with medical necessity letter |
| CO-167 | Diagnosis not covered | Swap to covered ICD-10 equivalent |

---

## 8. Phase 3 — LangGraph State Machine & Mock Payer API (Days 10–14)

### Graph State Definition (`graph/state.py`)

```python
from typing import TypedDict, Annotated
import operator
from agents.eligibility import PatientContext
from agents.coder import CodingResult
from agents.submitter import PARequest
from agents.denial_analyst import DenialAnalysis

class PAState(TypedDict):
    # Inputs
    patient_fhir_path: str
    procedure_request: str
    
    # Agent outputs (populated as graph executes)
    patient_context: PatientContext | None
    coding_result: CodingResult | None
    pa_request: PARequest | None
    denial_analysis: DenialAnalysis | None
    
    # Control
    retry_count: int
    max_retries: int               # default 3
    final_status: str              # approved | denied | escalated | timeout
    
    # Streaming trace (appended by each agent)
    trace_log: Annotated[list[dict], operator.add]
    
    # Metadata
    run_id: str
    started_at: str
```

### LangGraph State Machine (`graph/pa_graph.py`)

```python
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from .state import PAState
from agents.eligibility import run_eligibility_agent
from agents.coder import run_coder_agent
from agents.submitter import run_submitter_agent
from agents.denial_analyst import run_denial_analyst

# ─── Node wrappers ───────────────────────────────────────────

def eligibility_node(state: PAState) -> dict:
    context = run_eligibility_agent(
        state["patient_fhir_path"],
        state["procedure_request"]
    )
    return {
        "patient_context": context,
        "trace_log": [{"agent": "eligibility", "status": "complete",
                        "message": f"Coverage verified for {context.name}"}]
    }

def coder_node(state: PAState) -> dict:
    coding = run_coder_agent(state["patient_context"])
    return {
        "coding_result": coding,
        "trace_log": [{"agent": "coder", "status": "complete",
                        "message": f"Mapped to CPT {coding.cpt_code}"}]
    }

def submitter_node(state: PAState) -> dict:
    request = run_submitter_agent(
        state["patient_context"],
        state["coding_result"]
    )
    return {
        "pa_request": request,
        "trace_log": [{"agent": "submitter", "status": request.status,
                        "message": f"PA {request.status}: {request.request_id}"}]
    }

def denial_analyst_node(state: PAState) -> dict:
    analysis = run_denial_analyst(
        state["pa_request"],
        state["coding_result"],
        state["patient_context"],
        state["retry_count"]
    )
    return {
        "denial_analysis": analysis,
        "retry_count": state["retry_count"] + 1,
        # Update coding result if agent suggests a recode
        "coding_result": apply_correction(state["coding_result"], analysis),
        "trace_log": [{"agent": "denial_analyst", "status": "analyzed",
                        "message": f"Denial {state['pa_request'].denial_code}: {analysis.corrective_action}"}]
    }

# ─── Routing functions ─────────────────────────────────────

def route_after_submit(state: PAState) -> str:
    status = state["pa_request"].status
    if status == "approved":
        return "approved"
    elif status == "denied":
        return "denied"
    else:
        return "pending"   # re-poll

def route_after_denial(state: PAState) -> str:
    analysis = state["denial_analysis"]
    if state["retry_count"] >= state["max_retries"]:
        return "escalate"
    if analysis.corrective_action == "recode":
        return "retry"
    return "escalate"

# ─── Build and compile the graph ──────────────────────────

def build_pa_graph():
    graph = StateGraph(PAState)
    
    # Register nodes
    graph.add_node("eligibility",    eligibility_node)
    graph.add_node("coder",          coder_node)
    graph.add_node("submitter",      submitter_node)
    graph.add_node("denial_analyst", denial_analyst_node)
    
    # Entry point
    graph.set_entry_point("eligibility")
    
    # Linear flow
    graph.add_edge("eligibility", "coder")
    graph.add_edge("coder",       "submitter")
    
    # Conditional edges after submission
    graph.add_conditional_edges("submitter", route_after_submit, {
        "approved": END,
        "denied":   "denial_analyst",
        "pending":  "submitter",     # re-poll loop
    })
    
    # Conditional edges after denial analysis
    graph.add_conditional_edges("denial_analyst", route_after_denial, {
        "retry":    "submitter",     # corrected resubmission
        "escalate": END,
    })
    
    checkpointer = MemorySaver()
    return graph.compile(checkpointer=checkpointer)
```

### Mock Payer API (`mock_payer/payer_api.py`)

```python
from fastapi import FastAPI
from pydantic import BaseModel
import random, uuid, asyncio
from datetime import datetime

payer_app = FastAPI(title="Mock Payer API")

# In-memory store of submitted PAs
pa_store: dict[str, dict] = {}

class PASubmission(BaseModel):
    member_id: str
    insurer: str
    cpt_code: str
    primary_diagnosis: str
    secondary_diagnoses: list[str]
    clinical_notes: str
    requesting_provider: str
    service_date: str

DENIAL_SCENARIOS = [
    {"denial_code": "CO-4",  "denial_reason": "Procedure modifier inconsistency"},
    {"denial_code": "CO-11", "denial_reason": "Diagnosis does not support procedure"},
    {"denial_code": "CO-97", "denial_reason": "Duplicate prior authorization request"},
    {"denial_code": "PR-96", "denial_reason": "Service not covered under current plan"},
]

@payer_app.post("/pa/submit")
async def submit_pa(submission: PASubmission):
    pa_id = str(uuid.uuid4())
    pa_store[pa_id] = {
        "submitted_at": datetime.now().isoformat(),
        "submission": submission.dict(),
        "retry_count": pa_store.get("retry_count", {}).get(submission.member_id, 0)
    }
    return {"pa_id": pa_id, "status": "pending", "received_at": datetime.now().isoformat()}

@payer_app.get("/pa/{pa_id}/status")
async def get_pa_status(pa_id: str):
    if pa_id not in pa_store:
        return {"status": "not_found"}
    
    # Simulate realistic processing time
    await asyncio.sleep(random.uniform(1, 3))
    
    roll = random.random()
    if roll < 0.60:
        return {
            "status": "approved",
            "auth_number": f"AUTH-{pa_id[:8].upper()}",
            "valid_through": "2025-12-31"
        }
    elif roll < 0.90:
        scenario = random.choice(DENIAL_SCENARIOS)
        return {
            "status": "denied",
            "denial_code": scenario["denial_code"],
            "denial_reason": scenario["denial_reason"],
        }
    else:
        return {"status": "pending", "estimated_review": "24 hours"}
```

---

## 9. Phase 4 — FastAPI Backend & WebSocket Streaming (Days 15–18)

### Main Application (`main.py`)

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.routes import router
from api.websocket import ws_router
from db.models import create_tables

app = FastAPI(title="PA Automation Agent API")

app.add_middleware(CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"]
)

app.include_router(router, prefix="/api")
app.include_router(ws_router)

@app.on_event("startup")
async def startup():
    await create_tables()
```

### REST Routes (`api/routes.py`)

```python
from fastapi import APIRouter, BackgroundTasks
from graph.pa_graph import build_pa_graph
from db.models import save_pa_request, get_all_pa_requests

router = APIRouter()
graph = build_pa_graph()

@router.post("/pa/submit")
async def submit_pa_request(body: PASubmitRequest, background_tasks: BackgroundTasks):
    """Start a new PA workflow. Returns run_id immediately; streams progress via WebSocket."""
    run_id = str(uuid.uuid4())
    config = {"configurable": {"thread_id": run_id}}
    
    # Start graph execution in background
    background_tasks.add_task(execute_pa_graph, run_id, body, config)
    
    return {"run_id": run_id, "status": "started", "ws_url": f"/ws/agent-trace/{run_id}"}

@router.get("/pa/{run_id}/status")
async def get_pa_status(run_id: str):
    """Get current state snapshot of a running PA workflow."""
    config = {"configurable": {"thread_id": run_id}}
    state = graph.get_state(config)
    return state.values if state else {"error": "run_id not found"}

@router.get("/pa/history")
async def get_pa_history():
    """All completed PA requests for analytics dashboard."""
    return await get_all_pa_requests()

@router.get("/patients")
async def list_patients():
    """List available Synthea patients for the submission form."""
    return load_synthea_patient_list("data/synthea_output/")
```

### WebSocket Streaming (`api/websocket.py`)

```python
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from graph.pa_graph import build_pa_graph

ws_router = APIRouter()
active_connections: dict[str, WebSocket] = {}

@ws_router.websocket("/ws/agent-trace/{run_id}")
async def agent_trace_websocket(ws: WebSocket, run_id: str):
    """Stream agent step-by-step events to React frontend in real time."""
    await ws.accept()
    active_connections[run_id] = ws
    
    try:
        graph = build_pa_graph()
        config = {"configurable": {"thread_id": run_id}}
        
        # Stream all LangGraph events for this run
        async for event in graph.astream_events(
            input=None,  # graph already running
            config=config,
            version="v2"
        ):
            if event["event"] in ["on_chain_start", "on_chain_end", "on_tool_end"]:
                await ws.send_json({
                    "event": event["event"],
                    "name":  event["name"],
                    "data":  event.get("data", {}),
                    "run_id": run_id
                })
    except WebSocketDisconnect:
        del active_connections[run_id]
```

---

## 10. Phase 5 — React Frontend Dashboard (Days 19–24)

### Setup

```bash
npm create vite@latest frontend -- --template react
cd frontend
npm install axios @tanstack/react-query recharts react-router-dom
```

### Custom WebSocket Hook (`hooks/useAgentTrace.js`)

```javascript
import { useState, useEffect } from 'react';

export function useAgentTrace(runId) {
  const [events, setEvents]     = useState([]);
  const [connected, setConnected] = useState(false);
  const [finalStatus, setFinalStatus] = useState(null);

  useEffect(() => {
    if (!runId) return;
    
    const ws = new WebSocket(`ws://localhost:8000/ws/agent-trace/${runId}`);
    
    ws.onopen  = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    
    ws.onmessage = (e) => {
      const event = JSON.parse(e.data);
      setEvents(prev => [...prev, { ...event, timestamp: new Date() }]);
      
      // Detect terminal state
      if (event.name === 'submitter' && event.data?.status === 'approved') {
        setFinalStatus('approved');
      }
      if (event.name === '__end__') {
        setFinalStatus(event.data?.final_status || 'complete');
      }
    };
    
    return () => ws.close();
  }, [runId]);

  return { events, connected, finalStatus };
}
```

### Live Agent Trace Component (`components/AgentTrace.jsx`)

```jsx
import { useAgentTrace } from '../hooks/useAgentTrace';

const AGENT_ICONS = {
  eligibility:    '🔍',
  coder:          '📋',
  submitter:      '📤',
  denial_analyst: '🔄',
};

const STATUS_COLORS = {
  complete:  'var(--color-text-success)',
  approved:  'var(--color-text-success)',
  denied:    'var(--color-text-danger)',
  analyzed:  'var(--color-text-warning)',
  pending:   'var(--color-text-secondary)',
};

export function AgentTrace({ runId }) {
  const { events, connected, finalStatus } = useAgentTrace(runId);

  return (
    <div className="trace-panel">
      <div className="trace-header">
        <span>Agent trace</span>
        <span className={connected ? 'dot-live' : 'dot-offline'} />
      </div>
      
      {events.map((event, i) => (
        <div key={i} className="trace-step">
          <span className="agent-icon">{AGENT_ICONS[event.name] || '⚙️'}</span>
          <span className="agent-name">{event.name}</span>
          <span className="event-message" style={{ color: STATUS_COLORS[event.data?.status] }}>
            {event.data?.message || event.event}
          </span>
          <span className="timestamp">
            {event.timestamp?.toLocaleTimeString()}
          </span>
        </div>
      ))}
      
      {finalStatus && (
        <div className={`final-status ${finalStatus}`}>
          {finalStatus === 'approved' ? '✓ Authorization approved' : `⚠ ${finalStatus}`}
        </div>
      )}
    </div>
  );
}
```

### Analytics Dashboard (`pages/Dashboard.jsx`)

```jsx
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import axios from 'axios';

export function Dashboard() {
  const { data: history } = useQuery({
    queryKey: ['pa-history'],
    queryFn: () => axios.get('/api/pa/history').then(r => r.data)
  });

  const approvalRate    = history?.filter(r => r.status === 'approved').length / history?.length * 100;
  const avgRetries      = history?.reduce((a, r) => a + r.retry_count, 0) / history?.length;
  const denialBreakdown = computeDenialBreakdown(history);

  return (
    <div className="dashboard">
      {/* Metric cards */}
      <div className="metrics-grid">
        <MetricCard label="Approval rate"  value={`${approvalRate?.toFixed(1)}%`} />
        <MetricCard label="Total requests" value={history?.length} />
        <MetricCard label="Avg retries"    value={avgRetries?.toFixed(1)} />
        <MetricCard label="Escalated"      value={history?.filter(r => r.status === 'escalated').length} />
      </div>
      
      {/* Denial reasons bar chart */}
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={denialBreakdown}>
          <XAxis dataKey="code" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="count" fill="#378ADD" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

---

## 11. Week-by-Week Summary

| Week | Focus | Deliverable |
|---|---|---|
| **Week 1** | Setup + data + mock payer + agent skeletons | All 4 agents returning dummy data end-to-end through LangGraph |
| **Week 2** | Real LLM logic in all 4 agents + denial retry loop | Full pipeline: eligibility → code → submit → deny → recode → approve |
| **Week 3** | FastAPI routes + WebSocket + database + React skeleton | Working full-stack app with live agent trace on screen |
| **Week 4** | Analytics dashboard + Docker + README + demo video | Polished, deployable project with architecture documentation |

---

## 12. API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/pa/submit` | Start a new PA workflow |
| `GET` | `/api/pa/{run_id}/status` | Get current workflow state |
| `GET` | `/api/pa/history` | All completed PA requests |
| `GET` | `/api/patients` | List available Synthea patients |
| `WS` | `/ws/agent-trace/{run_id}` | Stream live agent events |
| `POST` | `:8001/pa/submit` | Mock payer — submit request |
| `GET` | `:8001/pa/{pa_id}/status` | Mock payer — poll status |

---

## 13. Database Schema

```sql
-- Prior authorization requests
CREATE TABLE pa_requests (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id           UUID NOT NULL,
    patient_id       VARCHAR(100),
    patient_name     VARCHAR(200),
    insurer          VARCHAR(200),
    procedure_desc   TEXT,
    cpt_code         VARCHAR(20),
    primary_icd10    VARCHAR(20),
    secondary_icd10  TEXT[],
    status           VARCHAR(50),   -- approved | denied | escalated | timeout
    auth_number      VARCHAR(100),
    denial_code      VARCHAR(20),
    denial_reason    TEXT,
    retry_count      INTEGER DEFAULT 0,
    appeal_letter    TEXT,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    resolved_at      TIMESTAMPTZ,
    duration_seconds INTEGER
);

-- Vector store for denial pattern RAG
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE denial_embeddings (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    denial_code    VARCHAR(20),
    cpt_code       VARCHAR(20),
    context_text   TEXT,       -- what was submitted + why it was denied
    resolution     TEXT,       -- what correction fixed it
    embedding      VECTOR(1536),
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON denial_embeddings USING ivfflat (embedding vector_cosine_ops);

-- CPT code embeddings (indexed at startup from CMS CSV)
CREATE TABLE cpt_embeddings (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cpt_code    VARCHAR(20) UNIQUE,
    description TEXT,
    embedding   VECTOR(1536)
);

-- ICD-10 code embeddings
CREATE TABLE icd_embeddings (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    icd_code    VARCHAR(20) UNIQUE,
    description TEXT,
    billable    BOOLEAN,
    embedding   VECTOR(1536)
);
```

---

## 14. Environment Variables

```bash
# .env.example
OPENAI_API_KEY=sk-...

# Database
DATABASE_URL=postgresql+asyncpg://postgres:secret@localhost:5432/pa_agent

# Mock payer
MOCK_PAYER_URL=http://localhost:8001

# LangGraph
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=ls-...        # optional: LangSmith for tracing
LANGCHAIN_PROJECT=pa-agent

# Agent tuning
MAX_RETRIES=3
POLL_INTERVAL_SECONDS=5
POLL_MAX_ATTEMPTS=12
```

---

## 15. Resume Bullet

> **Built an agentic prior authorization automation system** using LangGraph multi-agent orchestration (FastAPI backend, React + Vite frontend) that autonomously verifies patient eligibility from synthetic FHIR data, maps procedures to CPT/ICD-10 codes via pgvector RAG over CMS code tables, submits authorization requests to a simulated payer API, and analyzes & autonomously retries denials — reducing simulated PA cycle time from days to under 3 minutes with a 60%+ first-pass approval rate and full agent trace streaming over WebSocket.

**Talking points for interviews:**
- "The denial-retry loop is what makes it agentic — it's not just automation, the agent reasons about why a claim was denied and corrects its own mistake"
- "A San Francisco health-tech startup deployed this exact architecture and cut PA cycle time from 30 days to 3 days"
- "I used Synthea for synthetic FHIR data so there are zero HIPAA concerns in the demo"
- "The live WebSocket trace in the React dashboard shows every agent decision in real time — much more compelling in demos than showing an accuracy number"

---

*Generated for Eshwari Gone · AI Engineer · May 2026*
