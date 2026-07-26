---
title: Global Architecture
type: architecture
doc_status: current
implementation_status: partial
last_verified: 2026-07-27
tags:
  - type/architecture
  - area/project
sources:
  - package.json
  - packages/gateway-core/src/server.ts
  - packages/management-api/src/server.ts
  - packages/admin-panel/app
  - docker-compose.yml
aliases: []
---

# Global Architecture

> [!summary] At a glance
> The platform separates request processing in `gateway-core` from a partially built control plane, with PostgreSQL as configuration storage and Redis currently used for rate limiting.

## Context

The repository is an npm-workspaces monorepo. Its target architecture follows
the data-plane/control-plane split used by enterprise API gateways, but the two
planes have different implementation maturity.

## Components

```mermaid
flowchart LR
    CLIENT["API clients"] --> GATEWAY["gateway-core<br/>Data plane"]
    GATEWAY --> BACKEND["Backend services"]
    GATEWAY --> POSTGRES["PostgreSQL<br/>Configuration"]
    GATEWAY --> REDIS["Redis<br/>Rate-limit counters"]

    ADMIN["Administrator"] --> PANEL["admin-panel<br/>Partial scaffold"]
    PANEL -. "planned" .-> MANAGEMENT["management-api<br/>Health endpoint only"]
    MANAGEMENT -. "planned CRUD" .-> POSTGRES
    MANAGEMENT -. "planned invalidation" .-> REDIS

    PROMETHEUS["Prometheus container"] -. "metrics not exposed" .-> GATEWAY
    GRAFANA["Grafana container"] --> PROMETHEUS
```

## Current Data Flow

1. `gateway-core` validates its environment and loads active deployments from PostgreSQL.
2. The gateway builds an in-memory registry of proxies, endpoints, and validated policy configuration.
3. Incoming requests resolve against that registry.
4. Registered policies may allow, reject, rate-limit, or degrade the request.
5. Allowed requests are forwarded to the deployment-specific upstream.

The configuration is not reloaded while the process is running.

## Failure Modes

- Invalid environment or policy configuration prevents gateway startup.
- An unknown proxy or endpoint returns a gateway-generated `404`.
- An unreachable upstream returns `502`.
- Policy infrastructure failures follow each policy's `failureMode`.
- Multiple active deployments with the same `basePath` require an explicit `GATEWAY_ENVIRONMENT_ID`.

## Constraints

- `gateway-core` reads configuration but does not provide management CRUD.
- The Management API and Admin Panel are not usable control-plane products yet.
- Docker Compose starts infrastructure only; application services are still TODO entries.
- Local port defaults conflict and must be coordinated manually.

## Sources

See [[Runtime Request Flow]], [[Control Plane Flow]], [[Deployment Model]],
[[Observability]], and [[Current Status]] for focused views of the architecture.
