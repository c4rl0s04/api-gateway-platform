---
title: Current Status
type: map
doc_status: current
implementation_status: partial
last_verified: 2026-07-27
tags:
  - type/map
  - area/project
sources:
  - packages/gateway-core/src/server.ts
  - packages/gateway-core/src/policies/registry.ts
  - packages/management-api/src/server.ts
  - packages/admin-panel/app
  - packages/database/prisma/schema.prisma
  - docker-compose.yml
aliases: []
---

# Current Status

> [!summary] At a glance
> This is the canonical snapshot of implemented, partial, and planned platform capabilities.

## Capability Matrix

| Capability | Status | Evidence and boundary |
| --- | --- | --- |
| Proxy and endpoint routing | Implemented | Longest-prefix proxy matching, explicit endpoint matching, and parameter extraction |
| HTTP forwarding | Implemented | Streams arbitrary request and response bytes through `undici` |
| PostgreSQL configuration loading | Implemented | Active deployments are loaded once during gateway startup |
| Environment-specific deployments | Implemented | Closed stage/region catalogs and `qual -> pprod -> prod` progression |
| Policy pipeline | Partial | Ordering, forwarding halts, local responses, and per-policy failure modes are implemented; mediation factories remain planned |
| API key authentication | Implemented | Validates method, status, expiry, approved grants, proxy, and environment |
| OAuth token issuance | Implemented | Client Credentials and JWT Bearer Grant issue environment-bound RS256 tokens |
| OAuth access-token verification | Implemented | Stateless signature, claims, proxy, environment, and scope validation |
| Direct mTLS authentication | Implemented | Envoy chain/CRL validation, connection-derived fingerprints, trusted CIDR, and grants |
| Multi-client PKI | Implemented | Managed/external organization CAs, encrypted keystore, issuance, CRLs, rotation, and SDS |
| Rate limiting | Implemented | Fixed-window Redis counter with atomic Lua execution |
| Management API | Partial | OIDC-protected CA/certificate lifecycle and audit are implemented; general gateway CRUD is not |
| Admin panel | Partial | OIDC login and PKI workflows are implemented; proxy/product mutation is not |
| Configuration hot reload | Planned | Redis is used for rate limiting, not configuration invalidation |
| Metrics and dashboards | Planned | Prometheus and Grafana containers exist; gateway metrics are not exposed |

## Operational Endpoints

- Gateway: `GET /live` and `GET /ready`.
- Management API: internal `GET /live`, `GET /ready`, and versioned `/v1` PKI
  routes.
- All other gateway paths are evaluated by the proxy catch-all route.
- The system-managed OAuth proxy exposes `POST /oauth/token` and
  `GET /oauth/.well-known/jwks.json`.

See [[API Routes]] for response contracts and [[Ports]] for the current local
port assignments.

## Updating This Page

Change a capability status only after verifying source code and tests. Planned
design documents do not count as implementation evidence.
