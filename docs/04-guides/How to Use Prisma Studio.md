---
title: How to Use Prisma Studio
type: guide
doc_status: current
implementation_status: implemented
last_verified: 2026-07-27
tags:
  - type/guide
  - area/database
sources:
  - packages/database/package.json
  - packages/database/prisma/schema.prisma
aliases: []
---

# How to Use Prisma Studio

> [!summary] At a glance
> Prisma Studio is useful for inspecting local configuration, but manual writes can bypass domain invariants and are not reloaded by a running gateway.

## Goal

Inspect local PostgreSQL records through Prisma's browser interface.

## Prerequisites

- PostgreSQL is running.
- Migrations are applied.
- `DATABASE_URL` points to the intended local database.

## Steps

```bash
npm run db:studio --workspace=packages/database
```

Prisma Studio normally opens on `http://localhost:5555`.

Use it to inspect organizations, environments, proxies, deployments,
endpoints, policies, products, applications, and credentials.

## Verification

Confirm that each active proxy has an active deployment and explicit endpoints.
For protected endpoints, verify the policy order and enabled state.

## Troubleshooting or Rollback

Do not create deployments manually: that bypasses `createProxyDeployment()` and
its stage progression. A running gateway will not see changes until it restarts.
Use [[Reset Local Database]] only for disposable local data.

## Related Notes

- [[Data Model]]
- [[Database Schema]]
- [[Hot Reload Sync]]
