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
  - packages/management-api/src/services/certificate-authorities.ts
  - infra/envoy/envoy.yaml
aliases: []
---

# Debug OAuth and mTLS

> [!summary] At a glance
> Diagnose token and certificate failures from status, safe metadata, configuration, and database state without logging credentials, assertions, tokens, or private keys.

## Symptoms

- `invalid_client`, `invalid_grant`, or `invalid_scope` from `/oauth/token`.
- `401` or `403` from a Bearer-protected API.
- TLS handshake failure, mTLS `401`, or a certificate still accepted after
  revocation.
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
7. For a TLS handshake failure, inspect Envoy logs and verify the issuer is
   active/retiring, the full chain is available, certificate dates and client
   EKU are valid, and the CA CRL is current.
8. For mTLS `401`, calculate the leaf SHA-256 fingerprint and compare it with
   `AppCertificate`; verify certificate, credential, app, grant, product,
   environment, and proxy state.
9. Confirm Envoy removed any external `x-gateway-client-cert-sha256` and added
   the connection-derived value. The gateway must see Envoy's trusted immediate
   CIDR.
10. If revocation appears delayed, compare database `revokedAt`, CA CRL
    `thisUpdate`/`nextUpdate`, `.local-secrets/pki/crl-bundle.pem`, and Envoy SDS
    logs.
11. For control-plane `401`, verify Keycloak issuer and Management API audience.
    For `403`, inspect active `AdminMembership` issuer, subject, role, and
    organization.

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
- Refresh or upload the correct CRL, then verify the SDS resource was atomically
  replaced.
- Keep a previous CA `retiring` during client migration; do not revoke it until
  all old certificates are replaced.

## Verification

Repeat the failing flow with a newly issued credential or token. Confirm JWKS
contains the expected public `kid`, access succeeds only in the intended
environment/proxy, and no sensitive values appear in logs. Run:

```bash
npm run test:integration:mtls
npm run test:platform
```

## Escalation

Escalate signing-key load failures, repeated Redis replay failures for unique
`jti` values, keystore/master-key loss, stale external CRLs, failed SDS reloads,
or evidence that Envoy forwards a client-supplied identity header.
