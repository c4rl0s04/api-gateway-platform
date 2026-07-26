---
title: Ports
type: reference
doc_status: current
implementation_status: implemented
last_verified: 2026-07-27
tags:
  - type/reference
  - area/operations
sources:
  - docker-compose.yml
  - scripts/dev-local.sh
  - packages/gateway-core/src/config/env.ts
  - packages/management-api/src/server.ts
  - packages/admin-panel/package.json
aliases: []
---

# Ports

> [!summary] At a glance
> The local Compose data plane has non-conflicting ports; optional observability runs under a separate profile.

## Current Support

| Component | Host port | Source | Configurable now |
| --- | --- | --- | --- |
| PostgreSQL | `5432` | Default local Compose service | Through Compose edit |
| Redis | `6379` | Default local Compose service | Through Compose edit |
| `gateway-core` | `3000` | Default local Compose service | Yes, with `PORT` outside Compose |
| mTLS ingress | `3443` | Default local Compose service | Through Compose edit |
| Mock backend | Internal `4000` | Default local Compose service | Not published to the host |
| Prometheus | `9090` | Optional `observability` profile | Through Compose edit |
| Grafana | `3001` | Optional `observability` profile | Through Compose edit |
| `management-api` | `3002` | Hard-coded server | No |
| `admin-panel` | `3000` | Next.js default | Yes, with Next.js CLI/environment conventions |
| Prisma Studio | `5555` | Prisma default | Through Prisma CLI options |

## Known Collisions

The default `npm run dev:local` environment has no internal host-port
collisions. The root `npm run dev` remains a workspace-level command and can
still collide because the standalone Admin Panel and gateway both default to
port `3000`.

## Examples

Start the complete local data plane:

```bash
npm run dev:local
```

## Source Files

- `docker-compose.yml`
- `packages/gateway-core/src/config/env.ts`
- `packages/management-api/src/server.ts`

## Related Notes

- [[Deployment Model]]
- [[How to Start the Project]]
- [[Environment Variables]]
