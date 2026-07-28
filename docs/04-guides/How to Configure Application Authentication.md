---
title: "How to Configure Application Authentication"
type: guide
doc_status: current
implementation_status: implemented
last_verified: "2026-07-27"
tags:
  - type/guide
  - area/security
sources:
  - packages/database/src/credentials.ts
  - packages/database/src/seed-policies.ts
  - packages/shared/src/policies/config.ts
  - packages/management-api/src/routes/certificates.ts
aliases: []
---

# How to Configure Application Authentication

> [!summary] At a glance
> Configure an application credential, approve product grants, register the required public material, and apply exactly one authentication policy to each business endpoint.

## Goal

Provision API key, Client Credentials, JWT Bearer, or direct mTLS access using
domain operations, seeds, and the implemented PKI control plane.

## Prerequisites

- An organization, developer app, API product, proxy, and deployment.
- Product scopes and proxy membership already defined.
- Gateway signing and trusted-ingress environment variables configured.
- A database reset after adopting the rewritten baseline migration.

## Steps

1. Call `createAppCredential` with one or more closed `authMethods`. Persist the
   returned secret in the client secret store; it cannot be read back.
2. Use `rotateConsumerSecret` for rotation. The old secret stops working after
   the update.
3. Call `setCredentialProductGrant` with approved status and scopes that are a
   subset of the product scopes.
4. For JWT Bearer, call `registerAppPublicKey` with an RSA public JWK and unique
   `kid`. Never store the client private key in this repository.
5. For mTLS, generate a client-owned key and CSR, then issue or register its
   certificate through the Admin Panel or Management API.
6. Configure one business-endpoint policy: `api-key-auth`,
   `oauth-access-token`, or `mtls-auth`.
7. For OAuth, obtain a token from `/oauth/token` and use it as a Bearer token.

Application, credential, grant, and public-JWK creation still use domain
services and seeds. CA and certificate lifecycle is available in the Admin
Panel and Management API.

The development seed provides concrete examples in `env-qual-es`:

| Endpoint | Authentication |
| --- | --- |
| `/es/banking/v1/accounts` | API key |
| `/es/banking/v1/accounts/:id` | OAuth Bearer |
| `/es/banking/v1/health` | Direct mTLS through a trusted ingress |

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
