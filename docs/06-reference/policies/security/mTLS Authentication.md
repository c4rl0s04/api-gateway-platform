---
title: "mTLS Authentication"
type: policy
doc_status: current
implementation_status: implemented
last_verified: "2026-07-27"
tags:
  - type/policy
  - area/security
sources:
  - packages/gateway-core/src/policies/auth/mtls.policy.ts
  - packages/gateway-core/src/oauth/runtime.ts
  - packages/gateway-core/test/authentication.test.ts
aliases:
  - mtls-auth
---

# mTLS Authentication

> [!summary] At a glance
> `mtls-auth` authorizes a certificate fingerprint only when normalized headers arrive directly from a configured trusted ingress.

## Current Support

Required ingress headers:

| Header | Required value |
| --- | --- |
| `x-gateway-client-cert-verified` | `SUCCESS` |
| `x-gateway-client-cert-sha256` | 64-character SHA-256 hexadecimal fingerprint |

The immediate socket address must match `MTLS_TRUSTED_PROXY_CIDRS`. The policy
then checks certificate, credential, app, grant, product, proxy, environment,
status, and validity windows. It authorizes the API directly and emits no token.

## Authoritative Values

```json
{
  "failureMode": "closed"
}
```

| Result | Status |
| --- | --- |
| Untrusted immediate source or unverified certificate | `401` |
| Unknown, expired, or revoked certificate/credential | `401` |
| No approved product authorization | `403` |
| PostgreSQL unavailable, closed | `503` |
| Authorized | Continue and populate client context |

## Examples

Ingresses must remove any incoming values for the two internal headers before
setting them from the verified TLS connection.

## Source Files

- `packages/gateway-core/src/policies/auth/mtls.policy.ts`
- `packages/gateway-core/src/oauth/runtime.ts`
- [[Debug OAuth and mTLS]]
