#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_ENV="$ROOT_DIR/.local-secrets/compose.env"

if [[ -n "${DATABASE_URL:-}" ]]; then
  cd "$ROOT_DIR"
  exec npm run test:integration:revisions --workspace=packages/database
fi

if [[ ! -f "$COMPOSE_ENV" ]]; then
  echo "Local Compose configuration is missing. Run npm run dev:local once." >&2
  exit 1
fi

cd "$ROOT_DIR"
docker compose --env-file "$COMPOSE_ENV" run --rm --build database-setup sh -c '
  npm run db:migrate:deploy --workspace=packages/database &&
  npm run db:seed --workspace=packages/database &&
  npm run db:seed:policies --workspace=packages/database &&
  npm run test:integration:revisions --workspace=packages/database
'
