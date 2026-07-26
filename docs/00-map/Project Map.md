---
title: Project Map
type: map
doc_status: current
implementation_status: partial
last_verified: 2026-07-27
tags:
  - type/map
  - area/project
sources:
  - package.json
  - packages
aliases: []
---

# Project Map

> [!summary] At a glance
> Use this map to move from a development question to the smallest authoritative set of project notes.

## By Development Task

| Task | Start with | Continue with |
| --- | --- | --- |
| Understand the platform | [[Global Architecture]] | [[Data Plane vs Control Plane]] |
| Trace a gateway request | [[Runtime Request Flow]] | [[Routing Engine]], [[gateway-core]] |
| Change persistence | [[Data Model]] | [[Database Schema]], [[database]] |
| Add a proxy deployment | [[How to Add a New Proxy]] | [[Deployment Model]] |
| Work on policies | [[Policy Types]] | [[Policy Reference Index]], [[Debug Policy Failure]] |
| Configure client authentication | [[Authentication and Authorization]] | [[How to Configure Application Authentication]], [[Debug OAuth and mTLS]] |
| Work on the control plane | [[Control Plane Flow]] | [[Management API]], [[management-api]] |
| Run the project | [[How to Start the Project]] | [[Ports]], [[Environment Variables]] |
| Diagnose a failure | [[Debug Gateway 404]] | [[Debug Policy Failure]], [[Reset Local Database]] |

## Runtime Ownership

```mermaid
flowchart LR
    CLIENT["API client"] --> GATEWAY["gateway-core"]
    GATEWAY --> BACKEND["Backend service"]
    GATEWAY --> DATABASE["PostgreSQL"]
    GATEWAY --> REDIS["Redis"]
    CLIENT --> INGRESS["Trusted mTLS ingress"]
    INGRESS --> GATEWAY
    ADMIN["Admin browser"] --> PANEL["admin-panel scaffold"]
    PANEL -. "planned API calls" .-> MANAGEMENT["management-api scaffold"]
    MANAGEMENT --> DATABASE
```

Solid arrows represent current runtime interactions. Dashed arrows represent
planned control-plane behavior.

## Documentation Boundaries

- Concepts explain reusable domain ideas.
- Architecture explains system-wide design and interactions.
- Package notes explain code ownership and package contracts.
- Guides describe tasks.
- Reference pages state exact current values.
- ADRs explain why a durable decision was made.
- Runbooks begin from an operational symptom.

## Current Gaps

The control plane CRUD API, usable administration UI, configuration hot reload,
and Prometheus metrics are not implemented. See [[Current Status]] for the
verified feature matrix.
