#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# fault-inject.sh — inject/clear a simulated health fault for a demo camera.
#
# The backend's health checkers read `sim:fault:<cameraCode>` from Redis when
# HEALTH_SIM_MODE=true (see backend/src/modules/health/health.checkers.ts) and
# synthesize the matching failure/diagnosis instead of touching real hardware.
#
# Usage:
#   ./fault-inject.sh CAM-001 CAMERA_OFFLINE
#   ./fault-inject.sh CAM-001 clear
#   ./fault-inject.sh --list
#
# Valid FAULT values (must match backend SimFault union exactly):
#   SITE_INTERNET_DOWN  SIM_SIGNAL_ISSUE  NETWORK_UNSTABLE  CAMERA_OFFLINE
#   CONFIG_ERROR        STREAM_DEGRADED  IMAGE_PROBLEM
#
# Env overrides:
#   REDIS_CLI   redis-cli binary/wrapper to use     (default: redis-cli)
#   REDIS_HOST  host redis-cli connects to          (default: localhost)
#   REDIS_PORT  port redis-cli connects to          (default: 6379)
#   REDIS_ARGS  extra args passed through as-is, e.g. "-a mypassword"
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REDIS_CLI="${REDIS_CLI:-redis-cli}"
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_ARGS="${REDIS_ARGS:-}"

VALID_FAULTS=(SITE_INTERNET_DOWN SIM_SIGNAL_ISSUE NETWORK_UNSTABLE CAMERA_OFFLINE CONFIG_ERROR STREAM_DEGRADED IMAGE_PROBLEM)

usage() {
  echo "Usage: $0 <CAM-00X> <FAULT|clear>" >&2
  echo "       $0 --list" >&2
  echo "Valid faults: ${VALID_FAULTS[*]}" >&2
  exit 1
}

run_redis() {
  # shellcheck disable=SC2086
  "$REDIS_CLI" -h "$REDIS_HOST" -p "$REDIS_PORT" $REDIS_ARGS "$@"
}

if [[ "${1:-}" == "--list" ]]; then
  echo "Active sim faults:"
  for key in $(run_redis --scan --pattern 'sim:fault:*'); do
    value=$(run_redis get "$key")
    echo "  ${key#sim:fault:} -> ${value}"
  done
  exit 0
fi

[[ $# -eq 2 ]] || usage
CAMERA_CODE="$1"
FAULT="$2"
KEY="sim:fault:${CAMERA_CODE}"

if [[ "$FAULT" == "clear" ]]; then
  run_redis del "$KEY" >/dev/null
  echo "Cleared fault for ${CAMERA_CODE}"
  exit 0
fi

valid=false
for f in "${VALID_FAULTS[@]}"; do
  [[ "$f" == "$FAULT" ]] && valid=true && break
done
if [[ "$valid" != "true" ]]; then
  echo "Unknown fault '$FAULT'." >&2
  usage
fi

run_redis set "$KEY" "$FAULT" >/dev/null
echo "Injected ${FAULT} on ${CAMERA_CODE} (key ${KEY})"
