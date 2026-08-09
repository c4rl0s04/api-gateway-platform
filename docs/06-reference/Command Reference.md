---
title: Command Reference
type: reference
doc_status: current
implementation_status: implemented
last_verified: 2026-08-09
tags:
  - type/reference
  - area/operations
sources:
  - package.json
  - packages
  - scripts
aliases:
  - Commands
  - CLI Reference
---

# Command Reference

> [!summary] At a glance
> This is the authoritative catalog of implemented project commands. Use the local lifecycle guide for the usual start, stop, resume, and reset sequences.

## Current Support

Commands are classified as follows:

| Level | Meaning |
| --- | --- |
| `recommended` | Supported entry point for a normal developer or operator workflow. |
| `advanced` | Supported, but requires awareness of its target database, existing containers, or retained state. |
| `internal` | Called by a public command or test wrapper. Do not use it as a routine entry point. |
| `not supported` | Present in the repository but intentionally has no working operational behavior. |

All workspace commands use the same form:

```bash
npm run <script> --workspace=<package>
```

For example, `npm run test --workspace=packages/gateway-core` runs only the
gateway test suite.

## Local Platform

| Command | Level | Purpose and effects | Do not use when |
| --- | --- | --- | --- |
| `npm run dev:local` | recommended | Generates or reuses `.local-secrets/`, builds the local image, applies migrations, runs both seeds, and starts the complete Compose platform in the foreground. | You only need to resume already-created containers without rerunning the idempotent seed setup. |
| `npm run dev:local:detached` | recommended | Performs the same bootstrap, migration, and seed workflow in the background. | You need foreground logs or need to preserve an existing stopped stack without rerunning setup. |
| `npm run dev:local:down` | recommended | Stops and removes local platform containers and network while retaining named PostgreSQL and Keycloak volumes. | You intend to retain running services. |
| `npm run dev:local:down -- --volumes` | advanced | Also deletes named local volumes, including PostgreSQL and Keycloak data. The next startup rebuilds the seeded state. | Any retained local configuration, data, or identity state matters. |
| `npm run mock-backend` | advanced | Starts only the local mock upstream on port `4000`; it is normally started by Compose. | You expect a full gateway, TLS, Management API, or database environment. |

See [[How to Manage the Local Platform Lifecycle]] for the exact persistent
start, stop, resume, and reset sequences.

## Build, Test, and Quality

| Command | Level | Prerequisites | Purpose and effects |
| --- | --- | --- | --- |
| `npm run build` | recommended | Installed dependencies | Builds all workspaces in dependency order, including Prisma client generation and the Admin Panel production build. |
| `npm test` | recommended | Installed dependencies; `DATABASE_URL` only for opt-in integration coverage | Runs every workspace test script. Database integration tests remain skipped unless explicitly enabled. |
| `npm run lint` | advanced | Installed dependencies | Dispatches workspace lint scripts. Several current workspaces still report a `TODO` placeholder, so success is not equivalent to complete lint coverage. |
| `npm run test:integration:revisions` | recommended | `DATABASE_URL`, or a local platform initialized once | Verifies revision numbering, transactional imports, deployments, promotions, rollback, and conflicts against PostgreSQL. Without `DATABASE_URL`, the wrapper migrates and seeds a disposable Compose runner first. |
| `npm run test:integration:management` | recommended | `DATABASE_URL`, or a local platform initialized once | Verifies Management API persistence, role boundaries, lifecycle mutations, grants, keys, and audit behavior. Without `DATABASE_URL`, the wrapper prepares a Compose runner first. |
| `npm run test:integration:seed-examples` | recommended | Running local platform and `.local-secrets/` | Checks the seeded proxy revisions, deployments, policies, API key, OAuth, and idempotent reseeding examples through PostgreSQL and Envoy. |
| `npm run test:integration:mtls` | recommended | Running local platform and generated local PKI material | Exercises two client certificates, spoofing rejection, CRL revocation, and Envoy SDS reload. It temporarily changes local trust files and restores them on exit. |
| `npm run test:platform` | recommended | Docker, Node.js, OpenSSL | Creates a fully isolated Compose project with temporary secrets, ports, databases, Keycloak, and volumes; runs the end-to-end control-plane workflow; then removes those resources. |
| `npm run test:platform:config` | recommended | Docker, Node.js, OpenSSL | Validates the isolated platform Compose contract without starting services. |

