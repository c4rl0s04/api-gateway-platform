---
title: Environment Variables
type: reference
doc_status: current
implementation_status: implemented
last_verified: 2026-08-02
tags:
  - type/reference
  - area/operations
sources:
  - .env.example
  - docker-compose.yml
  - scripts/dev-local.sh
  - packages/gateway-core/src/config/env.ts
  - packages/management-api/src/config/env.ts
aliases: []
---

# Environment Variables

> [!summary] At a glance
> This reference separates environment variables enforced by running code from schemas or conventions that are not yet wired into their process.

## Current Support

### gateway-core

| Variable | Required | Default | Validation |
| --- | --- | --- | --- |
| `NODE_ENV` | No | `development` | `development`, `test`, or `production` |
| `HOST` | No | `0.0.0.0` | Non-empty string |
| `PORT` | No | `3000` | Integer from 1 to 65535 |
| `DATABASE_URL` | Yes | None | Valid URL |
| `REDIS_URL` | No | `redis://localhost:6379` | `redis://` or `rediss://` URL |
| `LOG_LEVEL` | No | `info` | Pino level or `silent` |
| `GATEWAY_INSTANCE_ID` | No | Hostname | Unique runtime status identity |
| `GATEWAY_CONFIG_RECONCILE_SECONDS` | No | `10` | Integer from 1 to 60 |
| `GATEWAY_ENVIRONMENT_ALLOWLIST` | No | All active deployments | Comma-separated environment IDs |
| `OAUTH_SIGNING_PRIVATE_KEY_BASE64` | Outside tests | None | Base64 PKCS#8 RSA private key; imported at startup |
| `OAUTH_SIGNING_KEY_ID` | Outside tests | None | Non-empty signing/JWKS `kid` |
| `MTLS_TRUSTED_PROXY_CIDRS` | Outside tests | None | Comma-separated valid CIDRs |

The gateway parses these variables before loading configuration or listening.
An empty or absent allowlist loads every active deployment. The request
hostname selects one loaded environment through its `publicOrigin`. OAuth
issuer and JWT assertion audience are derived from that origin rather than
process variables. The gateway imports the private key and parses every CIDR
before readiness. The private key must come from a secret manager or local
untracked `.env`, never Git.

### Local Compose bootstrap

`npm run dev:local` does not require developers to populate `.env`. The
bootstrap creates `.local-secrets/compose.env`, OAuth keys, an encrypted
managed CA keystore, ingress material, Keycloak users, and two client
identities. The directory is ignored by Git and reused across local restarts.

| Variable | Consumer | Purpose |
| --- | --- | --- |
| `DEV_UPSTREAM_BASE_URL` | Base seed | Replaces `localhost` with the Compose mock service |
| `DEV_CLIENT_PUBLIC_JWK` | Policy seed | Registers the generated assertion verification key |
| `DEV_MTLS_CERT_FINGERPRINT` | Policy seed and ingress | Keeps the registered certificate and normalized ingress header aligned |
| `DEV_MTLS_CERT_FINGERPRINT_SECOND` | Policy seed | Registers the second local mTLS client |
| `DEV_MTLS_CA_CERTIFICATE_BASE64` | Policy seed | Persists public local CA metadata |
| `DEV_MTLS_CRL_BASE64` | Policy seed | Persists the initial local CRL |
| `DEV_MTLS_CLIENT_CERTIFICATE_BASE64` | Policy seed | Persists first client public certificate metadata |
| `DEV_MTLS_CLIENT_CERTIFICATE_SECOND_BASE64` | Policy seed | Persists second client public certificate metadata |
| `KEYCLOAK_ADMIN_PASSWORD` | Keycloak | Bootstraps the untracked local administrator |

These variables are development bootstrap inputs, not production gateway
configuration.

### management-api

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `HOST` | No | `0.0.0.0` | Listen address |
| `PORT` | No | `3002` | Internal listen port |
| `DATABASE_URL` | Yes | None | PostgreSQL connection |
| `REDIS_URL` | No | `redis://localhost:6379` | Durable outbox publication and runtime status |
| `OIDC_ISSUER` | Yes | None | Exact accepted token issuer |
| `OIDC_AUDIENCE` | No | `management-api` | Required access-token audience |
| `OIDC_JWKS_URI` | No | Issuer discovery | Internal override for JWKS retrieval |
| `PKI_KEYSTORE_DIR` | Yes | None | Encrypted managed-key directory |
| `PKI_MASTER_KEY_FILE` | Yes | None | Separate AES master-key file |
| `PKI_TRUST_BUNDLE_FILE` | Yes | None | Envoy public CA bundle |
| `PKI_CRL_BUNDLE_FILE` | Yes | None | Envoy public CRL bundle |
| `PKI_SDS_TRIGGER_FILE` | Yes | None | Atomically replaced SDS resource |

Management API confirms routing mutations even when Redis is unavailable. Its
outbox dispatcher retries publication after reconnecting.

### admin-panel

| Variable | Default | Purpose |
| --- | --- | --- |
| `MANAGEMENT_API_URL` | `http://localhost:3002` | Server-side internal API origin |
| `OIDC_ISSUER` | Local Keycloak realm | Browser-visible issuer |
| `OIDC_INTERNAL_BASE_URL` | `http://localhost:8081` | Server-side token endpoint base |
| `OIDC_CLIENT_ID` | `admin-panel` | Public PKCE client |
| `OIDC_CALLBACK_URL` | `http://localhost:8080/api/auth/callback` | Exact callback |

## Authoritative Example

`.env.example` is the local gateway baseline. Secrets and environment-specific
credentials must remain outside version control.

## Source Files

- `.env.example`
- `packages/gateway-core/src/config/env.ts`
- `packages/management-api/src/config/env.ts`

## Related Notes

- [[How to Start the Project]]
- [[Ports]]
- [[gateway-core]]
