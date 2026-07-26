---
title: Data Model
type: architecture
doc_status: current
implementation_status: implemented
last_verified: 2026-07-27
tags:
  - type/architecture
  - area/database
sources:
  - packages/database/prisma/schema.prisma
  - packages/database/src/deployments.ts
  - packages/shared/src/deployments/config.ts
aliases:
  - Database and Prisma
---

# Data Model

> [!summary] At a glance
> PostgreSQL stores gateway configuration, separating reusable logical proxies from their environment-specific deployments and authorization products.

## Context

The database stores organizations, logical proxies, endpoints, policies,
environments, deployments, API products, developer applications, and
credentials. It does not store proxied business data or request bodies.

## Components

```mermaid
erDiagram
    Organization ||--o{ ApiProxy : owns
    Organization ||--o{ ApiProduct : owns
    Organization ||--o{ DeveloperApp : owns
    ApiProxy ||--o{ Endpoint : defines
    Endpoint ||--o{ EndpointPolicy : applies
    ApiProxy ||--o{ ProxyDeployment : deploys
    Environment ||--o{ ProxyDeployment : receives
    ApiProduct }o--o{ ApiProxy : bundles
    ApiProduct }o--o{ Environment : allows
    DeveloperApp ||--o{ AppCredential : has
    AppCredential ||--o{ CredentialProductGrant : receives
    ApiProduct ||--o{ CredentialProductGrant : grants
    AppCredential ||--o{ AppPublicKey : verifies
    AppCredential ||--o{ AppCertificate : identifies
```

## Deployment Flow

`ApiProxy` is a logical definition. `ProxyDeployment` connects that proxy to an
`Environment` and supplies its `upstreamBaseUrl`. The same proxy can therefore
use different upstreams in `qual`, `pprod`, and `prod`.

`createProxyDeployment()` enforces progression within the same region:

- `qual` has no prerequisite.
- `pprod` requires an existing `qual` deployment.
- `prod` requires an existing `pprod` deployment.

## Authorization Flow

An `AppCredential` identifies one application and declares closed
authentication methods. Secrets are scrypt hashes; public RSA JWKs and mTLS
fingerprints are separate validity-controlled records. An approved
`CredentialProductGrant` supplies scopes and access through an active product.
A product must include the current proxy. Its environment relation is optional:
empty means all environments.

Endpoints are either `forward` or `local`. `targetPath` and an upstream are
required only for forwarding. `systemManaged` identifies platform-owned
proxies such as `platform-oauth`.

## Failure Modes

- Duplicate proxy base paths are rejected globally.
- Duplicate proxy/environment deployments are rejected.
- Invalid deployment progression raises `DeploymentProgressionError`.
- Unsupported upstream protocols are rejected before persistence.

## Constraints

Stages and regions are closed catalogs. Adding a value requires coordinated
changes to Prisma, shared contracts, migrations, seeds, tests, and documentation.

## Sources

Use [[Database Schema]] for field-level reference and [[database]] for package
ownership.
