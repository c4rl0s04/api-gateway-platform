---
title: management-api
type: package
doc_status: current
implementation_status: partial
last_verified: 2026-07-29
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
> `management-api` is an internal Fastify service for OIDC-authorized application registration and organization-scoped PKI lifecycle operations.

## Responsibility

The implemented responsibility is validated and authorized application
registration plus mutation of certificate authorities, certificates, CRLs,
runtime trust, and audit records.

## Boundaries

- Verifies OIDC access tokens against issuer, audience, expiry, and JWKS.
- Resolves active roles from PostgreSQL rather than trusting token roles.
- Enforces platform and organization boundaries.
- Delegates cryptography to `@api-gateway/pki`.
- Publishes public CA/CRL bundles and triggers Envoy SDS reload.
- Creates application, initial credential, approved product grants, and audit
  event through one database-domain transaction.

## Public Contracts

The versioned surface is under `/v1`; see [[API Routes]]. `GET /live` and
`GET /ready` are unversioned operational endpoints.

## Runtime Flow

The service listens on its configured internal address. The Admin Panel BFF
forwards an OIDC Bearer token, authentication middleware resolves memberships,
and route services execute database, keystore, audit, and SDS operations.

## Configuration

See [[Environment Variables]] for OIDC and PKI paths. Compose keeps port `3002`
internal.

## Tests

Tests cover cryptographic token verification, missing identities, membership
resolution, role boundaries, application route contracts, and CA mutation
authorization.

## Limitations

- Proxy, product, deployment, policy, and post-registration credential/grant
  mutation routes are absent.
- No scheduled external CRL refresh.
- No routing-registry hot reload.

## Related Notes

- [[Management API]]
- [[Control Plane Flow]]
- [[API Routes]]
