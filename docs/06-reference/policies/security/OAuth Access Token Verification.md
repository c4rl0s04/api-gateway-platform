---
title: "OAuth Access Token Verification"
type: policy
doc_status: current
implementation_status: implemented
last_verified: "2026-07-27"
tags:
  - type/policy
  - area/security
sources:
  - packages/gateway-core/src/policies/oauth/oauth-access-token.policy.ts
  - packages/shared/src/policies/config.ts
  - packages/gateway-core/test/authentication.test.ts
aliases:
  - oauth-access-token
---

# OAuth Access Token Verification

> [!summary] At a glance
> `oauth-access-token` verifies only gateway-issued RS256 Bearer tokens and authorizes the current environment, proxy, and required scopes without PostgreSQL.

## Current Support

The policy requires `Authorization: Bearer <token>`. It validates `alg`, `kid`,
signature, issuer, audience, `sub`, `iat`, `nbf`, `exp`, `jti`, `client_id`,
`credential_id`, `environment_id`, `product_ids`, `proxy_ids`, and `scope`.

## Authoritative Values

```json
{
  "audience": "api-gateway",
  "requiredScopes": ["accounts:read"],
  "failureMode": "closed"
}
```

| Result | Status |
| --- | --- |
| Missing, invalid, or expired token | `401` |
| Wrong environment or proxy | `403` |
| Missing required scope | `403 insufficient_scope` |
| Valid token | Continue and populate client context |

Verification is stateless. Credential and grant changes affect an already
issued token only when it expires.

## Examples

```bash
curl -H 'Authorization: Bearer <access-token>' \
  http://localhost:3000/es/banking/v1/accounts
```

## Source Files

- `packages/gateway-core/src/policies/oauth/oauth-access-token.policy.ts`
- `packages/gateway-core/src/oauth/runtime.ts`
- [[ADR-005 Signed OAuth Tokens]]
