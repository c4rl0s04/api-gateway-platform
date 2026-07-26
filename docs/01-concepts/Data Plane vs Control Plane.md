---
title: Data Plane vs Control Plane
type: concept
doc_status: current
implementation_status: partial
last_verified: 2026-07-27
tags:
  - type/concept
  - area/project
sources:
  - packages/gateway-core/src/server.ts
  - packages/management-api/src/server.ts
  - packages/admin-panel/app
aliases: []
---

# Data Plane vs Control Plane

> [!summary] At a glance
> The data plane handles live API traffic, while the partially built control plane is intended to manage configuration.

## Definition

The data plane is the latency-sensitive path followed by API requests. The
control plane is the administrative path used to create, validate, and deploy
the configuration consumed by the data plane.

## Why It Matters

Separating the planes allows request processing to remain independent from the
availability and scaling profile of administration tools.

| Plane | Package | Current responsibility | Maturity |
| --- | --- | --- | --- |
| Data | `gateway-core` | Load configuration, route, execute policies, forward | Implemented |
| Control API | `management-api` | Health endpoint; CRUD is intended | Partial |
| Control UI | `admin-panel` | Placeholder Next.js pages | Partial |

## Project Mapping

```mermaid
flowchart LR
    CLIENT["API client"] --> DATA["gateway-core"]
    DATA --> BACKEND["Backend"]
    DATA --> DATABASE["PostgreSQL snapshot source"]
    DATA --> REDIS["Redis rate limiting"]

    ADMIN["Administrator"] -. "planned" .-> PANEL["admin-panel"]
    PANEL -. "planned" .-> CONTROL["management-api"]
    CONTROL -. "planned writes" .-> DATABASE
```

The gateway does not query PostgreSQL per request, but it does depend on the
database during startup. Runtime configuration changes require a restart
because synchronization between the planes is not implemented.

## Related Notes

- [[Global Architecture]]
- [[Control Plane Flow]]
- [[Hot Reload Sync]]
- [[gateway-core]]
