#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMP_BASE="${TMPDIR:-/tmp}"
TEST_ROOT="$(mktemp -d "$TEMP_BASE/api-gateway-platform-e2e.XXXXXX")"
RUN_SUFFIX="$(basename "$TEST_ROOT" | tr '[:upper:]._' '[:lower:]--')"
COMPOSE_PROJECT="api-gateway-platform-e2e-${RUN_SUFFIX##*-}"
SECRETS_DIR="$TEST_ROOT/secrets"
SDS_DIR="$TEST_ROOT/sds"
COMPOSE_ENV="$SECRETS_DIR/compose.env"
COMPOSE_FILES="$ROOT_DIR/docker-compose.yml:$ROOT_DIR/docker-compose.e2e.yml"

compose_arguments=(
  compose
  --project-name "$COMPOSE_PROJECT"
  --file "$ROOT_DIR/docker-compose.yml"
  --file "$ROOT_DIR/docker-compose.e2e.yml"
  --env-file "$COMPOSE_ENV"
)

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM
  docker "${compose_arguments[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true
  case "$TEST_ROOT" in
    "$TEMP_BASE"/api-gateway-platform-e2e.*)
      rm -rf -- "$TEST_ROOT"
      ;;
    *)
      printf 'Refusing to remove unexpected test directory: %s\n' "$TEST_ROOT" >&2
      exit_code=1
      ;;
  esac
  exit "$exit_code"
}
trap cleanup EXIT INT TERM

if [[ "$SECRETS_DIR" == "$ROOT_DIR/.local-secrets" || "$SDS_DIR" == "$ROOT_DIR/infra/envoy/sds" ]]; then
  echo 'Platform E2E resources must not use normal local runtime paths.' >&2
  exit 1
fi

export PLATFORM_SECRETS_DIR="$SECRETS_DIR"
export PLATFORM_SDS_DIR="$SDS_DIR"
export PLATFORM_KEYCLOAK_URL="http://localhost:18081"
export PLATFORM_KEYCLOAK_PORT="18081"
export PLATFORM_ADMIN_PANEL_URL="http://localhost:18080"
export PLATFORM_ADMIN_PANEL_PORT="18080"
export PLATFORM_GATEWAY_PORT="18443"
export PLATFORM_COMPOSE_PROJECT="$COMPOSE_PROJECT"
export PLATFORM_COMPOSE_FILES="$COMPOSE_FILES"

PLATFORM_BOOTSTRAP_ONLY=1 bash "$ROOT_DIR/scripts/dev-local.sh"

docker "${compose_arguments[@]}" config --format json \
  | node "$ROOT_DIR/scripts/assert-platform-test-isolation.mjs" "$TEST_ROOT" "$COMPOSE_PROJECT"

if [[ "${PLATFORM_TEST_CONFIG_ONLY:-0}" == "1" ]]; then
  exit 0
fi

docker "${compose_arguments[@]}" up --build --force-recreate --detach

export PLATFORM_TEST_SECRETS_DIR="$SECRETS_DIR"
export PLATFORM_TEST_COMPOSE_ENV="$COMPOSE_ENV"
export PLATFORM_TEST_KEYCLOAK_URL="$PLATFORM_KEYCLOAK_URL"
export PLATFORM_TEST_ADMIN_PANEL_URL="$PLATFORM_ADMIN_PANEL_URL"
export PLATFORM_TEST_GATEWAY_PORT="$PLATFORM_GATEWAY_PORT"
export PLATFORM_TEST_GATEWAY_INSTANCE_ID="gateway-e2e"
export PLATFORM_TEST_COMPOSE_PROJECT="$COMPOSE_PROJECT"
export PLATFORM_TEST_COMPOSE_FILES="$COMPOSE_FILES"

node "$ROOT_DIR/scripts/test-platform.mjs"
