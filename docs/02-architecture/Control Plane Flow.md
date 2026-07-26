---
title: Control Plane Flow
type: architecture
doc_status: current
implementation_status: planned
last_verified: 2026-07-27
tags:
  - type/architecture
  - area/management-api
sources:
  - packages/management-api/src/server.ts
  - packages/management-api/src/routes
  - packages/admin-panel/app
aliases: []
---

# Control Plane Flow

> [!summary] At a glance
> The intended control plane manages gateway configuration, but today it consists only of scaffolds and a Management API health endpoint.

## Context

The target control plane combines `admin-panel` and `management-api`. Its design
must not be confused with current functionality.

## Components

```mermaid
flowchart LR
    ADMIN["Administrator"] -. "planned UI" .-> PANEL["admin-panel"]
    PANEL -. "planned REST calls" .-> API["management-api"]
    API -. "planned validated writes" .-> DATABASE["PostgreSQL"]
    API -. "planned invalidation event" .-> REDIS["Redis"]
    REDIS -. "planned reload" .-> GATEWAY["gateway-core"]
```

## Data Flow

The planned flow validates commands against shared contracts, performs
transactional database writes, and only then publishes configuration
invalidation. The gateway would reload a complete validated snapshot.

## Failure Modes

- Publishing before a committed database write could reload incomplete state.
- Direct Prisma writes could bypass deployment progression invariants.
- A reload event without snapshot validation could make the data plane unavailable.
- Authentication and authorization for administrative operations are not implemented.

## Constraints

Current CRUD route files contain stubs. `admin-panel` pages contain placeholder
headings. Redis hot reload remains a design only.

## Sources

See [[Management API]], [[management-api]], [[admin-panel]], and
[[Hot Reload Sync]].
