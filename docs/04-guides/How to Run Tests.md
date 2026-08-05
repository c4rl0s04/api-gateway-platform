---
title: How to Run Tests
type: guide
doc_status: current
implementation_status: implemented
last_verified: 2026-08-06
tags:
  - type/guide
  - area/project
sources:
  - package.json
  - packages/gateway-core/package.json
  - packages/shared/package.json
  - packages/database/package.json
  - .github/workflows/ci.yml
  - docker-compose.e2e.yml
  - scripts/test-platform-isolated.sh
  - scripts/assert-platform-test-isolation.mjs
aliases: []
---

# How to Run Tests

> [!summary] At a glance
> The root suite covers all six workspaces; live Compose tests separately verify revision transactions, Envoy mTLS, and the complete control-plane workflow.

## Goal

Run the same build and test boundaries expected by CI.

Use [[Command Reference]] for the complete command catalog, including
workspace-level and advanced diagnostic commands.

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

Live infrastructure suites:

```bash
npm run test:integration:revisions
npm run test:integration:seed-examples
npm run test:integration:mtls
npm run test:platform
```

The first three integration commands use explicitly configured live services.
`test:platform` is self-contained: it creates a uniquely named Compose project,
temporary secrets and SDS files, dedicated PostgreSQL volumes, and an isolated
Keycloak database. The normal local platform does not need to be running.

`test:integration:revisions` uses live PostgreSQL to verify concurrent revision
numbering, atomic failures, deployment history, rollback, promotion, and base
path conflicts.

`test:integration:seed-examples` verifies the seeded revision histories and
representative live API-key, OAuth, public-operation, policy override, custom
header, promotion, rollback, undeployed revision, and idempotency examples.

`test:platform` checks all 30 environment origins, Management API revision
import, hot reload and rollback, API key and OAuth flows,
cross-environment token rejection, disposable CA and certificate records,
revocation, authority rotation, and persistence. It publishes only temporary
host ports `18080`, `18081`, and `18443`, then removes its containers, networks,
volumes, and generated files whether the workflow succeeds or fails.

Validate only the isolation contract without starting services:

```bash
npm run test:platform:config
```

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

To inspect an E2E failure, preserve that failed stack explicitly:

```bash
PLATFORM_TEST_KEEP_ON_FAILURE=1 npm run test:platform
```

The command prints the Compose project and temporary runtime directory. Bring
the project down with `docker compose --project-name <project> down --volumes`
after collecting logs. Never reuse those files as `.local-secrets`.

## Related Notes

- [[gateway-core]]
- [[Command Reference]]
- [[shared]]
- [[How to Document the Project]]
- [[Seed Example Catalog]]
