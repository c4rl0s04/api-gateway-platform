---
title: How to Start the Project
type: guide
doc_status: current
implementation_status: implemented
last_verified: 2026-08-06
tags:
  - type/guide
  - area/operations
sources:
  - package.json
  - .env.example
  - docker-compose.yml
  - scripts/dev-local.sh
  - infra/docker/Dockerfile.dev
  - packages/database/package.json
  - packages/gateway-core/package.json
aliases: []
---

# How to Start the Project

> [!summary] At a glance
> Run `npm run dev:local` to prepare encrypted PKI and OAuth material, migrate and seed PostgreSQL, and start the complete local data and control planes.

## Goal

Run the implemented platform locally with one command.

## Prerequisites

| Requirement | Minimum |
| --- | --- |
| Node.js | `22.19.0` |
| npm | Version bundled with the selected Node.js release |
| Docker | A release with Compose v2 |

## Steps

1. Start the complete environment in the foreground.

```bash
npm run dev:local
```

The bootstrap script generates reusable local-only files under
`.local-secrets/`, builds one application image, waits for PostgreSQL and Redis,
applies pending migrations, loads both idempotent seeds, and starts:

| Service | Purpose |
| --- | --- |
| `postgres` | Persistent gateway configuration |
| `redis` | Rate limits and JWT assertion replay protection |
| `database-setup` | One-shot migrations and seeds |
| `mock-backend` | Local forwarding target |
| `gateway` | Internal data plane |
| `envoy` | Public HTTPS and mTLS ingress on `8443` |
| `keycloak` | Local OIDC provider on `8081` |
| `management-api` | Internal OIDC-protected control plane |
| `admin-panel` | Web administration on `8080` |

The first execution downloads images and dependencies. Later executions reuse
Docker's build cache and the generated keys and certificates. The Envoy
certificate covers all 30 origins following
`https://<stage>-<region>.gateway.localhost:8443`.

2. Stop the foreground environment with `Ctrl+C`. To run it in the background
instead:

```bash
npm run dev:local:detached
npm run dev:local:down
```

For the difference between stopping, removing, resuming without seeds, and
resetting persistent local state, see [[How to Manage the Local Platform Lifecycle]].

PostgreSQL uses a named volume, so a normal stop preserves local data. Remove
containers and disposable database data explicitly with:

```bash
npm run dev:local:down -- --volumes
```

## Verification

```bash
curl --cacert .local-secrets/pki/authorities/local-development/ca.crt \
  https://qual-es.gateway.localhost:8443/live
curl --cacert .local-secrets/pki/authorities/local-development/ca.crt \
  https://qual-es.gateway.localhost:8443/ready
curl --cacert .local-secrets/pki/authorities/local-development/ca.crt \
  https://prod-es.gateway.localhost:8443/oauth/.well-known/jwks.json
curl -H "x-api-key: dev-bank-key-abc123" \
  --cacert .local-secrets/pki/authorities/local-development/ca.crt \
  https://qual-es.gateway.localhost:8443/es/banking/v1/accounts
curl -H "x-api-key: dev-bank-key-abc123" \
  --cacert .local-secrets/pki/authorities/local-development/ca.crt \
  https://pprod-es.gateway.localhost:8443/es/banking/v1/accounts
curl --cacert .local-secrets/pki/authorities/local-development/ca.crt \
  --cert .local-secrets/clients/cred-bank-001/client.crt \
  --key .local-secrets/clients/cred-bank-001/client.key \
  https://qual-es.gateway.localhost:8443/es/banking/v1/health
```

The first two requests should report a live and ready gateway. The API-key
requests demonstrate ES Banking revision 2 in both `qual-es` and `pprod-es`;
the mTLS request should also reach the mock backend.
The JWKS request demonstrates that the managed OAuth proxy is deployed in
`prod-es`. ES Banking revision 3 is intentionally not deployed, so
`/es/banking/v2/accounts` returns `404`.
Open `http://localhost:8080`; local usernames and generated passwords are in
`.local-secrets/keycloak/users.env`.

See [[Seed Example Catalog]] for the complete revision and policy examples.

`npm run test:platform` does not use this retained environment. It creates and
removes a separate stack so Management API mutation tests cannot add
organizations, credentials, or revisions to the normal local database.

## Troubleshooting or Rollback

- Docker refusal: start the Docker engine before running the command.
- Database setup failure: inspect
  `docker compose --env-file .local-secrets/compose.env logs database-setup`.
- `502`: inspect
  `docker compose --env-file .local-secrets/compose.env logs mock-backend gateway`.
- `EADDRINUSE`: read [[Ports]] and release the reported host port.
- Schema incompatibility in disposable local data: follow [[Reset Local Database]].
- Invalid local material: stop the environment, remove `.local-secrets/`, and
  start it again to regenerate keys and certificates.
- Changed realm bootstrap with retained Keycloak data: run
  `npm run dev:local:down -- --volumes` before starting again.

## Related Notes

- [[Environment Variables]]
- [[How to Manage the Local Platform Lifecycle]]
- [[Command Reference]]
- [[Deployment Model]]
- [[gateway-core]]
- [[How to Operate the PKI]]
