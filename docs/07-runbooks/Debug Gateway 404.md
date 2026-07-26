---
title: Debug Gateway 404
type: runbook
doc_status: current
implementation_status: implemented
last_verified: 2026-07-27
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
> The response message distinguishes an unknown proxy from an undeclared endpoint, which determines whether to inspect deployments or endpoint paths.

## Symptoms

The gateway returns `404` with either `No proxy is configured for path` or
`Endpoint not found in proxy`.

## Impact

The request never reaches the upstream service.

## Diagnosis

1. Call `GET /ready` and inspect `proxiesLoaded` and `environmentId`.
2. For an unknown proxy, verify the active proxy, active deployment, selected environment, and boundary-safe `basePath`.
3. For an unknown endpoint, remove the proxy base path and compare the remaining suffix with explicit endpoint `path` values.
4. Check static/dynamic path spelling and named parameter positions.
5. Restart the gateway after any database change.

## Resolution

- Activate or seed the missing proxy deployment.
- Select the correct `GATEWAY_ENVIRONMENT_ID`.
- Add the explicit endpoint to the logical proxy.
- Correct the request path; arbitrary suffixes are intentionally rejected.

## Verification

Repeat the request and confirm the completion log includes `proxyId`,
`endpointId`, and `targetUrl`.

## Escalation

If resolution succeeds but the response becomes `502`, investigate the
deployment upstream rather than routing.
