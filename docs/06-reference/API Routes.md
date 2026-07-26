---
title: API Routes
type: reference
doc_status: current
implementation_status: partial
last_verified: 2026-07-27
tags:
  - type/reference
  - area/project
sources:
  - packages/gateway-core/src/server.ts
  - packages/management-api/src/server.ts
aliases: []
---

# API Routes

> [!summary] At a glance
> Only routes registered by current Fastify servers appear here; stub files and planned APIs are excluded.

## Current Support

### gateway-core

| Method | Path | Success | Purpose |
| --- | --- | --- | --- |
| `GET` | `/live` | `200` | Process liveness and timestamp |
| `GET` | `/ready` | `200` or `503` | Registry readiness, proxy count, and selected environment |
| `POST` | `/oauth/token` | `200` or OAuth error | Local Client Credentials and JWT Bearer token issuance |
| `GET` | `/oauth/.well-known/jwks.json` | `200` | Local public gateway signing keys |
| Any | `/*` | Upstream or gateway error | Proxy resolution, policies, and forwarding |

The catch-all can return:

- `404` when no proxy matches.
- `404` when a proxy matches but no explicit endpoint matches.
- Policy-defined statuses such as `401`, `403`, `429`, or `503`.
- `502` when the upstream cannot be reached.

The OAuth routes are persisted endpoints of the system-managed
`platform-oauth` proxy, not hard-coded Fastify routes. They are deployed in all
30 environments and never forward to an upstream.

The gateway intentionally does not expose a root `/health` route.

### management-api

| Method | Path | Success | Purpose |
| --- | --- | --- | --- |
| `GET` | `/health` | `200` | Returns `{ "status": "ok" }` |

No route module under `src/routes` is currently registered.

## Examples

```bash
curl http://localhost:3000/live
curl http://localhost:3000/ready
curl http://localhost:3002/health
```

## Source Files

- `packages/gateway-core/src/server.ts`
- `packages/management-api/src/server.ts`

## Related Notes

- [[Runtime Request Flow]]
- [[Management API]]
- [[Debug Gateway 404]]
