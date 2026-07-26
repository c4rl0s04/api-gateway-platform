---
title: How to Run Tests
type: guide
doc_status: current
implementation_status: implemented
last_verified: 2026-07-27
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
> The root test command runs implemented workspace suites; gateway, database, and shared tests use Node's test runner through `tsx`.

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
npm run docs:test
```

Management API and Admin Panel currently have placeholder test scripts and do
not provide meaningful coverage.

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
```

Do not reset the database to fix isolated gateway unit tests.

## Related Notes

- [[gateway-core]]
- [[shared]]
- [[How to Document the Project]]
