---
title: database
type: package
doc_status: current
implementation_status: implemented
last_verified: 2026-07-27
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
> `@api-gateway/database` owns PostgreSQL persistence, generated Prisma access, seeds, migrations, and transactional deployment creation.

## Responsibility

This package is the persistence boundary for the monorepo.

## Boundaries

- Owns the Prisma schema and migration history.
- Exports a shared `PrismaClient`.
- Builds the generated client before compiling TypeScript.
- Provides reproducible base and policy seeds.
- Enforces deployment progression through `createProxyDeployment()`.
- Exports credential, secret rotation, grant, public-key, and certificate
  domain operations.
- Persists certificate authorities, issuance records, OIDC memberships, and
  append-only audit events; managed CA private keys remain outside PostgreSQL.

Runtime packages should not reproduce database invariants in route handlers or
direct model writes.

## Public Contracts

```typescript
await createProxyDeployment({
  proxyId: 'proxy-es-banking',
  environmentId: 'env-pprod-es',
  upstreamBaseUrl: 'https://banking-pprod.example.com',
});
```

The operation normalizes trailing slashes, accepts only HTTP(S) upstreams, runs
inside a transaction, and raises `DeploymentProgressionError` for an invalid
stage transition.

## Runtime Flow

The base seed creates 30 stage/region environments, organizations, logical
proxies, endpoints, and initial `qual` deployments. The policy seed adds
products, apps, hashed credentials, explicit grants, a public development JWK,
a local CA, two development client certificates, OIDC memberships, and endpoint policies. The base seed
also deploys the local `platform-oauth` proxy to all 30 environments.

## Configuration

`DATABASE_URL` is required by Prisma and all package scripts that connect to
PostgreSQL.

## Tests

Tests cover closed deployment catalogs, progression, scrypt hashing, secret
comparison, and certificate fingerprint normalization. Migration and seeds are
validated against a disposable PostgreSQL database before release.

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
