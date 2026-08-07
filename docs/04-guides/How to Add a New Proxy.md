---
title: How to Add a New Proxy
type: guide
doc_status: current
implementation_status: implemented
last_verified: 2026-08-07
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
> Create a fully configured logical proxy and immutable revision 1 atomically, then deliberately deploy that exact revision.

## Goal

Create a logical proxy, version its operations and policies, and activate a
revision in an environment without bypassing validation or promotion rules.

## Prerequisites

- The local platform is running.
- The caller has an OIDC token and `platformAdmin` or matching
  `organizationAdmin` membership.
- The organization and destination environment exist.
- An OpenAPI 3.0/3.1 document is ready. Gateway YAML is optional when using the
  portal and required when calling configured creation directly.

## Steps

1. In the portal, open **Proxies → Create proxy** and complete Identity, API
   definition, Routing & policies, and Review. The draft remains in React
   memory only until the final command.
2. For an API workflow, optionally inspect OpenAPI or validate a complete
   bundle with `POST
   /v1/organizations/:organizationId/proxy-configurations/validate`. Send
   `openapi` and optional `gateway` multipart files.
3. Create the configured proxy with `POST
   /v1/organizations/:organizationId/proxies/configured`. Send the text field
   `name` plus `openapi` and `gateway` files. A successful response contains the
   proxy and immutable revision 1; a failure creates neither resource.
4. Review the returned revision number, hash, operations, effective policies,
   and warnings. No environment is deployed yet.
5. Deploy it to QUAL with
   `POST /v1/proxies/:proxyId/revisions/:revisionNumber/deployments`.
6. Poll `GET /v1/runtime-sync` until the deployment's returned version is
   applied by the intended gateway.
7. Promote the same revision through `qual`, `pprod`, and `prod` for the same
   region.

The complete request bodies and bundle format are in
[[How to Import and Deploy a Proxy Revision]]. Seeds are reserved for the
reproducible local baseline and are not the normal configuration interface.
The older name-only proxy endpoint and separate revision-import endpoint remain
available to compatible clients but are no longer used by the portal's creation
flow.

## Verification

- `GET /ready` reports the expected active deployment count after sync.
- A declared method and operation reaches the expected upstream.
- An undeclared path returns `404`; a known path with a different method returns
  `405` and an `Allow` header.

## Troubleshooting or Rollback

If validation fails, correct the step identified by the returned error; the
portal preserves the in-memory draft for retry. If promotion is rejected,
confirm that the exact revision was deployed in the preceding stage for the
same region. A failed configured creation, import, or deployment does not
change the active revision. Roll back by deploying an older revision number;
this creates another deployment history record and is applied by hot reload.

## Related Notes

- [[Data Model]]
- [[Deployment Model]]
- [[How to Import and Deploy a Proxy Revision]]
- [[Reset Local Database]]
