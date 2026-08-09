---
title: ADR-009 Logical Lab Workspace Isolation
type: decision
doc_status: current
implementation_status: implemented
decision_status: accepted
last_verified: 2026-08-09
tags:
  - type/decision
  - area/developer-platform
  - area/security
sources:
  - packages/database/prisma/schema.prisma
  - packages/database/src/lab-workspaces.ts
  - packages/database/src/proxy-deployments.ts
  - packages/gateway-core/src/db/proxy-loader.ts
  - packages/lab-egress/src/security.ts
aliases: []
---

# ADR-009 Logical Lab Workspace Isolation

> [!summary] At a glance
> Isolate personal labs by OIDC-owned database scope, deployment workspace, hostname, credential binding, and guarded egress while sharing the platform runtime.

## Context

Users need to create and mutate realistic gateway resources without affecting
shared configuration. A container stack per user provides strong infrastructure
isolation but has high startup, memory, cleanup, observability, and operational
cost. A browser-only simulator is cheap but would not test the actual gateway,
policy, database, Redis, PKI, and hot-reload behavior.

## Decision

Use one shared platform runtime with explicit `LabWorkspace` ownership:

- OIDC `issuer + subject` selects one active 24-hour workspace.
- A hidden `Organization(kind = lab)` owns its domain resources.
- Each deployment carries `labWorkspaceId` and conflicts only inside that scope.
- Each workspace has a unique `*.lab.gateway.*` hostname.
- Gateway routing loads only that workspace's deployments plus managed OAuth.
- Credentials and access tokens are workspace-bound.
- Lab API ignores caller-supplied organization/workspace ownership and resolves
  it from OIDC.
- External traffic passes through a dedicated SSRF-resistant `lab-egress`.
- Expiry and revocation remove routes through the existing durable outbox and
  hot reload.

## Alternatives

- **One Compose/Kubernetes stack per user:** deferred because it materially
  increases provisioning time and infrastructure cost for the current learning
  use case.
- **Shared organization with naming prefixes:** rejected because names are not
  an enforceable authorization or routing boundary.
- **Frontend-only mock sandbox:** rejected because it cannot validate real
  policies, revisions, OAuth, mTLS, or runtime reload.
- **Allow arbitrary upstream URLs directly in gateway deployments:** rejected
  because it creates SSRF, redirect, DNS-rebinding, and internal-header risks.
- **Permanent workspaces:** rejected to limit stale credentials, routes, and
  resource consumption.

## Consequences

- Isolation depends on every domain query, runtime lookup, and authorization
  path carrying workspace context; cross-workspace integration tests are
  mandatory.
- Shared database and processes are not a hard multi-tenant compute boundary.
- Users obtain fast provisioning and the actual gateway behavior.
- Identical base paths are valid across workspaces.
- Expiration leaves audit history while revoking active identity and routing
  resources.
- Stronger future workloads may require dedicated runtime isolation without
  changing the user-facing Lab API contract.

## Related Implementation

- [[Personal Gateway Lab]]
- [[Lab API Reference]]
- [[How to Learn the Gateway with the Lab]]
- [[Debug Lab Isolation and Egress]]

