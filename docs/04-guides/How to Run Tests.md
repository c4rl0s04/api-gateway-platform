---
title: How to Run Tests
type: guide
doc_status: current
implementation_status: implemented
last_verified: 2026-07-31
tags:
  - type/guide
  - area/project
sources:
  - package.json
  - packages/gateway-core/package.json
  - packages/shared/package.json
  - packages/database/package.json
  - .github/workflows/ci.yml
aliases: []
---

# How to Run Tests

> [!summary] At a glance
> The root suite covers all six workspaces; live Compose tests separately verify revision transactions, Envoy mTLS, and the complete control-plane workflow.

## Goal

Run the same build and test boundaries expected by CI.

## Prerequisites

- Node.js `22.19.0` or newer.
- Installed npm dependencies.
- PostgreSQL and Redis only for tests or commands that explicitly use live infrastructure.

Most gateway tests inject configuration and use fake policy dependencies, so
they do not require a running database or Redis instance.

## Steps

```bash
npm run docs:check
npm run build
npm test
```

Focused suites:

```bash
npm test --workspace=packages/gateway-core
npm test --workspace=packages/shared
npm test --workspace=packages/database
npm test --workspace=packages/pki
npm test --workspace=packages/management-api
npm test --workspace=packages/admin-panel
npm run docs:test
```

With the local platform running:

```bash
npm run test:integration:revisions
npm run test:integration:seed-examples
npm run test:integration:mtls
npm run test:platform
```

`test:integration:revisions` uses live PostgreSQL to verify concurrent revision
numbering, atomic failures, deployment history, rollback, promotion, and base
path conflicts.

`test:integration:seed-examples` verifies the seeded revision histories and
representative live API-key, OAuth, public-operation, policy override, custom
header, promotion, rollback, undeployed revision, and idempotency examples.

`test:platform` checks all 30 environment origins, Management API revision
import and deployment, gateway restart and rollback, API key and OAuth flows,
cross-environment token rejection, disposable CA and certificate records,
revocation, authority rotation, and persistence.

Authentication tests generate ephemeral RSA keys. Clean migration/seed
validation requires disposable PostgreSQL and must never target retained data.

## Verification

The command must exit with status zero. Review the number of executed tests;
placeholder scripts printing `TODO` are not evidence of coverage.

## Troubleshooting or Rollback

Build internal libraries first if a test cannot resolve workspace output:

```bash
npm run build --workspace=packages/shared
npm run build --workspace=packages/database
npm run build --workspace=packages/pki
```

Do not reset the database to fix isolated gateway unit tests.

## Related Notes

- [[gateway-core]]
- [[shared]]
- [[How to Document the Project]]
- [[Seed Example Catalog]]
