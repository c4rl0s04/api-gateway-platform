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
> `management-api` is the OIDC-protected control plane for reading the gateway deployment catalog, registering applications, and operating organization-scoped PKI.

## Responsibility

The implemented responsibility includes authorized reads of environments,
proxies, endpoints, policies, products, and deployments; validated application
registration; and mutation of certificate authorities, certificates, CRLs,
runtime trust, and audit records.

## Boundaries

- Verifies OIDC access tokens against issuer, audience, expiry, and JWKS.
- Resolves active roles from PostgreSQL rather than trusting token roles.
- Enforces platform and organization boundaries.
- Delegates cryptography to `@api-gateway/pki`.
- Publishes public CA/CRL bundles and triggers Envoy SDS reload.
- Creates application, initial credential, approved product grants, and audit
  event through one database-domain transaction.
- Exposes all environments while filtering proxy reads to the actor's visible
  organizations; platform admins can read the complete catalog.

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
resolution, role boundaries, deployment-catalog routes, application route
contracts, and CA mutation authorization.

## Limitations

- Proxy, product, deployment, policy, and post-registration credential/grant
  mutation routes are absent; these resources are read-only for now.
- No scheduled external CRL refresh.
- No routing-registry hot reload.

## Related Notes

- [[Management API]]
- [[Control Plane Flow]]
- [[API Routes]]
