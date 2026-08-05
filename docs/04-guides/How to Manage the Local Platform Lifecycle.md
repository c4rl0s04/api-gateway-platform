---
title: How to Manage the Local Platform Lifecycle
type: guide
doc_status: current
implementation_status: implemented
last_verified: 2026-08-06
tags:
  - type/guide
  - area/operations
sources:
  - package.json
  - docker-compose.yml
  - scripts/dev-local.sh
aliases:
  - Local Platform Lifecycle
  - Start Stop and Reset Local Platform
---

# How to Manage the Local Platform Lifecycle

> [!summary] At a glance
> Use `dev:local` for a first or normal startup. Use the advanced stop/resume sequence only when retaining existing containers and avoiding another seed run is required.

## Goal

Start, stop, resume, reset, and verify the persistent local platform while
understanding which data and generated material each operation retains.

## Prerequisites

- Node.js `22.19.0` or newer and installed npm dependencies.
- Docker with Compose v2 running.
- The repository root is the working directory for every command below.
- Read [[Command Reference]] before using direct database or Compose commands.

## Steps

### First startup or normal startup

```bash
npm run dev:local
```

For a background process:

```bash
npm run dev:local:detached
```

The bootstrap performs these steps in order:

1. Creates `.local-secrets/` if needed and reuses existing local secrets.
2. Generates the Keycloak realm file and local administrator passwords when absent.
3. Generates or reuses the gateway signing key, client assertion key, encrypted PKI keystore, local CA, client certificates, CRLs, and Envoy SDS files.
4. Produces `.local-secrets/compose.env` with runtime-only configuration.
5. Builds the local application image.
6. Starts PostgreSQL, Redis, Keycloak, and the mock backend.
7. Runs `database-setup`, which applies committed migrations and runs the base and policy seeds.
8. Starts Gateway, Management API, Admin Panel, and Envoy after their dependencies are ready.

The migration and seed operations are idempotent, but they are still invoked by
each `dev:local` startup command.

### Stop and remove containers while retaining data

```bash
npm run dev:local:down
```

This removes the local Compose containers and network but keeps the PostgreSQL
and Keycloak named volumes. A later `dev:local` or `dev:local:detached` startup
uses that retained data and again runs the idempotent migration and seed setup.

### Stop and resume without rerunning seeds

This advanced path retains existing containers as well as volumes. Stop only
the long-running services; do not start the completed `database-setup`
container again.

```bash
docker compose --env-file .local-secrets/compose.env stop \
  envoy admin-panel management-api gateway mock-backend keycloak redis postgres
```

Resume dependencies first, then data-plane/control-plane services, then public
entry points:

```bash
docker compose --env-file .local-secrets/compose.env up -d --no-deps --wait \
  postgres redis keycloak mock-backend

docker compose --env-file .local-secrets/compose.env up -d --no-deps --wait \
  gateway management-api

docker compose --env-file .local-secrets/compose.env up -d --no-deps \
  admin-panel envoy
```

This does not run `database-setup`, so it does not invoke migration or seed
commands. It is valid only while the containers created by a previous local
startup still exist and the Compose configuration has not changed in a way that
requires recreation. Use the normal startup command after code, image, Compose,
or bootstrap changes.

### Reset local state completely

```bash
npm run dev:local:down -- --volumes
npm run dev:local:detached
```

The first command removes PostgreSQL and Keycloak volumes as well as local
containers. The second creates fresh database and identity state, applies all
migrations, and loads the seeds from zero.

This reset retains `.local-secrets/`; the next bootstrap reuses its local
OAuth and PKI material. Deliberately remove that directory only when a complete
replacement of local keys, certificates, and generated passwords is required.

### Run the isolated platform test

```bash
npm run test:platform
```

This is not a lifecycle command for the retained local platform. It creates a
separate temporary Compose project with temporary secrets, ports, databases,
and Keycloak state, then removes those resources after the test. It does not
seed or modify the normal local PostgreSQL volume.

## Verification

Check service status:

```bash
docker compose --env-file .local-secrets/compose.env ps
```

Check the local Gateway liveness endpoint:

```bash
curl --cacert .local-secrets/pki/authorities/local-development/ca.crt \
  https://qual-es.gateway.localhost:8443/live
```

The Admin Panel is available at `http://localhost:8080`. Local Keycloak is
available at `http://localhost:8081`; generated local credentials are in
`.local-secrets/keycloak/users.env`.

## Troubleshooting or Rollback

- If direct resume fails because an image, environment variable, or Compose
  definition changed, run `npm run dev:local:down` followed by
  `npm run dev:local:detached`.
- If database history or seed state is disposable and inconsistent, follow
  [[Reset Local Database]].
- If Keycloak realm bootstrap changes while its volume is retained, reset
  volumes before starting again.
- Never use the volume-reset command against shared or production data.

## Related Notes

- [[Command Reference]]
- [[How to Start the Project]]
- [[How to Run Tests]]
- [[Ports]]
- [[Environment Variables]]
