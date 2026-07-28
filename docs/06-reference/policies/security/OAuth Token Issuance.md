---
title: "OAuth Token Issuance"
type: policy
doc_status: current
implementation_status: implemented
last_verified: "2026-07-27"
tags:
  - type/policy
  - area/security
sources:
  - packages/gateway-core/src/policies/oauth/oauth-token.policy.ts
  - packages/shared/src/policies/config.ts
  - packages/gateway-core/test/authentication.test.ts
aliases:
  - oauth-token
---

# OAuth Token Issuance

> [!summary] At a glance
> `oauth-token` is a terminal policy for `POST /oauth/token`. It supports Client Credentials and JWT Bearer Grant and emits RS256 Bearer tokens without forwarding.

## Current Support

The endpoint requires `application/x-www-form-urlencoded`. Client Credentials
uses HTTP Basic. JWT Bearer uses `assertion` and the RFC 7523 grant URN.
Rate limiting must run before this policy with `failureMode: closed`.

## Authoritative Values

```json
{
  "grantTypes": [
    "client_credentials",
    "urn:ietf:params:oauth:grant-type:jwt-bearer"
  ],
  "accessTokenTtlSeconds": 900,
  "audience": "api-gateway",
  "allowedScopes": ["accounts:read"],
  "failureMode": "closed"
}
```

`accessTokenTtlSeconds` is at most `3600`. Assertion claims require
`iss=sub=consumerKey`, `aud`, `iat`, `exp`, `jti`, RS256, and `kid`.
Assertion lifetime is at most 120 seconds.

| Result | HTTP / OAuth error |
| --- | --- |
| Unsupported grant | `400 unsupported_grant_type` |
| Missing form input | `400 invalid_request` |
| Invalid client secret | `401 invalid_client` |
| Invalid or replayed assertion | `400 invalid_grant` |
| Unauthorized scope | `400 invalid_scope` |
| Success | `200`, `access_token`, `token_type`, `expires_in`, `scope` |

## Examples

```bash
curl -u 'consumer-key:consumer-secret' \
  -H 'content-type: application/x-www-form-urlencoded' \
  --data 'grant_type=client_credentials&scope=accounts%3Aread' \
  --cacert .local-secrets/pki/authorities/local-development/ca.crt \
  https://localhost:8443/oauth/token
```

JWT Bearer replaces Basic authentication with:

```text
grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=<signed-jwt>
```

## Source Files

- `packages/gateway-core/src/policies/oauth/oauth-token.policy.ts`
- `packages/gateway-core/test/authentication.test.ts`
- [[Debug OAuth and mTLS]]