`PLATFORM_TEST_KEEP_ON_FAILURE=1 npm run test:platform` is an advanced
diagnostic variant. It preserves the temporary isolated project and prints its
name and files after a failure; remove it manually with the emitted Compose
project name when investigation is complete.

## Database and Prisma

Run these from the database workspace. All commands read `DATABASE_URL`; inspect
that value before any migration, seed, or reset command.

| Command | Level | Purpose and effects |
| --- | --- | --- |
| `npm run build --workspace=packages/database` | recommended | Generates the Prisma client, compiles database domain services, and copies generated runtime files. |
| `npm run test --workspace=packages/database` | recommended | Runs database unit tests; disposable integration tests are skipped by default. |
| `npm run test:integration:revisions --workspace=packages/database` | advanced | Runs revision integration tests only when `RUN_DATABASE_INTEGRATION=1` is set. |
| `npm run db:generate --workspace=packages/database` | advanced | Regenerates Prisma client code from the current schema. Normally invoked by the database build. |
| `npm run db:migrate --workspace=packages/database` | advanced | Creates and applies a development Prisma migration. It is for schema development, not normal local startup. |
| `npm run db:migrate:deploy --workspace=packages/database` | advanced | Applies committed migrations without creating a new one. Normal Compose setup calls it before seeds. |
| `npm run db:seed --workspace=packages/database` | advanced | Loads organizations, environments, and logical proxy identities. |
| `npm run db:seed:policies --workspace=packages/database` | advanced | Loads products, applications, credentials, local memberships, policies, proxy revisions, and deployments. It depends on the base seed. |
| `npm run db:reset --workspace=packages/database` | advanced | Deletes and recreates the schema selected by `DATABASE_URL`, then runs Prisma's configured reset flow. See [[Reset Local Database]]. |
| `npm run db:studio --workspace=packages/database` | recommended | Opens Prisma Studio, normally on `http://localhost:5555`, for inspection. Do not use it to create revisions or deployments. |

## Package Development

These are advanced commands for working on a package outside the normal Compose
platform. They do not provision PostgreSQL, Redis, secrets, certificates, or
the other services required by the complete platform.

| Package | Command | Purpose and limitation |
| --- | --- | --- |
| `admin-panel` | `npm run dev --workspace=packages/admin-panel` | Starts Next.js development mode only; it requires separately reachable Management API and OIDC configuration. |
| `admin-panel` | `npm run start --workspace=packages/admin-panel` | Starts the production Next.js build; run the package build first. |
| `admin-panel` | `npm run build --workspace=packages/admin-panel` / `npm run test --workspace=packages/admin-panel` | Builds or tests the Admin Panel package. |
| `gateway-core` | `npm run dev --workspace=packages/gateway-core` | Watches and starts only the gateway using optional root `.env`; it does not bootstrap dependencies or required production security configuration. |
| `gateway-core` | `npm run build --workspace=packages/gateway-core` / `npm run test --workspace=packages/gateway-core` | Builds or tests the gateway package. |
| `gatewayctl` | `npm run build --workspace=packages/gateway-cli` / `npm run test --workspace=packages/gateway-cli` | Builds or tests the closed local cryptographic agent and identity store. |
| `lab-egress` | `npm run build --workspace=packages/lab-egress` / `npm run test --workspace=packages/lab-egress` | Builds or tests managed mocks and protected public HTTPS forwarding; it is normally internal to Compose. |
| `management-api` | `npm run dev --workspace=packages/management-api` | Watches and starts only Management API; supply its PostgreSQL, Redis, OIDC, and PKI configuration separately. |
| `management-api` | `npm run build --workspace=packages/management-api` / `npm run test --workspace=packages/management-api` | Builds or tests Management API. |
| `pki` | `npm run build --workspace=packages/pki` / `npm run test --workspace=packages/pki` | Builds or tests PKI issuance, keystore, CRL, and trust-bundle code. |
| `shared` | `npm run dev --workspace=packages/shared` | Watches shared TypeScript declarations only; it does not run a server. |
| `shared` | `npm run build --workspace=packages/shared` / `npm run test --workspace=packages/shared` | Builds or tests shared contracts and schemas. |

