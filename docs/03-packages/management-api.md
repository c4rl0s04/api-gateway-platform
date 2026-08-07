---
title: management-api
type: package
doc_status: current
implementation_status: implemented
last_verified: 2026-08-02
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
> `management-api` is the OIDC-protected control plane for organizations, products, proxy revisions and deployments, application credentials and grants, audit, and organization-scoped PKI.

## Responsibility

The implemented responsibility includes organization and product lifecycle,
logical proxy creation and metadata, read-only bundle validation, atomic
configured proxy plus revision-1 creation, OpenAPI/gateway bundle import,
immutable revision reads and source downloads,
revision deployment, retirement and rollback, application/credential/grant/JWK
management, filtered audit reads, and PKI lifecycle.

## Boundaries

- Verifies OIDC access tokens against issuer, audience, expiry, and JWKS.
- Resolves active roles from PostgreSQL rather than trusting token roles.
- Enforces platform and organization boundaries.
- Delegates cryptography to `@api-gateway/pki`.
- Publishes public CA/CRL bundles and triggers Envoy SDS reload.
- Creates application, initial credential, approved product grants, and audit
  event through one database-domain transaction.
- Generates additional credentials, rotates one-time secrets, replaces grants,
  validates RSA JWKs, and enforces closed lifecycle transitions through domain
  services.
- Customizes globally unique consumer keys and clones approved grants into new
  credentials without copying keys, certificates, secrets, or revoked history.
- Updates products atomically, including removal of retired scopes from grants.
- Exposes all environments while filtering proxy reads to the actor's visible
  organizations; platform admins can read the complete catalog.
- Accepts OpenAPI-only inspection, optional complete-bundle validation, and
  configured-creation multipart contracts with 5 MiB per-source limits.
- Delegates revision numbering, compilation, promotion, activation, conflicts,
  history, and audit to database domain operations.
- Prevents public mutation of system-managed proxies.
- Commits routing changes with a durable outbox version, publishes Redis
  notifications, and exposes live gateway convergence through `/v1/runtime-sync`.

## Public Contracts

The versioned surface is under `/v1`; see [[Management API Endpoint Reference]].
`GET /live` and `GET /ready` are unversioned operational endpoints.

## Runtime Flow

The service listens on its configured internal address. The Admin Panel BFF
forwards either the browser-session token or an explicit API-client Bearer
token. Authentication middleware resolves memberships, then route services
execute database, keystore, audit, and SDS operations.

## Configuration

See [[Environment Variables]] for OIDC and PKI paths. Compose keeps port `3002`
internal.

## Tests

Tests cover cryptographic token verification, missing identities, membership
resolution, role boundaries, multipart revision contracts, deployment
activation responses, catalog and mutation routes, application contracts,
credential customization, cloning, rotation, desired-state grants, RSA keys,
outbox publication, runtime status, audit filters, and CA authorization.
`test:integration:management` verifies domain persistence; `test:platform`
verifies hot reload and the full workflow through the real BFF and gateway.

## Limitations

- Membership and environment catalog writes are absent.
- Secret reads, physical deletion, and direct revision editing are intentionally
  absent.
- No scheduled external CRL refresh.

## Related Notes

- [[Management API]]
- [[Control Plane Flow]]
- [[API Routes]]
- [[Management API Endpoint Reference]]
- [[How to Use the Management API with Postman]]
- [[Proxy Revisions and Deployments]]
