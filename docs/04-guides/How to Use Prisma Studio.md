---
title: How to Use Prisma Studio
type: guide
doc_status: current
implementation_status: implemented
last_verified: 2026-08-06
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

Use it to inspect organizations, environments, logical proxies, revisions,
operations, policies, deployment history, products, applications, and
credentials.

## Verification

Confirm that each deployed proxy has exactly one active deployment per
environment and that it references the expected immutable revision. For
protected operations, verify policy order and enabled state.

## Troubleshooting or Rollback

Do not create revisions or deployments manually: that bypasses bundle
validation, audit events, active-deployment uniqueness, conflict checks, stage
progression, and outbox creation. Use Management API for mutations; direct
Prisma edits do not trigger runtime synchronization. Use
[[Reset Local Database]] only for disposable local data.

## Related Notes

- [[Data Model]]
- [[Command Reference]]
- [[Database Schema]]
- [[How to Import and Deploy a Proxy Revision]]
- [[Hot Reload Sync]]
