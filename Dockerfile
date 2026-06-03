FROM python:3.11-slim

WORKDIR /app

# System deps for psycopg2 + sentence-transformers
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev && rm -rf /var/lib/apt/lists/*

# Copy entire project so api/ can import agents/, graph/, etc.
COPY . .

# Install backend dependencies
RUN pip install --no-cache-dir -r api/requirements.txt

# Regenerate the denormalized patient table from the FHIR bundles at build time
# so the reference panel always has fresh data regardless of the committed CSV.
RUN python scripts/generate_patients_csv.py

EXPOSE 7860

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "7860"]
