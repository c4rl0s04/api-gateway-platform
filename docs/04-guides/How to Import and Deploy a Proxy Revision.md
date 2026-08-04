---
title: How to Import and Deploy a Proxy Revision
type: guide
doc_status: current
implementation_status: implemented
last_verified: 2026-08-02
tags:
  - type/guide
  - area/management-api
  - area/database
sources:
  - packages/management-api/src/routes/proxy-revisions.routes.ts
  - packages/database/src/proxy-revisions.ts
  - packages/database/src/proxy-deployments.ts
  - packages/gateway-core/src/runtime-sync/reloader.ts
aliases:
  - Deploy a Proxy Revision
  - Roll Back a Proxy Revision
---

# How to Import and Deploy a Proxy Revision

> [!summary] At a glance
> Create a logical proxy, import an immutable OpenAPI and gateway configuration bundle, activate it through `qual -> pprod -> prod`, and roll back by deploying an earlier revision.

## Goal

Produce a validated proxy revision and one active environment deployment without
editing generated rows directly through Prisma.

## Prerequisites

- An OIDC identity with `platformAdmin` or matching `organizationAdmin` role.
- An existing organization and closed environment ID.
- An OpenAPI 3.0/3.1 file with a unique `operationId` on every operation.
- A `gateway.platform/v1` YAML file that references operations by
  `operationId`.
- A Management API client inside the Compose network or an authenticated Admin
  Panel BFF session.

## Steps

1. Create the logical proxy:

```http
POST /v1/organizations/{organizationId}/proxies
Content-Type: application/json

{"name":"Accounts API"}
```

2. Import both files in one multipart request:

```bash
curl -X POST "$MANAGEMENT_API_URL/v1/proxies/$PROXY_ID/revisions" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F "openapi=@openapi.yaml" \
  -F "gateway=@gateway.yaml"
```

The response includes `revisionNumber`, `contentHash`, compiled operations,
effective policies, and non-blocking warnings. Reimporting changed files creates
the next revision; existing revisions remain unchanged.

3. Activate revision 1 in qual:

```http
POST /v1/proxies/{proxyId}/revisions/1/deployments
Content-Type: application/json

{
  "environmentId": "env-qual-es",
  "upstreamBaseUrl": "https://accounts-qual.example.com"
}
```

4. Record `runtimeSync.version` and poll `GET /v1/runtime-sync` until the
   intended gateway reports that version as applied.
5. Promote the same revision to `env-pprod-es` and then `env-prod-es`, supplying
   each environment's upstream.
6. Inspect revision and deployment history through the corresponding GET
   routes.

## Verification

- The revisions list contains the imported revision and content hash.
- Exactly one deployment for the proxy/environment has status `active`.
- Older deployment records have status `retired`.
- After runtime synchronization, the configured method and path reach the
  selected upstream without restarting the process.
- A known path with the wrong method returns `405` and `Allow`.

## Troubleshooting or Rollback

`invalid_openapi`, `invalid_gateway_config`, `unknown_operation`, and
`policy_not_supported` indicate an import error; no partial revision was
created. `promotion_required` means the exact revision is missing from the
previous stage in the same region. `deployment_conflict` means another active
proxy owns the base path in that environment.

To roll back, submit the deployment request again using an earlier revision
number. The current row becomes `retired`, a new active deployment is created,
and the returned version is applied automatically. Do not edit deployment
status manually.
