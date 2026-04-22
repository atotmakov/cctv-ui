#!/usr/bin/env bash
set -euo pipefail

# ── Load deploy config ────────────────────────────────────────────────────────
if [[ ! -f .env.deploy ]]; then
  echo "ERROR: .env.deploy not found. Copy .env.deploy.example and fill it in." >&2
  exit 1
fi
# shellcheck disable=SC1091
source .env.deploy

NAS_HOST="${NAS_HOST:?NAS_HOST must be set in .env.deploy}"
NAS_USER="${NAS_USER:?NAS_USER must be set in .env.deploy}"
NAS_DIR="${NAS_DIR:-/volume1/docker/cctv-ui}"
SSH_KEY="${SSH_KEY:-}"

# Build SSH/SCP option arrays
SSH_OPTS=(-o StrictHostKeyChecking=no -o BatchMode=yes)
if [[ -n "$SSH_KEY" ]]; then
  SSH_OPTS+=(-i "$SSH_KEY")
fi

IMAGE="${IMAGE:-ghcr.io/atotmakov/cctv-ui:latest}"
ARCHIVE="cctv-ui.tar.gz"

# ── Step 1: Pull Docker image from GitHub Container Registry ─────────────────
echo "==> Pulling Docker image ${IMAGE}..."
docker pull "$IMAGE"
docker tag "$IMAGE" cctv-ui

# ── Step 2: Export image to archive ──────────────────────────────────────────
echo "==> Exporting image to ${ARCHIVE}..."
docker save cctv-ui | gzip > "$ARCHIVE"

# ── Step 3: Upload archive + compose file ────────────────────────────────────
echo "==> Uploading to ${NAS_USER}@${NAS_HOST}:${NAS_DIR}/ ..."
ssh "${SSH_OPTS[@]}" "${NAS_USER}@${NAS_HOST}" "mkdir -p '${NAS_DIR}'"
scp "${SSH_OPTS[@]}" "$ARCHIVE" docker-compose.yml "${NAS_USER}@${NAS_HOST}:${NAS_DIR}/"

# ── Step 4: Load image and restart container on NAS ──────────────────────────
echo "==> Loading image and starting container on NAS..."
ssh "${SSH_OPTS[@]}" "${NAS_USER}@${NAS_HOST}" bash <<REMOTE
set -euo pipefail
cd '${NAS_DIR}'
echo "  -> Loading image..."
docker load < '${ARCHIVE}'
rm -f '${ARCHIVE}'
echo "  -> Starting container..."
docker compose up -d --remove-orphans
docker compose ps
REMOTE

# ── Step 5: Clean up local archive ───────────────────────────────────────────
echo "==> Cleaning up local archive..."
rm -f "$ARCHIVE"

echo ""
echo "Done! App is available at http://${NAS_HOST}:8888"
