---
title: Debug Gateway 404
type: runbook
doc_status: current
implementation_status: implemented
last_verified: 2026-07-31
tags:
  - type/runbook
  - area/gateway-core
sources:
  - packages/gateway-core/src/server.ts
  - packages/gateway-core/src/proxy/resolver.ts
  - packages/gateway-core/src/db/proxy-loader.ts
aliases: []
---

# Debug Gateway 404

> [!summary] At a glance
> Distinguish an unknown environment host (`421`) from an unknown proxy or operation (`404`) and a wrong method (`405`) before changing deployment configuration.

## Symptoms

The gateway returns `421 Misdirected Request`, `404` with either
`No proxy is configured for path` or `Endpoint not found in proxy`, or `405`
with an `Allow` header.

## Impact

The request never reaches the upstream service.

## Diagnosis

1. Call `GET /ready` and inspect `proxiesLoaded` and `environmentsLoaded`.
2. For `421`, compare the request `Host` with `Environment.publicOrigin`.
3. For an unknown proxy, verify an active deployment exists in the
   hostname-selected environment and check its boundary-safe `basePath`.
4. For an unknown operation, inspect the active revision, remove its base path,
   and compare the remaining suffix with `ProxyOperation.path` values.
5. For `405`, compare the request method with the operation methods listed in
   `Allow`.
6. Check static/dynamic path spelling and `{parameter}` positions.
7. Restart the gateway after a deployment change.

## Resolution

- Deploy the required revision in the selected environment.
- Use the intended environment hostname or correct its `publicOrigin`.
- Import a new revision containing the missing OpenAPI operation.
- Correct the request path; arbitrary suffixes are intentionally rejected.

## Verification

Repeat the request and confirm the completion log includes `proxyId`, the
resolved operation record as `endpointId`, and `targetUrl`.

## Escalation

If resolution succeeds but the response becomes `502`, investigate the
deployment upstream rather than routing.