Every listed package except `pki` currently exposes `lint` as a placeholder
that prints `TODO: lint`; do not treat it as code-quality coverage.

The root `npm run dev` dispatches each workspace `dev` script concurrently. It
is an advanced development convenience, not a supported complete-platform
startup command, because those processes need independently prepared runtime
dependencies and configuration.

## Security and PKI

| Command | Level | Purpose and effects |
| --- | --- | --- |
| `npm run pki:client -- <credential-id> [rsa\|ec]` | recommended | Builds the PKI package, then creates a client-owned private key and CSR under `.local-secrets/clients/<credential-id>/`. It refuses to overwrite either material. Send only the CSR to the platform. |
| `npm run gatewayctl -- keys generate --name <name> --type jwt [--consumer-key <key>]` | recommended | Generates an encrypted local RS256 identity for JWT Bearer assertions. |
| `npm run gatewayctl -- keys generate --name <name> --type mtls --credential-id <id> [--algorithm rsa\|ec]` | recommended | Generates a key and CSR in the local agent store; only the CSR is returned to the browser/platform. |
| `npm run gatewayctl -- keys add ...` | recommended | Registers an existing JWT or mTLS private-key reference after ownership, permissions, algorithm, and optional certificate matching checks. |
| `npm run gatewayctl -- keys list` / `keys remove --id <id>` | recommended | Lists public identity metadata or removes a local alias and agent-generated encrypted material. |
| `npm run gatewayctl -- agent start\|status\|stop` | recommended | Starts, inspects, or stops the origin-bound loopback agent used by Playground and Personal Lab. |

See [[gatewayctl Reference]] for exact options and [[How to Connect Local Keys to the Playground]] for the browser flow.

## Documentation

| Command | Level | Purpose and effects |
| --- | --- | --- |
| `npm run docs:index` | recommended | Regenerates [[Documentation Index]] from note metadata. Do not edit that index manually. |
| `npm run docs:check` | recommended | Validates frontmatter, links, aliases, source paths, and index freshness. |
| `npm run docs:test` | recommended | Runs tests for the documentation tooling, including generated table link rendering. |

## Internal and Not Supported Scripts

| Script or command | Level | Status |
| --- | --- | --- |
| `scripts/dev-local.sh` | internal | Implementation behind `dev:local` and `dev:local:detached`; it bootstraps material and delegates to Compose. |
| `scripts/bootstrap-local-pki.mjs` | internal | Generates or reuses local CA, client certificates, CRLs, keystore material, and SDS inputs during bootstrap. |
| `scripts/generate-client-csr.mjs` | internal | Implementation behind `pki:client`. |
| `scripts/test-*.sh` and `scripts/test-platform.mjs` | internal | Implementation behind the root integration and platform test commands. Invoke the root command instead. |
| `scripts/assert-platform-test-isolation.mjs` | internal | Verifies the temporary E2E Compose configuration before services start. |
| `scripts/docs/*.mjs` | internal | Implementation behind `docs:index`, `docs:check`, and `docs:test`. |
| `scripts/seed-dev.sh` | not supported | Placeholder that prints `TODO`; it does not seed or start the platform. Use the database seed commands or `dev:local`. |

## Source Files

- `package.json`
- `packages/*/package.json`
- `scripts/dev-local.sh`
- `scripts/test-*.sh`
- `scripts/generate-client-csr.mjs`

## Related Notes

- [[How to Manage the Local Platform Lifecycle]]
- [[How to Start the Project]]
- [[How to Run Tests]]
- [[Reset Local Database]]
- [[How to Use Prisma Studio]]
- [[gatewayctl Reference]]
- [[How to Learn the Gateway with the Lab]]
