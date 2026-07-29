---
title: How to Add a New Proxy
type: guide
doc_status: current
implementation_status: implemented
last_verified: 2026-07-27
tags:
  - type/guide
  - area/database
sources:
  - packages/database/src/seed.ts
  - packages/database/src/deployments.ts
  - packages/database/prisma/schema.prisma
aliases:
  - How to Add and Deploy a Proxy
---

# How to Add a New Proxy

> [!summary] At a glance
> Until Management API CRUD exists, add reproducible development proxies through seeds and create deployments through the database domain operation.

## Goal

Create a logical proxy, its explicit endpoints, and an environment-specific
deployment without bypassing progression rules.

## Prerequisites

- PostgreSQL is running and migrated.
- Prisma Client is generated.
- The target organization and environment exist.

## Steps

1. Add the logical `ApiProxy` to `packages/database/src/seed.ts`.
2. Define each public `path` and backend-relative `targetPath`.
3. Choose a closed stage and region combination.
4. Create the deployment through `createProxyDeployment()`:

```typescript
await createProxyDeployment({
  proxyId: 'proxy-es-banking',
  environmentId: 'env-qual-es',
  upstreamBaseUrl: 'https://banking-qual.example.com',
});
```

5. Add `pprod` only after `qual`, and `prod` only after `pprod`, for the same region.
6. Run the seed and restart `gateway-core`.

## Verification

- `GET /ready` reports the expected number of loaded proxies.
- A configured endpoint reaches the expected upstream.
- An undeclared endpoint under the same base path returns an endpoint `404`.

## Troubleshooting or Rollback

If progression is rejected, verify deployments for the same proxy and region.
After restart, call the proxy through the selected environment's
`publicOrigin`; deployments in other environments can reuse the logical path.
Reverting a seed definition does not remove existing rows automatically; use the
local reset runbook only when data loss is acceptable.

## Related Notes

- [[Data Model]]
- [[Deployment Model]]
- [[Reset Local Database]]
