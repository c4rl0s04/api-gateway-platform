---
title: API Gateway Platform
type: map
doc_status: current
implementation_status: partial
last_verified: 2026-08-02
tags:
  - type/map
  - area/project
sources:
  - package.json
  - docker-compose.yml
aliases:
  - Documentation Home
---

# API Gateway Platform

> [!summary] At a glance
> This vault is the entry point for understanding, running, changing, and troubleshooting the API Gateway Platform.

The project is a TypeScript monorepo for a lightweight API gateway inspired by
Google Apigee. It separates real-time request processing in the data plane from
configuration management in the control plane.

## Start Here

- [[00-map/Project Map|Project Map]] - choose a domain or development task.
- [[00-map/Current Status|Current Status]] - see what is implemented, partial, or planned.
- [[00-map/Documentation Index|Documentation Index]] - use the complete metadata inventory when you already know the note type or title.
- [[04-guides/How to Start the Project|How to Start the Project]] - run the project locally.
- [[04-guides/How to Run Tests|How to Run Tests]] - execute workspace and documentation checks.
- [[04-guides/How to Document the Project|How to Document the Project]] - create and maintain notes.

## Main Areas

| Area | Purpose |
| --- | --- |
| [[Data Plane]] | Request routing, policies, local responses, and forwarding |
| [[Control Plane]] | Management API, proxy lifecycle, products, apps, and runtime sync |
| [[Security and Identity]] | API keys, OAuth, mTLS, PKI, Keycloak, and administrator identity |
| [[Operations]] | Startup, configuration, ports, health, synchronization, and recovery |
| [[Development]] | Packages, persistence, implementation workflows, tests, and seeds |
| [[Decision Records]] | Architectural rationale grouped by domain |

The numbered folders continue to separate concepts, architecture, packages,
guides, decisions, reference, and runbooks. The maps above are the primary
navigation layer; [[Documentation Index]] remains the exhaustive inventory.

## Documentation Contract

Every content note starts with validated frontmatter and an `At a glance`
summary. Current behavior must cite repository sources. Planned behavior must be
labelled as planned and kept separate from implemented behavior.

Run `npm run docs:check` before committing documentation changes.
