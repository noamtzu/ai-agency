#!/usr/bin/env sh
set -eu

# Brings up the stack with an automatic decision:
# - If an NVIDIA GPU is detected on the host, enable the `gpu` compose profile (starts `gpu_server`)
# - Otherwise, bring up the non-GPU services only (local dev friendly)
#
# NOTE: This script is intentionally POSIX `sh` (not bash) so it runs reliably on Ubuntu/Debian VMs.

ROOT_DIR="$(CDPATH= cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

has_nvidia_gpu() {
  command -v nvidia-smi >/dev/null 2>&1 || return 1
  nvidia-smi -L >/dev/null 2>&1 || return 1
  return 0
}

COMPOSE_PROFILES_EFFECTIVE="${COMPOSE_PROFILES-}"

if [ -z "$COMPOSE_PROFILES_EFFECTIVE" ]; then
  if has_nvidia_gpu; then
    COMPOSE_PROFILES_EFFECTIVE="gpu"
  else
    COMPOSE_PROFILES_EFFECTIVE=""
  fi
fi

export COMPOSE_PROFILES="$COMPOSE_PROFILES_EFFECTIVE"

if [ -z "${COMPOSE_PROFILES-}" ]; then
  echo "COMPOSE_PROFILES=<empty>"
else
  echo "COMPOSE_PROFILES=$COMPOSE_PROFILES"
fi

docker compose up -d --build


