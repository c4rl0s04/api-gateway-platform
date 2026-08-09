---
title: database
type: package
doc_status: current
implementation_status: implemented
last_verified: 2026-08-09
tags:
  - type/package
  - area/database
sources:
  - packages/database/package.json
  - packages/database/prisma/schema.prisma
  - packages/database/src
aliases: []
---

# database

> [!summary] At a glance
> `@api-gateway/database` owns persistence plus validated proxy-bundle compilation, immutable revision creation, deployment history, promotion, and rollback invariants.

## Responsibility

This package is the persistence boundary for the monorepo.

## Boundaries

- Owns the Prisma schema and migration history.
- Exports a shared `PrismaClient`.
- Builds the generated client before compiling TypeScript.
- Provides reproducible base and policy seeds.
- Keeps revision examples declarative in `seed-proxy-scenarios.ts` and compiles
  them through the same validator used by Management API.
- Compiles OpenAPI 3.0/3.1 and gateway YAML into validated operations and
  policies through `compileProxyBundle()`.
- Creates monotonically numbered revisions through `importProxyRevision()`.
- Enforces exact-revision promotion and active deployment replacement through
  `deployProxyRevision()`.
- Records each active-routing mutation in the transactional
  `GatewayConfigChange` outbox.
- Exports credential, secret rotation, grant, public-key, and certificate
  domain operations.
- Validates consumer-key replacement and clones approved authorization into a
  fresh credential without copying cryptographic material.
- Registers an app, generated credential, approved product grants, and audit
  event atomically through `registerDeveloperApplication()`.
- Persists certificate authorities, issuance records, OIDC memberships, and
  append-only audit events; managed CA private keys remain outside PostgreSQL.
- Owns Personal Lab lifecycle, OIDC ownership, expiry/revocation, workspace
  deployment scoping, safe upstream definitions, and route-removal outbox
  events.

Runtime packages should not reproduce database invariants in route handlers or
direct model writes.

## Public Contracts

```typescript
await deployProxyRevision({
  proxyId: 'proxy-es-banking',
  revisionNumber: 2,
  environmentId: 'env-pprod-es',
  upstreamBaseUrl: 'https://banking-pprod.example.com',
  actor,
});
```

The operation normalizes trailing slashes, accepts only HTTP(S) upstreams,
serializes activation, detects active base-path conflicts, retires the previous
row, records audit metadata, and raises stable `ProxyDeploymentError` codes.

`registerDeveloperApplication()` validates organization ownership, active
products, unique product assignments, and scope subsets. Omitted grant scopes
inherit all product scopes. It returns the generated consumer secret once and
never returns the persisted secret hash.

## Runtime Flow

The base seed creates 30 stage/region environments with unique local HTTPS
origins, organizations, and logical proxies. The policy seed compiles immutable
revision bundles, applies keyed deployment timelines, and deploys
`platform-oauth` to all environments. A clean seed contains 16 revisions and 48
deployment records, including promotion, rollback, retired history, and one
undeployed revision. It also adds 8 products, 9 apps, 9 hashed credentials,
explicit grants, a public development JWK, a local CA, two development client
certificates, and OIDC memberships. See [[Seed Example Catalog]] for exact
examples.

## Configuration

`DATABASE_URL` is required by Prisma and all package scripts that connect to
PostgreSQL.

## Tests

Unit tests cover bundle validation, policy inheritance, scrypt hashing, secret
comparison, fingerprint normalization, and compilation of every seeded
revision. PostgreSQL integration tests cover
concurrent numbering, atomic invalid imports, promotion, one-active invariants,
base-path conflicts, deployment history, rollback, outbox creation, consumer
key replacement, and selective credential cloning.

## Limitations

- Development secret values are fixtures, but only salted hashes are persisted.
- The temporary seed output exposes local-only secrets; it is not a production
  provisioning interface.
- Manual Prisma Studio writes can bypass domain operations.
- Migration changes require explicit review because local reset commands delete data.

## Related Notes

- [[Data Model]]
- [[Database Schema]]
- [[ADR-003 Prisma as ORM]]
- [[How to Use Prisma Studio]]
- [[Reset Local Database]]
- [[pki]]
- [[Proxy Revisions and Deployments]]
- [[Seed Example Catalog]]
- [[Personal Gateway Lab]]
