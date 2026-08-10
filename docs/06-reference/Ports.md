---
title: Ports
type: reference
doc_status: current
implementation_status: implemented
last_verified: 2026-08-10
tags:
  - type/reference
  - area/operations
sources:
  - docker-compose.yml
  - scripts/dev-local.sh
  - packages/gateway-core/src/config/env.ts
  - packages/management-api/src/server.ts
  - packages/admin-panel/package.json
  - docker-compose.e2e.yml
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
| `lab-egress` | Internal `3010` | Default local Compose service | Not published |
| Mock backend | Internal `4000` | Default local Compose service | Not published to the host |
| `gatewayctl` agent | `43127` | Client process | `GATEWAYCTL_PORT`, `agent start --port`, or the matching per-browser override; always binds IPv4 loopback only |
| Prometheus | `9090` | Optional `observability` profile | Through Compose edit |
| Grafana | `3001` | Optional `observability` profile | Through Compose edit |
| Prisma Studio | `5555` | Prisma default | Through Prisma CLI options |

## Known Collisions

The default `npm run dev:local` environment has no host-port collisions.

Only one `gatewayctl` agent can own `127.0.0.1:43127`. A foreign listener is
reported separately from a running agent, and recorded state is trusted only
when the live instance ID matches.

The isolated `npm run test:platform` stack uses a separate set of ports:

| E2E component | Host port |
| --- | --- |
| Admin Panel/BFF | `18080` |
| Keycloak | `18081` |
| Envoy gateway ingress | `18443` |

Its PostgreSQL instances, Redis, Gateway, Management API, and mock backend are
not published. The test uses a unique Compose project and removes all of these
resources after execution.

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
- [[gatewayctl Reference]]
