---
title: API Gateway Platform
type: map
doc_status: current
implementation_status: partial
last_verified: 2026-07-27
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

- [[00-map/Project Map|Project Map]] - navigate by domain or task.
- [[00-map/Current Status|Current Status]] - see what is implemented, partial, or planned.
- [[00-map/Documentation Index|Documentation Index]] - browse every note and its metadata.
- [[04-guides/How to Start the Project|How to Start the Project]] - run the project locally.
- [[04-guides/How to Run Tests|How to Run Tests]] - execute workspace and documentation checks.
- [[04-guides/How to Document the Project|How to Document the Project]] - create and maintain notes.

## Main Areas

| Area | Purpose |
| --- | --- |
| [[01-concepts/What is an API Gateway|Concepts]] | Domain vocabulary and the Apigee model |
| [[02-architecture/Global Architecture|Architecture]] | Components, boundaries, data flows, and failure modes |
| [[03-packages/gateway-core|Packages]] | Ownership and public contracts for each workspace |
| [[04-guides/How to Start the Project|Guides]] | Reproducible development procedures |
| [[05-decisions/ADR-001 Longest Prefix Match|Decisions]] | Accepted architecture decisions |
| [[06-reference/Environment Variables|Reference]] | Exact values derived from code and configuration |
| [[07-runbooks/Debug Gateway 404|Runbooks]] | Operational diagnosis and recovery |

## Documentation Contract

Every content note starts with validated frontmatter and an `At a glance`
summary. Current behavior must cite repository sources. Planned behavior must be
labelled as planned and kept separate from implemented behavior.

Run `npm run docs:check` before committing documentation changes.
