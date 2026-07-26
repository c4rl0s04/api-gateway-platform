---
title: How to Start the Project
type: guide
doc_status: current
implementation_status: implemented
last_verified: 2026-07-27
tags:
  - type/guide
  - area/operations
sources:
  - package.json
  - .env.example
  - docker-compose.yml
  - scripts/dev-local.sh
  - infra/docker/Dockerfile.dev
  - packages/database/package.json
  - packages/gateway-core/package.json
aliases: []
---

# How to Start the Project

> [!summary] At a glance
> Run `npm run dev:local` to prepare cryptographic material, migrate and seed PostgreSQL, and start the complete local data plane.

## Goal

Run the implemented data-plane flow locally with one command.

## Prerequisites

| Requirement | Minimum |
| --- | --- |
| Node.js | `22.19.0` |
| npm | Version bundled with the selected Node.js release |
| Docker | A release with Compose v2 |

## Steps

1. Start the complete environment in the foreground.

```bash
npm run dev:local
```

The bootstrap script generates reusable local-only files under
`.local-secrets/`, builds one application image, waits for PostgreSQL and Redis,
applies pending migrations, loads both idempotent seeds, and starts:

| Service | Purpose |
| --- | --- |
| `postgres` | Persistent gateway configuration |
| `redis` | Rate limits and JWT assertion replay protection |
| `database-setup` | One-shot migrations and seeds |
| `mock-backend` | Local forwarding target |
| `gateway` | Data plane on port `3000` |
| `mtls-ingress` | Trusted TLS boundary on port `3443` |

The first execution downloads images and dependencies. Later executions reuse
Docker's build cache and the generated keys and certificates.

2. Stop the foreground environment with `Ctrl+C`. To run it in the background
instead:

```bash
npm run dev:local:detached
npm run dev:local:down
```

PostgreSQL uses a named volume, so a normal stop preserves local data. Remove
containers and disposable database data explicitly with:

```bash
npm run dev:local:down -- --volumes
```

## Verification

```bash
curl http://localhost:3000/live
curl http://localhost:3000/ready
curl http://localhost:3000/oauth/.well-known/jwks.json
curl -H "x-api-key: dev-bank-key-abc123" \
  http://localhost:3000/es/banking/v1/accounts
curl --cacert .local-secrets/mtls-ca.crt \
  --cert .local-secrets/mtls-client.crt \
  --key .local-secrets/mtls-client.key \
  https://localhost:3443/es/banking/v1/health
```

The first two requests should report a live and ready gateway. Both protected
banking requests should reach the mock backend.

## Troubleshooting or Rollback

- Docker refusal: start the Docker engine before running the command.
- Database setup failure: inspect
  `docker compose --env-file .local-secrets/compose.env logs database-setup`.
- `502`: inspect
  `docker compose --env-file .local-secrets/compose.env logs mock-backend gateway`.
- `EADDRINUSE`: read [[Ports]] and release the reported host port.
- Schema incompatibility in disposable local data: follow [[Reset Local Database]].
- Invalid local material: stop the environment, remove `.local-secrets/`, and
  start it again to regenerate keys and certificates.

## Related Notes

- [[Environment Variables]]
- [[Deployment Model]]
- [[gateway-core]]
