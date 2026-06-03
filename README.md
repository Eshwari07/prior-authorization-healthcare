# 🏥 Prior Authorization Automation — Agentic AI

An agentic system that automates the US healthcare **prior authorization (PA)** workflow end-to-end: it verifies patient eligibility, maps the procedure to billing codes, submits the request to a payer, and — when denied — **reasons about the denial, corrects its own submission, and retries**. Every agent decision is shown transparently in a modern Next.js UI with live streaming.

Built with **LangGraph** (multi-agent orchestration), **OpenRouter** (LLMs), **Qdrant Cloud** (vector RAG), and **Neon** (PostgreSQL). Frontend deploys to **Vercel**, backend to **Hugging Face Spaces**.

---

## Why this is *agentic*, not just automated

A simple automation stops at a denial. This system runs a **denial → root-cause analysis → correction → resubmit** loop (up to 3 attempts), the same cognitive work a senior billing specialist does manually. The mock payer is **deterministic** (rule-based), so the agent's corrections genuinely resolve denials — its intelligence is demonstrable, not random.

---

## Architecture

```
  Next.js Frontend (frontend/)          FastAPI Backend (api/)
  ─────────────────────────────         ──────────────────────────────
  React + Tailwind + shadcn/ui   HTTP   FastAPI + SSE streaming
  Vercel (free)               ◄──────►  Hugging Face Spaces (Docker, free)
                                                │
                                        LangGraph StateGraph
                                                │
                              ┌─────────────────┼────────────────────┐
                              ▼                 ▼                     ▼
                          Agent 1           Agent 2              Agent 3/4
                          Eligibility  →    Coder       →        Submitter
                          (Model A)         (Model A)            (Model B)
                                                                      │ denied
                                                                      ▼
                                                              Denial Analyst (Model B)
                                                                      │
                                                          retry ◄─────┴──► escalate
```

| Component | Tech |
|---|---|
| Orchestration | LangGraph |
| LLMs | OpenRouter — Model A (fast), Model B (reasoning), free fallback |
| Embeddings | sentence-transformers `all-MiniLM-L6-v2` (local, free) |
| Vector store / RAG | Qdrant Cloud |
| Database | Neon (serverless PostgreSQL) |
| Frontend | Next.js 14 + Tailwind CSS + Lucide icons |
| Frontend host | Vercel (free) |
| Backend API | FastAPI + uvicorn (SSE streaming) |
| Backend host | Hugging Face Spaces — Docker (free, 16GB RAM) |
| Mock payer | Deterministic inline Python module |

### The 4 Agents

1. **Eligibility Verifier** (Model A) — parses the patient FHIR bundle, confirms active coverage, decides whether PA is required. Early-exits on *patient not found*, *inactive coverage*, or *no PA required*.
2. **Prior Auth Coder** (Model A + Qdrant RAG) — maps the plain-English procedure to a CPT/HCPCS code and selects supporting ICD-10 diagnoses, avoiding vague symptom codes.
3. **PA Submitter** (Model B) — assembles the request and submits to the deterministic mock payer.
4. **Denial Analyst** (Model B + Qdrant RAG over denial history) — diagnoses the denial root cause, corrects the coding and retries, or generates an appeal letter and escalates.

---

## Data Sources

| Data | Source | Status |
|---|---|---|
| ICD-10-CM diagnosis codes | CMS FY2024 official release (`icd10cm_codes_2024.txt`) | **Real** |
| Procedure (CPT/HCPCS) codes | Curated set of real, publicly-known codes (`data/hcpcs_codes/procedures.csv`) | **Real codes**, curated subset |
| Patient records | Synthea-format synthetic FHIR bundles (`data/patients/`) | Synthetic (zero HIPAA risk) |
| PA requirement rules | Modeled on common commercial payer policies (`data/pa_required_codes.json`) | Representative |
| Denial reason codes | X12 CARC standard subset | **Real** standard |
| Denial history (RAG seed) | 30 synthetic resolution cases (`data/seed_denials.json`) | Synthetic |

> **Note:** The `FY24-CMS-1785-F-Code-Descriptions/` folder holds the official CMS ICD-10-CM code descriptions. PA-requirement mappings are modeled (not from that folder) since payer PA policies are proprietary.

