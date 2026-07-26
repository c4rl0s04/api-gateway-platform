---
title: "JWT Validation"
type: policy
doc_status: current
implementation_status: planned
last_verified: 2026-07-27
tags:
  - type/policy
  - area/policies
sources:
  - packages/shared/src/policies/config.ts
aliases: []
---

# JWT Validation

> [!summary] At a glance
> Gateway-issued OAuth access tokens are verified, but arbitrary external JWTs remain unsupported.

## Current Support

`oauth-access-token` verifies only access tokens issued by this gateway. The
JWT Bearer Grant also verifies a client assertion only at `/oauth/token`.
Neither behavior is a general-purpose `jwt-auth` policy.

## Authoritative Values

The retired `jwt-auth` placeholder is not an accepted policy type. Direct JWTs
issued by third parties, arbitrary JWKS URLs, and custom JWT claim mapping are
not supported.

## Examples

Use [[OAuth Access Token Verification]] for gateway-issued Bearer tokens and
[[OAuth Token Issuance]] for client-signed assertions.

## Source Files

- `packages/shared/src/policies/config.ts`

---

Back to [[Policy Reference Index]] | See also: [[Policies in Apigee]]
