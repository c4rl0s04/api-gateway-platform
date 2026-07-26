---
title: "Debug OAuth and mTLS"
type: runbook
doc_status: current
implementation_status: implemented
last_verified: "2026-07-27"
tags:
  - type/runbook
  - area/operations
sources:
  - packages/gateway-core/src/policies/oauth/oauth-token.policy.ts
  - packages/gateway-core/src/policies/oauth/oauth-access-token.policy.ts
  - packages/gateway-core/src/policies/auth/mtls.policy.ts
aliases: []
---

# Debug OAuth and mTLS

> [!summary] At a glance
> Diagnose token and certificate failures from status, safe metadata, configuration, and database state without logging credentials, assertions, tokens, or private keys.

## Symptoms

- `invalid_client`, `invalid_grant`, or `invalid_scope` from `/oauth/token`.
- `401` or `403` from a Bearer-protected API.
- mTLS headers rejected despite a client certificate.
- Readiness never succeeds after key or CIDR changes.

## Impact

Affected applications cannot obtain tokens or access protected APIs. Existing
signed access tokens remain valid until expiration unless signing verification
configuration is broken.

## Diagnosis

1. Confirm `GATEWAY_ENVIRONMENT_ID`, issuer, token endpoint audience, signing
   `kid`, and trusted CIDRs.
2. For `invalid_client`, inspect credential/app status, expiry, allowed method,
   and secret rotation state.
3. For `invalid_grant`, check assertion RS256 `kid`, `iss=sub=consumerKey`,
   audience, clock, maximum 120-second lifetime, `jti`, JWK status, and Redis.
4. For `invalid_scope`, compare requested scopes with policy, grant, and product
   scopes.
5. For Bearer `401`, check signature, issuer, audience, `iat`, `nbf`, and `exp`.
6. For Bearer `403`, compare `environment_id`, `proxy_ids`, and required scopes.
7. For mTLS, verify the immediate socket IP is trusted and that the ingress
   replaced client-supplied headers with normalized verified values.

Never paste full secrets, assertions, access tokens, or private keys into logs
or tickets. Record request ID, `kid`, consumer key, environment, proxy, status,
and non-sensitive claim names only.

## Resolution

- Correct issuer/audience/CIDR configuration and restart the gateway.
- Rotate a consumer secret or signing key through the controlled secret store.
- Approve or replace the relevant grant, public JWK, or certificate.
- Restore Redis before retrying JWT Bearer assertions; replay protection fails
  closed.
- Obtain a new access token after authorization data changes.

## Verification

Repeat the failing flow with a newly issued credential or token. Confirm JWKS
contains the expected public `kid`, access succeeds only in the intended
environment/proxy, and no sensitive values appear in logs.

## Escalation

Escalate signing-key load failures, repeated Redis replay failures for unique
`jti` values, or evidence that the ingress forwards unsanitized mTLS headers.
