---
title: "OAuth 2.0"
type: policy
doc_status: current
implementation_status: implemented
last_verified: 2026-07-27
tags:
  - type/policy
  - area/policies
sources:
  - packages/gateway-core/src/policies/oauth/oauth-token.policy.ts
  - packages/gateway-core/src/policies/oauth/oauth-access-token.policy.ts
aliases: []
---

# OAuth 2.0

> [!summary] At a glance
> The gateway implements two machine-to-machine token grants and verifies the resulting signed access token on business endpoints.

## Current Support

| Flow | Client authentication | Result |
| --- | --- | --- |
| Client Credentials | `consumerKey` + `consumerSecret` over HTTP Basic | Gateway access-token JWT |
| JWT Bearer Grant | Client-signed JWT assertion verified with its registered public JWK | Gateway access-token JWT |

The JWT in JWT Bearer is an assertion used to authenticate the client at the
token endpoint. The returned JWT is a different artifact: an access token
signed by the gateway and consumed by `oauth-access-token`.

## Authoritative Values

- Token endpoint: `POST /oauth/token`.
- Public gateway keys: `GET /oauth/.well-known/jwks.json`.
- No refresh tokens.
- No authorization code, implicit, password, `private_key_jwt`, or direct
  external JWT flow.

## Examples

See [[OAuth Token Issuance]] for grant parameters and
[[OAuth Access Token Verification]] for protected endpoint configuration.

## Source Files

- `packages/gateway-core/src/policies/oauth/oauth-token.policy.ts`
- `packages/gateway-core/src/policies/oauth/oauth-access-token.policy.ts`

---

Back to [[Policy Reference Index]] | See also: [[Authentication and Authorization]]
