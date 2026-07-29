---
title: Debug Gateway 404
type: runbook
doc_status: current
implementation_status: implemented
last_verified: 2026-07-29
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
> Distinguish an unknown environment host (`421`) from an unknown proxy or endpoint (`404`) before changing deployment configuration.

## Symptoms

The gateway returns `421 Misdirected Request`, or `404` with either
`No proxy is configured for path` or `Endpoint not found in proxy`.

## Impact

The request never reaches the upstream service.

## Diagnosis

1. Call `GET /ready` and inspect `proxiesLoaded` and `environmentsLoaded`.
2. For `421`, compare the request `Host` with `Environment.publicOrigin`.
3. For an unknown proxy, verify an active deployment exists in the
   hostname-selected environment and check its boundary-safe `basePath`.
4. For an unknown endpoint, remove the proxy base path and compare the
   remaining suffix with explicit endpoint `path` values.
5. Check static/dynamic path spelling and named parameter positions.
6. Restart the gateway after any database change.

## Resolution

- Activate or seed the missing proxy deployment.
- Use the intended environment hostname or correct its `publicOrigin`.
- Add the explicit endpoint to the logical proxy.
- Correct the request path; arbitrary suffixes are intentionally rejected.

## Verification

Repeat the request and confirm the completion log includes `proxyId`,
`endpointId`, and `targetUrl`.

## Escalation

If resolution succeeds but the response becomes `502`, investigate the
deployment upstream rather than routing.
