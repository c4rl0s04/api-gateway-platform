---
title: API Key Verification
type: policy
doc_status: current
implementation_status: implemented
last_verified: 2026-07-27
tags:
  - type/policy
  - area/policies
sources:
  - packages/gateway-core/src/policies/auth/api-key.policy.ts
  - packages/shared/src/policies/config.ts
  - packages/gateway-core/test/policies.test.ts
aliases:
  - api-key-auth
---

# API Key Verification

> [!summary] At a glance
> The implemented `api-key-auth` policy authenticates a credential and authorizes its products against the current proxy and environment.

## Current Support

The policy reads a configurable request header, defaulting to `x-api-key`.

| Outcome | Status |
| --- | --- |
| Missing key | `401` |
| Unknown, revoked, disallowed, or expired key | `401` |
| No authorized product for proxy/environment | `403` |
| Database failure with `closed` mode | `503` |
| Database failure with `open` mode | Continue in degraded state |
| Authorized credential | Continue and populate client context |

Invalid and revoked keys share one response to avoid revealing whether a key
previously existed.

## Authoritative Values

```json
{
  "header": "x-api-key",
  "failureMode": "closed"
}
```

The credential must allow `apiKey`; its app and credential must be approved and
within their validity window. An approved `CredentialProductGrant` authorizes
the current proxy. Its product must be active and either globally available or
explicitly allow the current environment.

## Examples

```bash
curl -H "x-api-key: dev-bank-key-abc123" \
  --cacert .local-secrets/pki/authorities/local-development/ca.crt \
  https://localhost:8443/es/banking/v1/accounts
```

## Source Files

- `packages/gateway-core/src/policies/auth/api-key.policy.ts`
- `packages/shared/src/policies/config.ts`

## Related Notes

- [[Policy Reference Index]]
- [[Debug Policy Failure]]
