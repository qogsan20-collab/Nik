# Simple Dockerfile to containerize the Flask backend for Cloud Run
# - Uses Python slim base
# - Installs backend requirements (plus gunicorn)
# - Runs gunicorn binding to $PORT

FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8080

WORKDIR /app

# System deps (if any are needed later, add here)
RUN apt-get update -y && apt-get install -y --no-install-recommends \
    ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Copy only backend requirements first (better layer cache)
COPY backend/requirements.txt /app/backend/requirements.txt
RUN python -m pip install --upgrade pip \
 && pip install -r /app/backend/requirements.txt \
 && pip install gunicorn

# Copy backend app code (exclude venv via .dockerignore)
COPY backend /app/backend

WORKDIR /app/backend

# Cloud Run will provide $PORT. Expose for local clarity.
EXPOSE 8080

# Start the Flask app with Gunicorn
CMD exec gunicorn -b 0.0.0.0:"${PORT}" app:app --workers 2 --threads 4 --timeout 120

