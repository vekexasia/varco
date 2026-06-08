#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "Usage: $0 SSH_TARGET [REMOTE_DIR]" >&2
  echo "Example: $0 ci-target /opt/varco-ha-showcase" >&2
  exit 2
fi

SSH_TARGET="$1"
REMOTE_DIR="${2:-/opt/varco-ha-showcase}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

if [[ ! -d "$REPO_ROOT/custom_components/varco" ]]; then
  echo "custom_components/varco not found from $REPO_ROOT" >&2
  exit 1
fi

SSH_ARGS=()
if [[ -n "${SSH_PORT:-}" ]]; then
  SSH_ARGS=(-p "$SSH_PORT")
  export RSYNC_RSH="${RSYNC_RSH:-ssh -p $SSH_PORT}"
fi

ssh "${SSH_ARGS[@]}" "$SSH_TARGET" "mkdir -p '$REMOTE_DIR/config'"
rsync -az --delete \
  --exclude '.storage/' \
  --exclude '.cloud/' \
  --exclude '.cache/' \
  --exclude 'deps/' \
  --exclude '*.db' \
  --exclude '*.db-*' \
  --exclude 'home-assistant.log*' \
  "$SCRIPT_DIR/" "$SSH_TARGET:$REMOTE_DIR/"
ssh "${SSH_ARGS[@]}" "$SSH_TARGET" "mkdir -p '$REMOTE_DIR/custom_components/varco'"
rsync -az --delete "$REPO_ROOT/custom_components/varco/" "$SSH_TARGET:$REMOTE_DIR/custom_components/varco/"
ssh "${SSH_ARGS[@]}" "$SSH_TARGET" "cat > '$REMOTE_DIR/.env' <<EOF
VARCO_INTEGRATION_PATH=$REMOTE_DIR/custom_components/varco
HA_HTTP_PORT=${HA_HTTP_PORT:-8123}
EOF"

ssh "${SSH_ARGS[@]}" "$SSH_TARGET" "cd '$REMOTE_DIR' && \
  if ! command -v docker >/dev/null 2>&1; then \
    SUDO=; command -v sudo >/dev/null 2>&1 && SUDO=sudo; \
    \$SUDO apt-get update; \
    \$SUDO apt-get install -y ca-certificates curl docker.io docker-compose-v2 || \$SUDO apt-get install -y ca-certificates curl docker.io docker-compose; \
    \$SUDO systemctl enable --now docker; \
  fi && \
  docker compose pull && \
  docker compose up -d --force-recreate --remove-orphans homeassistant && \
  docker system prune -af"

echo "Home Assistant showcase deployment started on $SSH_TARGET"
echo "Open http://<container-or-host-ip>:${HA_HTTP_PORT:-8123}"
