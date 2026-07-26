---
title: Reset Local Database
type: runbook
doc_status: current
implementation_status: implemented
last_verified: 2026-07-27
tags:
  - type/runbook
  - area/database
sources:
  - packages/database/package.json
  - packages/database/src/seed.ts
  - packages/database/src/seed-policies.ts
aliases: []
---

# Reset Local Database

> [!summary] At a glance
> Reset only disposable local PostgreSQL data; the command deletes existing records before rebuilding schema and seed state.

## Symptoms

Use this runbook for an incompatible local migration history or disposable seed
state that cannot be repaired safely.

## Impact

`db:reset` destroys data in the database selected by `DATABASE_URL`.

## Diagnosis

1. Print or inspect the effective `DATABASE_URL`.
2. Confirm it points to the intended local `apigw` database.
3. Stop if the database contains data that must be preserved.
4. Prefer migration deployment and targeted seed reruns when deletion is unnecessary.

## Resolution

```bash
npm run db:reset --workspace=packages/database
npm run db:seed --workspace=packages/database
npm run db:seed:policies --workspace=packages/database
```

Restart `gateway-core` after the reset.

## Verification

- Prisma Studio shows environments, proxies, and deployments.
- `GET /ready` reports loaded proxies.
- A protected seeded endpoint accepts the documented development key.

## Escalation

Never run this procedure against a shared, staging, or production database.
Escalate migration conflicts in persistent environments instead of resetting.