---

## Setup (Local)

### 1. Prerequisites
- Python 3.11
- Free accounts: [OpenRouter](https://openrouter.ai), [Qdrant Cloud](https://cloud.qdrant.io), [Neon](https://neon.tech)

### 2. Install
```powershell
py -3.11 -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt
```

### 3. Configure
Copy `.env.example` to `.env` and fill in your keys:
```
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL_A=qwen/qwen3-coder:free
OPENROUTER_MODEL_B=openrouter/owl-alpha
OPENROUTER_FALLBACK=nvidia/nemotron-3-super-120b-a12b:free
QDRANT_URL=https://xxxx.aws.cloud.qdrant.io
QDRANT_API_KEY=...
NEON_DATABASE_URL=postgresql://...
```

### 4. Index data (one time)
```powershell
# Quick: 5k ICD-10 subset (~30s).  Full: omit --quick (~10 min, ~77k codes)
.\venv\Scripts\python.exe -m scripts.setup_data --quick
```

### 5. Run
```powershell
.\venv\Scripts\python.exe -m streamlit run app.py
```
Open http://localhost:8501

---

## Try It — Demo Scenarios

| Patient | Procedure | What happens |
|---|---|---|
| **Jane Doe** | `MRI of the lower back` | ✅ Approved (happy path; coder picks disc-degeneration M51.16 over symptom code) |
| **Robert Smith** | `total knee replacement` | ❌ CO-4 missing modifier → 🔄 agent adds RT modifier → ✅ approved on retry |
| **Maria Garcia** | `laparoscopic hysterectomy` | ❌ PR-96 Medicare exclusion → ⚠️ appeal letter generated → escalated |
| **James Wilson** | *(any)* | ⛔ Ineligible — coverage cancelled (early exit with reasoning) |

Quick CLI smoke test:
```powershell
.\venv\Scripts\python.exe -m scripts.smoke_test "Robert Smith" "total knee replacement"
```

---

## Local Development

### 1. Start the FastAPI backend
```powershell
.\venv\Scripts\python.exe -m uvicorn api.main:app --reload --port 8000
```

### 2. Start the Next.js frontend
```powershell
cd frontend
npm install        # first time only
npm run dev        # runs on http://localhost:3000
```

Set `NEXT_PUBLIC_API_URL=http://localhost:8000` in `frontend/.env.local`.

---

## Deploy to Production (Free)

### Backend → Hugging Face Spaces

1. Create a new Space at [huggingface.co/new-space](https://huggingface.co/new-space) — choose **Docker** SDK.
2. Push this repo (the `api/` folder contains the `Dockerfile`).
3. Add your secrets in **Settings → Repository secrets**:
   ```
   OPENROUTER_API_KEY, OPENROUTER_MODEL_A, OPENROUTER_MODEL_B,
   QDRANT_URL, QDRANT_API_KEY, NEON_DATABASE_URL
   ```
4. HF Spaces will build and expose your API at `https://YOUR_HF_USERNAME-prior-auth-api.hf.space`.

### Frontend → Vercel

1. Push this repo to GitHub.
2. At [vercel.com/new](https://vercel.com/new): **Import** the repo → set **Root Directory** to `frontend`.
3. Add environment variable: `NEXT_PUBLIC_API_URL=https://YOUR_HF_USERNAME-prior-auth-api.hf.space`
4. Deploy. Done.

> Run `python -m scripts.setup_data` once locally to populate Qdrant — cloud deployments reuse that same cluster.

---

## Project Structure

```
api/             FastAPI backend (main.py, Dockerfile, requirements.txt)
frontend/        Next.js frontend (app/, components/, lib/)
agents/          4 agent implementations
graph/           LangGraph state + state machine
data/            patients (FHIR), ICD-10, procedures, PA rules, seed denials
mock_payer/      deterministic inline payer
vector_store/    Qdrant Cloud wrapper + embeddings
db/              Neon PostgreSQL persistence
utils/           FHIR parser, data loader, OpenRouter LLM client
scripts/         setup_data.py (indexing), smoke_test.py (e2e test)
config.py        Central configuration (env vars)
```

---

*Personal project. Uses only synthetic patient data — no real PHI, no HIPAA exposure.*
