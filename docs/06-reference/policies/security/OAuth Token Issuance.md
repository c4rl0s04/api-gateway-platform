---
title: "OAuth Token Issuance"
type: policy
doc_status: current
implementation_status: implemented
last_verified: "2026-08-10"
tags:
  - type/policy
  - area/security
sources:
  - packages/gateway-core/src/policies/oauth/oauth-token.policy.ts
  - packages/shared/src/policies/config.ts
  - packages/gateway-core/test/authentication.test.ts
  - packages/management-api/src/services/developer-tokens.ts
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

The policy also accepts the internal
`urn:api-gateway:params:oauth:grant-type:developer-token` exchange used by the
Management API. It is not a public client grant: callers cannot construct it
from app credentials. The gateway verifies a 30-second HS256 authorization
assertion from Management API, rejects replay through Redis, and emits the same
RS256 access-token format with `token_kind=developer` and an explicit
organization boundary.

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
The selected environment's `publicOrigin` is the access-token issuer. JWT
Bearer assertions must use `<publicOrigin>/oauth/token` as their audience.

| Result | HTTP / OAuth error |
| --- | --- |
| Unsupported grant | `400 unsupported_grant_type` |
| Missing form input | `400 invalid_request` |
| Invalid client secret | `401 invalid_client` |
| Invalid or replayed assertion | `400 invalid_grant` |
| Invalid or replayed internal developer grant | `400 invalid_grant` |
| Unauthorized scope | `400 invalid_scope` |
| Success | `200`, `access_token`, `token_type`, `expires_in`, `scope` |

## Examples

```bash
curl -u 'consumer-key:consumer-secret' \
  -H 'content-type: application/x-www-form-urlencoded' \
  --data 'grant_type=client_credentials&scope=accounts%3Aread' \
  --cacert .local-secrets/pki/authorities/local-development/ca.crt \
  https://qual-es.gateway.localhost:8443/oauth/token
```

JWT Bearer replaces Basic authentication with:

```text
grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=<signed-jwt>
```

Developer tokens must be requested through the authorized Management API or
Playground flow. Direct use of the internal grant is unsupported.

## Source Files

- `packages/gateway-core/src/policies/oauth/oauth-token.policy.ts`
- `packages/gateway-core/test/authentication.test.ts`
- [[Debug OAuth and mTLS]]
