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
> The default platform publishes only Envoy, Admin Panel, and Keycloak; data stores and internal services remain inside the Compose network.

## Current Support

| Component | Host port | Source | Configurable now |
| --- | --- | --- | --- |
| Envoy gateway ingress | `8443` | Default local Compose service | Through Compose edit |
| `admin-panel` | `8080` | Default local Compose service | Through Compose edit |
| Keycloak | `8081` | Default local Compose service | Through Compose edit |
| PostgreSQL | Internal `5432` | Default local Compose service | Not published |
| Redis | Internal `6379` | Default local Compose service | Not published |
| `gateway-core` | Internal `3000` | Default local Compose service | Not published |
| `management-api` | Internal `3002` | Default local Compose service | Not published |
| Mock backend | Internal `4000` | Default local Compose service | Not published to the host |
| Prometheus | `9090` | Optional `observability` profile | Through Compose edit |
| Grafana | `3001` | Optional `observability` profile | Through Compose edit |
| Prisma Studio | `5555` | Prisma default | Through Prisma CLI options |

## Known Collisions

The default `npm run dev:local` environment has no host-port collisions.

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
