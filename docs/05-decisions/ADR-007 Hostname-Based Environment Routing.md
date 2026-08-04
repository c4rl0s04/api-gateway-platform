---
title: "ADR-007 Hostname-Based Environment Routing"
type: decision
doc_status: current
implementation_status: implemented
decision_status: accepted
last_verified: "2026-07-29"
tags:
  - type/decision
  - area/gateway-core
sources:
  - packages/database/prisma/schema.prisma
  - packages/gateway-core/src/proxy/resolver.ts
  - packages/gateway-core/src/server.ts
  - scripts/bootstrap-local-pki.mjs
aliases: []
---

# ADR-007 Hostname-Based Environment Routing

> [!summary] At a glance
> One gateway process loads every active deployment and selects the request environment from its configured HTTPS hostname before resolving the proxy path.

## Context

Selecting one environment through a process variable prevented one local
platform instance from serving the complete deployment catalog. A global
path-only registry also could not distinguish deployments that intentionally
share a proxy path across `qual`, `pprod`, and `prod`.

## Decision

- Persist one unique HTTPS `publicOrigin` on every `Environment`.
- Load all active deployments by default; use
  `GATEWAY_ENVIRONMENT_ALLOWLIST` only to restrict a runtime intentionally.
- Index the in-memory registry by environment ID and then by proxy base path.
- Resolve the request `Host` to an environment before path matching.
- Return `421 Misdirected Request` for an unknown environment authority.
- Derive OAuth issuer and token-endpoint audience from the selected
  environment origin.
- Keep access tokens and rate-limit counters isolated by environment.
- Give the local Envoy certificate SANs for all 30 closed stage/region hosts.

## Alternatives

- One gateway process per environment: valid for a future production topology,
  but it prevents the requested all-in-one local platform view.
- Add environment and country to every path: rejected because deployment
  identity belongs in the origin and would leak infrastructure concerns into
  every API contract.
- Select an environment with a request header: rejected because callers could
  spoof routing context and URLs would not identify their deployment.
- Use a fallback environment for unknown hosts: rejected because ambiguous
  requests must not reach a backend accidentally.

## Consequences

Every environment requires a unique DNS name and matching TLS identity. The
same logical proxy path can be deployed with different upstreams while OAuth
tokens remain valid only for the issuing origin. Operational endpoints remain
host-independent. Routing changes propagate through the durable outbox and
atomic registry reload described in [[Hot Reload Sync]].

## Related Implementation

- [[Routing Engine]]
- [[Deployment Model]]
- [[Environment Variables]]
- [[Debug Gateway 404]]
