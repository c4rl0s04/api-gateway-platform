---
title: management-api
type: package
doc_status: current
implementation_status: partial
last_verified: 2026-07-31
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
> `management-api` is the OIDC-protected control plane for proxy revision imports and deployments, application registration, catalog reads, and organization-scoped PKI.

## Responsibility

The implemented responsibility includes logical proxy creation, atomic
OpenAPI/gateway bundle import, immutable revision reads and source downloads,
revision deployment and rollback, application registration, and PKI lifecycle.

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
- Accepts exactly two multipart bundle files with 5 MiB limits.
- Delegates revision numbering, compilation, promotion, activation, conflicts,
  history, and audit to database domain operations.
- Prevents public mutation of system-managed proxies.

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
resolution, role boundaries, multipart revision contracts, deployment
activation responses, catalog routes, application contracts, and CA mutation
authorization. `test:platform` verifies import, restart, replacement, and
rollback through the real BFF and Management API.

## Limitations

- Product, post-registration credential/grant, and direct revision editing
  routes are absent.
- No scheduled external CRL refresh.
- No routing-registry hot reload.

## Related Notes

- [[Management API]]
- [[Control Plane Flow]]
- [[API Routes]]
- [[Proxy Revisions and Deployments]]
