---
title: Database Schema
type: reference
doc_status: current
implementation_status: implemented
last_verified: 2026-07-27
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
| `Organization` | `id`, `name`, `createdAt` | Owns proxies, products, and apps |
| `Environment` | `stage`, `region` | Unique `(stage, region)` |
| `ApiProxy` | `name`, `basePath`, `active`, `systemManaged`, `organizationId` | Globally unique `basePath` |
| `ProxyDeployment` | `proxyId`, `environmentId`, nullable `upstreamBaseUrl`, `active` | Unique `(proxyId, environmentId)` |
| `Endpoint` | `mode`, `path`, nullable `targetPath`, `proxyId` | `forward` requires target; `local` returns from policy |
| `EndpointPolicy` | `type`, `order`, `enabled`, `config`, `endpointId` | Deleted with its endpoint |
| `ApiProduct` | `name`, `active`, `scopes`, `organizationId` | Many-to-many proxies and optional environment allowlist |
| `DeveloperApp` | `name`, `status`, `organizationId` | Owns credentials |
| `AppCredential` | `consumerKey`, `consumerSecretHash`, `authMethods`, `status`, validity | Unique `consumerKey`; secret is not readable |
| `CredentialProductGrant` | credential, product, `status`, `scopes` | Unique credential/product |
| `AppPublicKey` | credential, `kid`, RSA JWK, `RS256`, status, validity | Unique credential/`kid` |
| `AppCertificate` | credential, SHA-256 fingerprint, metadata, status, validity | Unique fingerprint |

## Authoritative Values

`DeploymentStage`:

```text
qual | pprod | prod
```

`DeploymentRegion`:

```text
ce | es | de | be | fr | us | uk | jp | br | kr
```

`CredentialAuthMethod`:

```text
apiKey | clientSecret | jwtBearer | mtls
```

`AuthorizationStatus`:

```text
pending | approved | revoked
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
