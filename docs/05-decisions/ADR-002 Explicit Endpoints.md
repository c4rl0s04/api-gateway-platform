# ADR-002: Explicit Endpoints

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

Endpoints must be **explicitly configured** in the database. There is no catch-all or wildcard forwarding. Every path that the gateway should accept must have a corresponding `Endpoint` record.

### Auto-Sort Rules

Endpoints are automatically sorted to ensure deterministic matching:

1. **Static segments before dynamic** — `/accounts/summary` is checked before `/accounts/:id`
2. **Longer paths before shorter** — `/accounts/:id/details` is checked before `/accounts/:id`

This means administrators only need to define endpoints — they don't need to worry about ordering.

### Example

Given these endpoints for a proxy:

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

### ✅ Positive

- **Strict allowlist** — Only explicitly configured paths are forwarded. Acts as a security boundary
- **Deterministic** — Auto-sort eliminates ordering ambiguity
- **Auditable** — You can see exactly which paths are exposed by querying the database

### ⚠️ Constraints

- **Every path needs a DB entry** — Can be verbose for APIs with many endpoints
- **New paths require configuration** — Adding a backend endpoint isn't enough; it must also be registered in the gateway

---

## Related Pages

- [[Routing Engine]]
- [[gateway-core]]
