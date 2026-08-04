---
title: "How to Configure Application Authentication"
type: guide
doc_status: current
implementation_status: implemented
last_verified: "2026-08-02"
tags:
  - type/guide
  - area/security
sources:
  - packages/database/src/credentials.ts
  - packages/database/src/seed-policies.ts
  - packages/shared/src/policies/config.ts
  - packages/management-api/src/routes/certificates.ts
  - packages/management-api/src/routes/apps.routes.ts
  - packages/database/src/application-management.ts
aliases: []
---

# How to Configure Application Authentication

> [!summary] At a glance
> Configure an application credential, approve product grants, register the required public material, and apply exactly one authentication policy to each business endpoint.

## Goal

Provision API key, Client Credentials, JWT Bearer, or direct mTLS access using
the Management API and the implemented PKI control plane.

## Prerequisites

- An organization, API product, proxy, and deployment.
- Product scopes and proxy membership already defined.
- Gateway signing and trusted-ingress environment variables configured.
- A database reset after adopting the rewritten baseline migration.

## Steps

1. Call `POST /v1/organizations/:organizationId/apps` with the app name and at
   least one product. The Management API atomically creates the app, initial
   credential, approved grants, and audit event.
2. Persist the returned `consumerSecret` in the client secret store. It appears
   only in this response; later reads return the consumer key but no secret or
   hash. Omitting grant scopes assigns all scopes declared by the product.
3. Call `POST /v1/apps/:appId/credentials` with explicit `products` for an
   independently permissioned credential, or with only `sourceCredentialId`
   to clone approved grants, scopes, and expiration. A clone receives a new key
   and secret and never inherits JWKs or certificates. For rotation, call
   `POST /v1/credentials/:credentialId/rotate-secret`; the old secret stops
   working immediately.
4. Optionally replace the consumer key with `PATCH
   /v1/credentials/:credentialId`. The existing secret and authorization
   material remain unchanged, while the previous key stops working.
5. Call `PUT /v1/credentials/:credentialId/product-grants` with the complete
   desired product and scope set. Omitted grants become revoked without being
   deleted.
6. For JWT Bearer, call
   `POST /v1/credentials/:credentialId/public-keys` with an RSA public JWK and
   unique `kid`. Never send the client private key to the platform.
7. For mTLS, generate a client-owned key and CSR, then issue or register its
   certificate through the Admin Panel or Management API.
8. Configure one business-endpoint policy: `api-key-auth`,
   `oauth-access-token`, or `mtls-auth`.
9. For OAuth, obtain a token from `/oauth/token` and use it as a Bearer token.

Application registration, additional credentials, secret rotation, grant
changes, and public-JWK registration are available through the Management API.
CA and certificate lifecycle is available in the Admin Panel and Management
API. See [[Management API Endpoint Reference]] and
[[How to Use the Management API with Postman]] for exact calls.

The development seed provides concrete examples in `env-qual-es`:

| Endpoint | Authentication |
| --- | --- |
| `/es/banking/v1/accounts` | API key |
| `/es/banking/v1/accounts/{id}` | OAuth Bearer |
| `/es/banking/v1/health` | Direct mTLS through a trusted ingress |

Additional seeds demonstrate custom API-key headers, OAuth scopes for other
products, public overrides, disabled policies, and combined authentication plus
rate limiting. See [[Seed Example Catalog]].

## Verification

- Invalid credentials return `401`.
- A valid credential without an approved matching grant returns `403`.
- `/oauth/token` returns a signed token for an allowed scope.
- JWKS contains the configured `kid` and no private RSA members.
- The token works only in its `environment_id` and listed `proxy_ids`.
- Spoofed mTLS headers from outside trusted CIDRs return `401`.
- Revoked managed certificates are rejected by Envoy after SDS reload.

## Troubleshooting or Rollback

Revoke a grant, public key, or certificate through its domain operation. Rotate
a leaked consumer secret. Shorten access-token TTL when faster indirect
revocation is required. See [[Debug OAuth and mTLS]].
For CA, CSR, CRL, rotation, and backup procedures, use [[How to Operate the PKI]].
