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
  - infra/envoy/envoy.yaml
aliases:
  - mtls-auth
---

# mTLS Authentication

> [!summary] At a glance
> `mtls-auth` authorizes the SHA-256 fingerprint Envoy derives from the live client TLS certificate, and only when the immediate connection comes from a configured trusted CIDR.

## Current Support

Authoritative internal header:

| Header | Value |
| --- | --- |
| `x-gateway-client-cert-sha256` | Lowercase 64-character SHA-256 leaf fingerprint, or empty when no client certificate was presented |

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
| Untrusted immediate source or missing fingerprint | `401` |
| Unknown, expired, or revoked certificate/credential | `401` |
| No approved product authorization | `403` |
| PostgreSQL unavailable, closed | `503` |
| Authorized | Continue and populate client context |

## Examples

Envoy removes any incoming `x-gateway-client-cert-sha256` and overwrites it with
`%DOWNSTREAM_PEER_FINGERPRINT_256%`. Client certificate chain, validity, and CRL
checks happen in Envoy before this policy authorizes the database identity.

## Source Files

- `packages/gateway-core/src/policies/auth/mtls.policy.ts`
- `packages/gateway-core/src/oauth/runtime.ts`
- `infra/envoy/envoy.yaml`
- [[Debug OAuth and mTLS]]
