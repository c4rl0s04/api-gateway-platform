---
title: "ADR-002: Explicit Endpoints"
type: decision
doc_status: current
implementation_status: implemented
decision_status: accepted
last_verified: 2026-07-31
tags:
  - type/decision
  - area/gateway-core
sources:
  - packages/gateway-core/src/proxy/resolver.ts
  - packages/database/prisma/schema.prisma
aliases: []
---
# ADR-002: Explicit Endpoints

> [!summary] At a glance
> A matched proxy forwards only requests that match an explicit OpenAPI operation in its active immutable revision.

| Field | Value |
| ----- | ----- |
| **Status** | ✅ Accepted |
| **Date** | 2026-07-06 |
| **Category** | Routing |

---

## Context

After a proxy is selected via [[ADR-001 Longest Prefix Match]], the remaining **path suffix** must be matched to a specific endpoint within that proxy. For example, if the proxy has `basePath = /es/banking/v1` and the request is `GET /es/banking/v1/accounts/42`, the suffix is `/accounts/42`.

The question: should the proxy forward **any** suffix to the backend, or should only **explicitly configured** paths be allowed?

---

## Decision

Operations must be **explicitly declared** in the imported OpenAPI document.
There is no catch-all or wildcard forwarding. Every path and HTTP method that
the gateway should accept must have a corresponding `ProxyOperation` in the
active `ApiProxyRevision`.

### Auto-Sort Rules

Operation paths are automatically sorted to ensure deterministic matching:

1. **Static segments before dynamic** — `/accounts/summary` is checked before `/accounts/:id`
2. **Longer paths before shorter** — `/accounts/:id/details` is checked before `/accounts/:id`

This means administrators define OpenAPI operations without assigning routing
priorities manually.

### Example

Given these operations for a proxy revision:

```
/accounts/:id/details   ← longest, checked first
/accounts/summary        ← static, checked before :id
/accounts/:id            ← dynamic, checked last
/accounts                ← shortest, checked last
```

| Request suffix | Matched endpoint |
| -------------- | ---------------- |
| `/accounts/summary` | `/accounts/summary` (static wins) |
| `/accounts/42` | `/accounts/:id` |
| `/accounts/42/details` | `/accounts/:id/details` |
| `/accounts` | `/accounts` |
| `/transfers` | ❌ 404 — not configured |

If `/accounts/42` exists only for `GET`, a `POST` to that path returns `405`
with `Allow: GET`.

---

## Alternatives Considered

### Default Target URL (catch-all)

Forward any unmatched suffix to the backend's target URL.

❌ **Rejected** — Security risk. Exposes the entire backend API surface through the gateway without explicit control. Defeats the purpose of having an API gateway as a security boundary.

### Manual Ordering

Require administrators to manually set the priority order of endpoints.

❌ **Rejected** — Error-prone. Humans easily make mistakes with ordering. The auto-sort algorithm handles this correctly every time.

---

## Consequences

### Positive

- **Strict allowlist** — Only explicitly configured paths are forwarded. Acts as a security boundary
- **Deterministic** — Auto-sort eliminates ordering ambiguity
- **Auditable** — You can see exactly which paths are exposed by querying the database

### Constraints

- **Every path and method needs an OpenAPI operation** — Large APIs produce many operation records during import
- **New paths require a revision** — Adding a backend endpoint is not enough; a new immutable bundle must be imported and deployed

---

## Related Pages

- [[Routing Engine]]
- [[gateway-core]]
