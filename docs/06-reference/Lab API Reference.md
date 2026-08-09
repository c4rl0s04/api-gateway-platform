---
title: Lab API Reference
type: reference
doc_status: current
implementation_status: implemented
last_verified: 2026-08-09
tags:
  - type/reference
  - area/management-api
  - area/developer-platform
sources:
  - packages/management-api/src/routes/lab-workspaces.routes.ts
  - packages/management-api/src/routes/lab-proxies.routes.ts
  - packages/management-api/src/routes/lab-products.routes.ts
  - packages/management-api/src/routes/lab-applications.routes.ts
  - packages/management-api/src/routes/lab-certificates.routes.ts
  - packages/management-api/src/routes/lab-upstreams.routes.ts
  - packages/management-api/src/routes/lab-audit.routes.ts
aliases:
  - Personal Lab API
---

# Lab API Reference

> [!summary] At a glance
> Complete OIDC-owned API for creating and operating a personal gateway lab. Call it through the Admin Panel BFF at `/api/lab/*`; the internal service contract is `/lab/v1/*`.

## Current Support

Management API is not published to the host. Browser and Postman callers use:

```text
http://localhost:8080/api/lab/<route>
```

The BFF maps that route to:

```text
http://management-api:3002/lab/v1/<route>
```

Send either the Admin Panel HttpOnly session cookie or an explicit OIDC Bearer
token. Every route derives `ownerIssuer` and `ownerSubject` from the validated
token. Client-supplied `organizationId` and `workspaceId` are neither required
nor accepted.

## Authoritative Values

### Workspace

| Method and BFF route | Purpose |
| --- | --- |
| `POST /api/lab/workspace` | Return the active workspace or provision a new 24-hour workspace and runnable sample. `201` means created; `200` means reused. |
| `GET /api/lab/workspace` | Return workspace, sample, inventory, and remaining lifetime. |
| `POST /api/lab/workspace/reset` | Revoke current lab resources, preserve audit history, and create a clean sample in the same workspace boundary. |
| `POST /api/lab/workspace/revoke` | Revoke credentials and certificates, retire routes, and make the workspace terminal. |

### Proxies, revisions, and deployments

| Method and BFF route | Body |
| --- | --- |
| `GET/POST /api/lab/proxies` | List, or create with `{ "name": "..." }`. |
| `GET/PATCH /api/lab/proxies/:proxyId` | Read, or update `name` and/or `active`. |
| `POST /api/lab/proxy-configurations/validate` | Multipart `openapi` and optional `gateway`; validates without persistence. |
| `POST /api/lab/proxies/configured` | Multipart `name`, `openapi`, and `gateway`; creates proxy plus revision 1 atomically. |
| `GET/POST /api/lab/proxies/:proxyId/revisions` | List immutable revisions, or import multipart `openapi` + `gateway`. |
| `GET /api/lab/proxies/:proxyId/revisions/:revisionNumber` | Read normalized revision details. |
| `GET /api/lab/proxies/:proxyId/deployments` | List active and retired workspace deployments. |
| `POST /api/lab/proxies/:proxyId/revisions/:revisionNumber/deployments` | `{ "environmentId": "...", "upstreamId": "..." }`; qual environments only. |
| `POST /api/lab/deployments/:deploymentId/retire` | Retire the active deployment and enqueue hot reload. |

Deployment responses include `runtimeRefreshRequired: false` and a queued
`runtimeSync.version`. Routing becomes available when the gateway applies that
outbox version.

### Products and environments

| Method and BFF route | Body |
| --- | --- |
| `GET /api/lab/environments` | List the fixed qual environments selectable by the lab. |
| `GET/POST /api/lab/products` | List, or create with `name`, `scopes`, `proxyIds`, optional `environmentIds`, and optional `active`. |
| `GET/PATCH /api/lab/products/:productId` | Read, or replace product metadata, scopes, proxy allowlist, environment allowlist, and active state. |

An empty `environmentIds` list allows every lab-supported qual environment.
Removing product scopes trims credential grants transactionally.

### Applications, credentials, grants, and keys

| Method and BFF route | Purpose |
| --- | --- |
| `GET/POST /api/lab/apps` | List apps, or create an app plus first approved lab credential from explicit product grants. |
| `GET/PATCH /api/lab/apps/:appId` | Read or update app name/status within closed lifecycle transitions. |
| `POST /api/lab/apps/:appId/credentials` | Create an additional explicit or cloned lab credential. Consumer secret is returned once. |
| `GET/PATCH /api/lab/credentials/:credentialId` | Read public detail or update consumer key, status, and expiry. |
| `POST /api/lab/credentials/:credentialId/rotate-secret` | Replace the scrypt hash and return the new secret once. |
| `PUT /api/lab/credentials/:credentialId/grants` | Replace desired product grants without deleting history. |
| `GET/POST /api/lab/credentials/:credentialId/public-keys` | List public JWKs or register RSA 2048+ RS256 JWK material. |
| `POST /api/lab/public-keys/:publicKeyId/revoke` | Revoke a registered JWK. |

Lab-created credentials always have `purpose = lab`. Neither secrets nor
private keys can be read later.

### Certificates and upstreams

| Method and BFF route | Purpose |
| --- | --- |
| `GET /api/lab/certificates` | List public certificate metadata for this workspace. |
| `POST /api/lab/credentials/:credentialId/certificates` | Issue a one-day client certificate from a CSR. |
| `GET /api/lab/certificates/:certificateId/download` | Download certificate and public chain. |
| `POST /api/lab/certificates/:certificateId/revoke` | Revoke the certificate and publish updated trust material. |
| `GET/POST /api/lab/upstreams` | List or create managed mocks and restricted public HTTPS targets. |
| `PATCH /api/lab/upstreams/:upstreamId` | Update name, active state, and kind-compatible configuration. |

Mock creation accepts 1-100 routes with method, path, status, optional safe
headers, body, and 0-5000 ms latency. Public upstream creation uses
`{ "name": "...", "kind": "publicHttps", "targetUrl": "https://..." }`.

### Audit

`GET /api/lab/audit-events?limit=50&action=<value>&resourceType=<value>` returns
only events owned by the active workspace. `limit` defaults to 50 and is capped
at 200.

### Stable errors

| Error | Meaning |
| --- | --- |
| `lab_expired` | Workspace lifetime ended or it was revoked. |
| `lab_limit_reached` | Three workspace creations were already made in 24 hours. |
| `lab_resource_not_found` | Resource is absent, outside this workspace, or intentionally hidden. |
| `lab_upstream_blocked` | Target, redirect, resolved address, port, or protocol violates egress policy. |
| `local_agent_required` | The requested client-key operation must run through `gatewayctl`. |
| `invalid_request` | Body, multipart fields, query, or route parameters failed schema validation. |

## Examples

```bash
curl http://localhost:8080/api/lab/workspace \
  --header "Authorization: Bearer $ACCESS_TOKEN"

curl --request POST http://localhost:8080/api/lab/upstreams \
  --header "Authorization: Bearer $ACCESS_TOKEN" \
  --header 'Content-Type: application/json' \
  --data '{"name":"Example","kind":"mock","routes":[{"method":"GET","path":"/example","status":200,"body":{"ok":true}}]}'
```

## Source Files

- `packages/management-api/src/routes/lab-*.routes.ts`
- `packages/management-api/src/services/lab-*.ts`
- `packages/database/src/lab-workspaces.ts`
- `packages/database/src/lab-upstreams.ts`

See [[Personal Gateway Lab]], [[How to Learn the Gateway with the Lab]], and [[Debug Lab Isolation and Egress]].

