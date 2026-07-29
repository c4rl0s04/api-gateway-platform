---
title: Routing Engine
type: architecture
doc_status: current
implementation_status: implemented
last_verified: 2026-07-29
tags:
  - type/architecture
  - area/gateway-core
sources:
  - packages/gateway-core/src/proxy/resolver.ts
  - packages/gateway-core/src/proxy/forwarder.ts
aliases: []
---

# Routing Engine

> [!summary] At a glance
> The routing engine resolves the request hostname to one environment, selects the longest matching proxy prefix inside it, resolves one explicit endpoint, and builds its deployment-specific upstream URL.

## Context

Routing is intentionally deterministic and acts as an allowlist. A matching
proxy does not authorize arbitrary backend paths.

## Components

### Proxy Selection

The registry is grouped by `environmentId`. `resolveEnvironment()` maps the
request `Host` authority to the unique `Environment.publicOrigin`; then
`resolveProxy(environmentId, path)` chooses the active proxy with the longest
`basePath` that matches either the complete path or a slash boundary.

```text
Request: /es/banking/v1/accounts/42

/es
/es/banking
/es/banking/v1  <- selected
```

### Endpoint Selection

The request suffix is matched against explicit endpoint paths. Static endpoints
sort before dynamic endpoints, then longer patterns sort before shorter ones.
Dynamic `:parameters` match one path segment and are extracted for forwarding.

### Target Construction

The resolved endpoint `targetPath` is combined with the deployment
`upstreamBaseUrl`. Dynamic values and incoming query parameters are preserved.

```text
upstreamBaseUrl: http://localhost:4000
targetPath:      /accounts/:id
parameter:       id=42
final URL:       http://localhost:4000/accounts/42
```

## Data Flow

```mermaid
flowchart LR
    HOST["Request Host"] --> ENV["Environment public origin"]
    ENV --> PATH["Environment registry"]
    PATH --> PROXY["Longest proxy prefix"]
    PROXY --> SUFFIX["Remove base path"]
    SUFFIX --> ENDPOINT["Explicit endpoint match"]
    ENDPOINT --> PARAMS["Extract parameters"]
    PARAMS --> TARGET["Build upstream URL"]
```

## Failure Modes

- Unknown environment host: `421 Misdirected Request`.
- No proxy: `404` with `No proxy is configured for path`.
- Proxy but no endpoint: `404` with `Endpoint not found in proxy`.
- Upstream connection failure: `502 Bad Gateway`.
- Duplicate active base paths inside one environment: startup failure.

## Constraints

Logical base paths are globally unique in Prisma, while one logical proxy can
have deployments in many environments. Endpoint patterns support named path
segments but not wildcards, optional segments, or method-specific matching.

## Sources

See [[ADR-001 Longest Prefix Match]], [[ADR-002 Explicit Endpoints]],
[[Runtime Request Flow]], [[ADR-007 Hostname-Based Environment Routing]], and
[[Debug Gateway 404]].
