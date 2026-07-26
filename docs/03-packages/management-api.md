---
title: management-api
type: package
doc_status: current
implementation_status: partial
last_verified: 2026-07-27
tags:
  - type/package
  - area/management-api
sources:
  - packages/management-api/package.json
  - packages/management-api/src
  - packages/management-api/test
aliases: []
---

# management-api

> [!summary] At a glance
> `management-api` is a partial Fastify application: the process and health endpoint exist, but administrative routes are stubs.

## Responsibility

The target responsibility is validated and authorized mutation of gateway
configuration. Current code does not yet fulfill that responsibility.

## Boundaries

- Current: Fastify startup and `GET /health`.
- Current: an environment schema module and database import scaffold.
- Planned: authentication, CRUD handlers, domain validation, and reload events.

## Public Contracts

The only implemented HTTP contract is:

```http
GET /health
```

It returns `{ "status": "ok" }`.

## Runtime Flow

The current entry point constructs Fastify and listens on `0.0.0.0:3002`.
Route modules are not registered.

## Configuration

Although `src/config/env.ts` defines `PORT` and `DATABASE_URL`, `server.ts`
currently does not load it. Documentation must not claim those values are
honored by the process.

## Tests

The package test script is a TODO placeholder. A health test file exists but is
not run by that script.

## Limitations

- No CRUD endpoints.
- No request validation or administrative authentication.
- No Redis publication or hot reload.
- Hard-coded port.

## Related Notes

- [[Management API]]
- [[Control Plane Flow]]
- [[API Routes]]
