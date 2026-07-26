---
title: "ADR-005 Signed OAuth Tokens"
type: decision
doc_status: current
implementation_status: implemented
decision_status: accepted
last_verified: "2026-07-27"
tags:
  - type/decision
  - area/security
sources:
  - packages/gateway-core/src/oauth/runtime.ts
  - packages/gateway-core/src/policies/oauth/oauth-token.policy.ts
  - packages/gateway-core/src/policies/oauth/oauth-access-token.policy.ts
aliases: []
---

# ADR-005 Signed OAuth Tokens

> [!summary] At a glance
> The gateway issues short-lived RS256 JWT access tokens bound to one environment and verifies them without a database lookup.

## Context

OAuth-protected APIs need predictable latency and must continue validating
already-issued tokens when PostgreSQL is temporarily unavailable. The signing
key must not be stored with application configuration.

## Decision

Issue RS256 JWT access tokens with a `kid`, 15-minute default TTL, one-hour
maximum, explicit audience, environment, products, proxies, and scopes. Inject
the PKCS#8 private key through `OAUTH_SIGNING_PRIVATE_KEY_BASE64`; expose only
the derived public JWK. Do not persist access tokens or support individual
revocation.

## Alternatives

- Opaque tokens: rejected because every request would require shared state.
- Database lookup per request: rejected for latency and availability coupling.
- ES256: deferred to keep one closed algorithm and simpler key operations.
- Individual token revocation: rejected for this phase because it reintroduces
  stateful verification.

## Consequences

Bearer verification is local and resilient to PostgreSQL outages. Credential,
grant, or product revocation does not invalidate an existing token before
`exp`; TTL is therefore the operational revocation bound. Key rotation requires
coordinating the signing key and JWKS publication.

## Related Implementation

- [[Authentication and Authorization]]
- [[OAuth Token Issuance]]
- [[OAuth Access Token Verification]]
