---
title: Ports
type: reference
doc_status: current
implementation_status: partial
last_verified: 2026-07-27
tags:
  - type/reference
  - area/operations
sources:
  - docker-compose.yml
  - .env.example
  - packages/gateway-core/src/config/env.ts
  - packages/management-api/src/server.ts
  - packages/admin-panel/package.json
aliases: []
---

# Ports

> [!summary] At a glance
> Current defaults contain real host-port collisions, so start only the required services or override configurable processes.

## Current Support

| Component | Host port | Source | Configurable now |
| --- | --- | --- | --- |
| PostgreSQL | `5432` | Docker Compose | Through Compose edit |
| Redis | `6379` | Docker Compose | Through Compose edit |
| Prometheus | `9090` | Docker Compose | Through Compose edit |
| Grafana | `3000` | Docker Compose | Through Compose edit |
| `gateway-core` | `3000` | `PORT` default | Yes, with `PORT` |
| `management-api` | `3002` | Hard-coded server | No |
| `admin-panel` | `3000` | Next.js default | Yes, with Next.js CLI/environment conventions |
| Mock backend | `4000` | Root script | Defined by the mock backend script |
| Prisma Studio | `5555` | Prisma default | Through Prisma CLI options |

## Known Collisions

Grafana, `gateway-core`, and `admin-panel` all default to host port `3000`.
`docker compose up` with Grafana prevents the default gateway port from binding.
The root `npm run dev` can also start gateway and Admin Panel with conflicting
defaults.

## Examples

For data-plane development, start only PostgreSQL and Redis:

```bash
docker compose up -d postgres redis
npm run dev --workspace=packages/gateway-core
```

## Source Files

- `docker-compose.yml`
- `packages/gateway-core/src/config/env.ts`
- `packages/management-api/src/server.ts`

## Related Notes

- [[Deployment Model]]
- [[How to Start the Project]]
- [[Environment Variables]]
