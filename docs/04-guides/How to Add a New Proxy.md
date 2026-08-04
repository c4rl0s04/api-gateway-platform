---
title: How to Add a New Proxy
type: guide
doc_status: current
implementation_status: implemented
last_verified: 2026-08-02
tags:
  - type/guide
  - area/database
sources:
  - packages/management-api/src/routes/proxy-revisions.routes.ts
  - packages/database/src/proxy-revisions.ts
  - packages/database/src/proxy-deployments.ts
aliases:
  - How to Add and Deploy a Proxy
---

# How to Add a New Proxy

> [!summary] At a glance
> Create the logical proxy through Management API, import an immutable OpenAPI and Gateway YAML bundle, and then deploy that exact revision.

## Goal

Create a logical proxy, version its operations and policies, and activate a
revision in an environment without bypassing validation or promotion rules.

## Prerequisites

- The local platform is running.
- The caller has an OIDC token and `platformAdmin` or matching
  `organizationAdmin` membership.
- The organization and destination environment exist.
- An OpenAPI 3.0/3.1 document and Gateway YAML are ready.

## Steps

1. Create the logical identity with
   `POST /v1/organizations/:organizationId/proxies`.
2. Import `openapi` and `gateway` as multipart files with
   `POST /v1/proxies/:proxyId/revisions`.
3. Review the returned revision number, hash, operations, and effective
   policies.
4. Deploy it with
   `POST /v1/proxies/:proxyId/revisions/:revisionNumber/deployments`.
5. Poll `GET /v1/runtime-sync` until the deployment's returned version is
   applied by the intended gateway.
6. Promote the same revision through `qual`, `pprod`, and `prod` for the same
   region.

The complete request bodies and bundle format are in
[[How to Import and Deploy a Proxy Revision]]. Seeds are reserved for the
reproducible local baseline and are not the normal configuration interface.

## Verification

- `GET /ready` reports the expected active deployment count after sync.
- A declared method and operation reaches the expected upstream.
- An undeclared path returns `404`; a known path with a different method returns
  `405` and an `Allow` header.

## Troubleshooting or Rollback

If promotion is rejected, confirm that the exact revision was deployed in the
preceding stage for the same region. A failed import or deployment does not
change the active revision. Roll back by deploying an older revision number;
this creates another deployment history record and is applied by hot reload.

## Related Notes

- [[Data Model]]
- [[Deployment Model]]
- [[How to Import and Deploy a Proxy Revision]]
- [[Reset Local Database]]
