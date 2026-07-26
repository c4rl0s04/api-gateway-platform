---
title: How to Start the Project
type: guide
doc_status: current
implementation_status: partial
last_verified: 2026-07-27
tags:
  - type/guide
  - area/operations
sources:
  - package.json
  - .env.example
  - docker-compose.yml
  - packages/database/package.json
  - packages/gateway-core/package.json
aliases: []
---

# How to Start the Project

> [!summary] At a glance
> Start infrastructure, prepare PostgreSQL, run the mock upstream, and then start `gateway-core`; avoid the root development command until port collisions are resolved.

## Goal

Run the implemented data-plane flow locally.

## Prerequisites

| Requirement | Minimum |
| --- | --- |
| Node.js | `22.19.0` |
| npm | Version bundled with the selected Node.js release |
| Docker | A release with Compose v2 |

## Steps

1. Install dependencies and create `.env` from `.env.example`. Replace the
   signing-key placeholder with a base64-encoded PKCS#8 RSA private key.

```bash
npm install
cp .env.example .env
```

2. Start PostgreSQL and Redis.

```bash
docker compose up -d postgres redis
```

3. The rewritten baseline requires a reset for disposable existing local data,
   then load both seeds.

```bash
npm run db:generate --workspace=packages/database
npm run db:reset --workspace=packages/database
npm run db:seed --workspace=packages/database
npm run db:seed:policies --workspace=packages/database
```

4. Start the mock backend in one terminal.

```bash
npm run mock-backend
```

5. Start the gateway in another terminal.

```bash
npm run dev --workspace=packages/gateway-core
```

## Verification

```bash
curl http://localhost:3000/live
curl http://localhost:3000/ready
curl http://localhost:3000/oauth/.well-known/jwks.json
curl -H "x-api-key: dev-bank-key-abc123" \
  http://localhost:3000/es/banking/v1/accounts
```

The first two requests should report a live and ready gateway. The protected
banking endpoint should reach the mock backend when both seeds are loaded.

## Troubleshooting or Rollback

- Database refusal: verify the `postgres` container and `DATABASE_URL`.
- `proxiesLoaded: 0`: apply migrations and run the base seed.
- `502`: start the mock backend or check the deployment upstream.
- `EADDRINUSE`: read [[Ports]] and start only the required service.
- Schema incompatibility in disposable local data: follow [[Reset Local Database]].

## Related Notes

- [[Environment Variables]]
- [[Deployment Model]]
- [[gateway-core]]
