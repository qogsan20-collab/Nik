#!/usr/bin/env bash

# Starter script for deploying the QOG app to Google Cloud Run.
# Customize the variables below or export them before invoking this script.

set -euo pipefail

log() {
  echo "[INFO] $*"
}

warn() {
  echo "[WARN] $*" >&2
}

fatal() {
  echo "[ERROR] $*" >&2
  exit 1
}

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-${PROJECT_ID:-}}"
REGION="${GOOGLE_CLOUD_REGION:-${REGION:-us-central1}}"
SERVICE_NAME="${CLOUD_RUN_SERVICE:-${SERVICE_NAME:-qog-web}}"
ARTIFACT_REPO="${ARTIFACT_REPO:-qog-web}"
IMAGE_TAG="${IMAGE_TAG:-$(date +%Y%m%d-%H%M%S)}"
DOCKERFILE="${DOCKERFILE:-Dockerfile}"
BUILD_CONTEXT="${BUILD_CONTEXT:-$REPO_ROOT}"
GEMINI_SECRET_NAME="${GEMINI_SECRET_NAME:-}"

[[ -n "${1:-}" && "${1}" == "--help" ]] && {
  cat <<'EOF'
Usage: ./deploy_cloud_run.sh

Environment variables (override defaults by exporting before running):
  PROJECT_ID / GOOGLE_CLOUD_PROJECT   Required. Your GCP project id.
  REGION / GOOGLE_CLOUD_REGION        Cloud Run region (default: us-central1).
  SERVICE_NAME / CLOUD_RUN_SERVICE    Cloud Run service name (default: qog-web).
  ARTIFACT_REPO                       Artifact Registry repository (default: qog-web).
  IMAGE_TAG                           Image tag (default: timestamp).
  DOCKERFILE                          Path to Dockerfile (default: Dockerfile).
  BUILD_CONTEXT                       Build context directory (default: repo root).
  GEMINI_SECRET_NAME                  Optional Secret Manager secret to mount as GEMINI_API_KEY.

You must have a Dockerfile in the repository root before running this script.
EOF
  exit 0
}

command -v gcloud >/dev/null 2>&1 || fatal "gcloud CLI not found. Install the Google Cloud SDK first."

if [[ -z "$PROJECT_ID" ]]; then
  read -r -p "Enter your GCP project id: " PROJECT_ID
fi
[[ -n "$PROJECT_ID" ]] || fatal "Project id is required."

[[ -f "$REPO_ROOT/$DOCKERFILE" ]] || fatal "Dockerfile '$REPO_ROOT/$DOCKERFILE' not found. Create your container definition first."

log "Setting active project to $PROJECT_ID"
gcloud config set project "$PROJECT_ID" >/dev/null

log "Ensuring required Google Cloud APIs are enabled"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com --project "$PROJECT_ID"

ARTIFACT_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPO}"
IMAGE_URI="${ARTIFACT_URI}/${SERVICE_NAME}:${IMAGE_TAG}"

if ! gcloud artifacts repositories describe "$ARTIFACT_REPO" --location="$REGION" --project "$PROJECT_ID" >/dev/null 2>&1; then
  log "Artifact Registry '$ARTIFACT_REPO' not found in $REGION. Creating it."
  gcloud artifacts repositories create "$ARTIFACT_REPO" \
    --repository-format=docker \
    --location="$REGION" \
    --description="Container images for QOG" \
    --project "$PROJECT_ID"
else
  log "Using existing Artifact Registry '$ARTIFACT_REPO' in $REGION"
fi

log "Building container image ${IMAGE_URI}"
if [[ -f "$REPO_ROOT/cloudbuild.yaml" ]]; then
  gcloud builds submit "$BUILD_CONTEXT" --config "$REPO_ROOT/cloudbuild.yaml" --project "$PROJECT_ID"
else
  gcloud builds submit "$BUILD_CONTEXT" --tag "$IMAGE_URI" --project "$PROJECT_ID"
fi

DEPLOY_ARGS=(
  gcloud run deploy "$SERVICE_NAME"
  --image "$IMAGE_URI"
  --region "$REGION"
  --project "$PROJECT_ID"
  --allow-unauthenticated
)

if [[ -n "$GEMINI_SECRET_NAME" ]]; then
  DEPLOY_ARGS+=(--set-secrets "GEMINI_API_KEY=${GEMINI_SECRET_NAME}:latest")
elif [[ -n "${GEMINI_API_KEY:-}" ]]; then
  warn "Deploying with GEMINI_API_KEY provided directly via environment variable. Prefer Secret Manager in production."
  DEPLOY_ARGS+=(--set-env-vars "GEMINI_API_KEY=${GEMINI_API_KEY}")
else
  warn "No Gemini API secret configured. Deployment will fail unless the service already has GEMINI_API_KEY configured."
fi

log "Deploying service $SERVICE_NAME to Cloud Run"
"${DEPLOY_ARGS[@]}"

log "Deployment complete. Fetching service URL..."
SERVICE_URL="$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --project "$PROJECT_ID" --format 'value(status.url)')"
log "Cloud Run service available at: $SERVICE_URL"

log "Remember to update your frontend configuration (e.g., VITE_API_URL) to point to the Cloud Run URL."
