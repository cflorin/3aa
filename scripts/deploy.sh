#!/usr/bin/env bash
# Deploy 3AA to Cloud Run via Cloud Build
# Usage:
#   ./scripts/deploy.sh          — submit build, stream logs, wait for result
#   ./scripts/deploy.sh --async  — submit build and return immediately (prints build ID)
#
# Pipeline: unit tests → Docker build → push → DB migrations → Cloud Run deploy

set -euo pipefail

PROJECT="aa-investor"
REGION="us-central1"
SERVICE="aaa-web"
CONFIG="cloudbuild.yaml"
ASYNC=false

for arg in "$@"; do
  case $arg in
    --async) ASYNC=true ;;
    --help|-h)
      echo "Usage: ./scripts/deploy.sh [--async]"
      echo "  --async   Submit build without waiting (prints build ID + log URL)"
      exit 0
      ;;
  esac
done

# Verify we're in the repo root
if [ ! -f "$CONFIG" ]; then
  echo "ERROR: Must be run from repo root (cloudbuild.yaml not found)"
  exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  3AA Cloud Run Deploy"
echo "  Project : $PROJECT"
echo "  Service : $SERVICE  ($REGION)"
echo "  Commit  : $(git rev-parse --short HEAD) — $(git log -1 --format='%s' | cut -c1-60)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if $ASYNC; then
  BUILD_OUTPUT=$(gcloud builds submit \
    --config="$CONFIG" \
    --project="$PROJECT" \
    --async \
    --format="value(id)" \
    . 2>&1)
  BUILD_ID=$(echo "$BUILD_OUTPUT" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
  echo "Build submitted (async)"
  echo "  ID  : $BUILD_ID"
  echo "  Logs: https://console.cloud.google.com/cloud-build/builds/$BUILD_ID?project=$PROJECT"
  echo ""
  echo "Check status:  gcloud builds describe $BUILD_ID --format='value(status)'"
  echo "Stream logs:   gcloud builds log $BUILD_ID --stream"
else
  echo "Submitting build and streaming logs…"
  echo "(Pipeline: npm ci → unit tests → docker build → push → migrate → deploy)"
  echo ""
  gcloud builds submit \
    --config="$CONFIG" \
    --project="$PROJECT" \
    .
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Deploy complete"
  echo "  URL: https://${SERVICE}-717628686883.${REGION}.run.app"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
fi
