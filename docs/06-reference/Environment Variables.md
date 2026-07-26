---
title: Environment Variables
type: reference
doc_status: current
implementation_status: implemented
last_verified: 2026-07-27
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
| `GATEWAY_ENVIRONMENT_ID` | Outside tests | None | Non-empty environment ID |
| `OAUTH_ISSUER` | Outside tests | None | URL used as token `iss` |
| `OAUTH_TOKEN_ENDPOINT_AUDIENCE` | Outside tests | None | Required JWT assertion `aud` |
| `OAUTH_SIGNING_PRIVATE_KEY_BASE64` | Outside tests | None | Base64 PKCS#8 RSA private key; imported at startup |
| `OAUTH_SIGNING_KEY_ID` | Outside tests | None | Non-empty signing/JWKS `kid` |
| `MTLS_TRUSTED_PROXY_CIDRS` | Outside tests | None | Comma-separated valid CIDRs |

The gateway parses these variables before loading configuration or listening.
It imports the private key and parses every CIDR before readiness. The private
key must come from a secret manager or local untracked `.env`, never Git.

### Local Compose bootstrap

`npm run dev:local` does not require developers to populate `.env`. The
bootstrap creates `.local-secrets/compose.env` and injects the signing key,
client public JWK, and client-certificate fingerprint into Compose. The
directory is ignored by Git and its material is reused across local restarts.

| Variable | Consumer | Purpose |
| --- | --- | --- |
| `DEV_UPSTREAM_BASE_URL` | Base seed | Replaces `localhost` with the Compose mock service |
| `DEV_CLIENT_PUBLIC_JWK` | Policy seed | Registers the generated assertion verification key |
| `DEV_MTLS_CERT_FINGERPRINT` | Policy seed and ingress | Keeps the registered certificate and normalized ingress header aligned |

These three variables are development bootstrap inputs, not production gateway
configuration.

### management-api

`src/config/env.ts` defines `PORT` with default `3002` and required
`DATABASE_URL`. The current server does not call that schema, so these values
are not an effective runtime contract yet.

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
