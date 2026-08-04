---
title: Database Schema
type: reference
doc_status: current
implementation_status: implemented
last_verified: 2026-08-02
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
| `Environment` | `stage`, `region`, HTTPS `publicOrigin` | Unique `(stage, region)` and unique origin |
| `ApiProxy` | `name`, `active`, `systemManaged`, `organizationId` | Stable identity owned by an organization |
| `ApiProxyRevision` | proxy, number, `basePath`, source/parsed documents, version, content hash | Unique proxy/revision number; immutable through Management API |
| `ProxyOperation` | revision, `operationId`, method, mode, path, target | Unique operation ID and method/path inside the revision |
| `OperationPolicy` | `type`, `order`, `enabled`, `config`, operation | Unique execution order inside one operation |
| `ProxyDeployment` | proxy, revision, environment, nullable upstream, status | Partial unique active proxy/environment; retired history retained |
| `GatewayConfigChange` | monotonic version, change/resource identity, environment, publication state | Durable routing outbox retried until Redis publication |
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

Local origins are deterministically seeded as:

```text
https://<stage>-<region>.gateway.localhost:8443
```

`AuthorizationStatus`:

```text
pending | approved | revoked
```

`DeploymentStatus`:

```text
active | retired
```

`HttpMethod`:

```text
GET | PUT | POST | DELETE | OPTIONS | HEAD | PATCH | TRACE
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

`OperationPolicy.type` is stored as a string. Runtime acceptance is restricted by
`@api-gateway/shared` during gateway loading.

## Examples

The final upstream URL combines:

```text
ProxyDeployment.upstreamBaseUrl + ProxyOperation.targetPath
```

## Source Files

- `packages/database/prisma/schema.prisma`

## Related Notes

- [[Data Model]]
- [[database]]
- [[Policy Types]]
- [[Multi-Client PKI]]
- [[Proxy Revisions and Deployments]]
