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
HA_HTTP_PORT=8123
BRIDGE_HTTP_PORT=8787
EOF"

# nginx on the host owns port 80 and reverse-proxies to the Home Assistant and
# varco-bridge containers (which bind localhost only). Install/refresh the
# committed site config on every deploy so the ingress is reproducible and the
# bridge route can never be silently dropped.
ssh "${SSH_ARGS[@]}" "$SSH_TARGET" "mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled"
rsync -az "$SCRIPT_DIR/nginx-varco.conf" "$SSH_TARGET:/etc/nginx/sites-available/varco"

ssh "${SSH_ARGS[@]}" "$SSH_TARGET" "cd '$REMOTE_DIR' && \
  if ! command -v docker >/dev/null 2>&1; then \
    SUDO=; command -v sudo >/dev/null 2>&1 && SUDO=sudo; \
    \$SUDO apt-get update; \
    \$SUDO apt-get install -y ca-certificates curl docker.io docker-compose-v2 || \$SUDO apt-get install -y ca-certificates curl docker.io docker-compose; \
    \$SUDO systemctl enable --now docker; \
  fi && \
  if ! command -v nginx >/dev/null 2>&1; then \
    SUDO=; command -v sudo >/dev/null 2>&1 && SUDO=sudo; \
    \$SUDO apt-get update; \
    \$SUDO apt-get install -y nginx; \
  fi && \
  rm -f /etc/nginx/sites-enabled/default && \
  ln -sf /etc/nginx/sites-available/varco /etc/nginx/sites-enabled/varco && \
  nginx -t && \
  (systemctl reload nginx || systemctl restart nginx || nginx -s reload) && \
  docker compose pull && \
  docker compose up -d --force-recreate --remove-orphans && \
  docker system prune -af"

# Verify both backends are reachable through the host before declaring success.
ssh "${SSH_ARGS[@]}" "$SSH_TARGET" "set -e; \
  for i in \$(seq 1 60); do \
    ha=\$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8123/ || true); \
    br=\$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8787/health || true); \
    if [ \"\$ha\" = '200' ] && [ \"\$br\" = '200' ]; then \
      echo \"Home Assistant (\$ha) and varco-bridge (\$br) are up\"; exit 0; \
    fi; \
    sleep 5; \
  done; \
  echo \"Backends did not become healthy: HA=\$ha bridge=\$br\" >&2; \
  docker compose ps; exit 1"

echo "Home Assistant showcase deployment started on $SSH_TARGET"
echo "Bridge container varco-bridge bound to 127.0.0.1:8787; HA bound to 127.0.0.1:8123; nginx fronts :80"
