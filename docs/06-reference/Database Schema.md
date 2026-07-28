---
title: Database Schema
type: reference
doc_status: current
implementation_status: implemented
last_verified: 2026-07-29
tags:
  - type/reference
  - area/database
sources:
  - packages/database/prisma/schema.prisma
aliases: []
---

# Database Schema

> [!summary] At a glance
> This is the field-level map of the Prisma schema; use the architecture note for relationship rationale.

## Current Support

| Model | Core fields | Important constraints |
| --- | --- | --- |
| `Organization` | `id`, `name`, `createdAt` | Owns proxies, products, apps, CAs, memberships, and audit events |
| `Environment` | `stage`, `region` | Unique `(stage, region)` |
| `ApiProxy` | `name`, `basePath`, `active`, `systemManaged`, `organizationId` | Globally unique `basePath` |
| `ProxyDeployment` | `proxyId`, `environmentId`, nullable `upstreamBaseUrl`, `active` | Unique `(proxyId, environmentId)` |
| `Endpoint` | `mode`, `path`, nullable `targetPath`, `proxyId` | `forward` requires target; `local` returns from policy |
| `EndpointPolicy` | `type`, `order`, `enabled`, `config`, `endpointId` | Deleted with its endpoint |
| `ApiProduct` | `name`, `active`, `scopes`, `organizationId` | Many-to-many proxies and optional environment allowlist |
| `DeveloperApp` | `name`, `status`, `organizationId` | Owns credentials |
| `AppCredential` | `consumerKey`, required `consumerSecretHash`, `status`, validity | Unique `consumerKey`; plaintext secret is returned once |
| `CredentialProductGrant` | credential, product, `status`, `scopes` | Unique credential/product |
| `AppPublicKey` | credential, `kid`, RSA JWK, `RS256`, status, validity | Unique credential/`kid` |
| `AppCertificate` | credential, authority, SHA-256 fingerprint, PEM/chain, source, status, validity, revocation | Unique fingerprint |
| `CertificateAuthority` | organization, kind, lifecycle status, public PEM/chain, `keyRef`, CRL metadata | Unique fingerprint; managed key is external |
| `CertificateIssuance` | authority, credential, CSR digest, requested days, result | Optional unique resulting certificate |
| `AdminMembership` | OIDC issuer/subject, role, organization, active | Unique issuer/subject/scope |
| `AuditEvent` | actor, role, organization, action, resource, metadata | Append-only security history |

## Authoritative Values

`DeploymentStage`:

```text
qual | pprod | prod
```

`DeploymentRegion`:

```text
ce | es | de | be | fr | us | uk | jp | br | kr
```

`AuthorizationStatus`:

```text
pending | approved | revoked
```

`CertificateAuthorityKind`:

```text
managed | external
```

`CertificateAuthorityStatus`:

```text
draft | active | retiring | revoked
```

`AdminRole`:

```text
platformAdmin | organizationAdmin | viewer
```

`EndpointPolicy.type` is stored as a string. Runtime acceptance is restricted by
`@api-gateway/shared` during gateway loading.

## Examples

The final upstream URL combines:

```text
ProxyDeployment.upstreamBaseUrl + Endpoint.targetPath
```

## Source Files

- `packages/database/prisma/schema.prisma`

## Related Notes

- [[Data Model]]
- [[database]]
- [[Policy Types]]
- [[Multi-Client PKI]]
