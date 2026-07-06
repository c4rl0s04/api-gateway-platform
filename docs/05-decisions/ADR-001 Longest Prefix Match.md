# ADR-001: Longest Prefix Match

| Field | Value |
| ----- | ----- |
| **Status** | ✅ Accepted |
| **Date** | 2026-07-06 |
| **Category** | Routing |

---

## Context

The API Gateway supports multiple API proxies, each identified by a `basePath` prefix (e.g., `/es/banking/v1`, `/es/banking/v2`, `/es/insurance/v1`). When an incoming request arrives, the gateway must decide **which proxy** should handle it.

The problem arises when multiple proxies have overlapping prefixes:

```
Proxy A:  basePath = /es
Proxy B:  basePath = /es/banking
Proxy C:  basePath = /es/banking/v1
```

For a request to `/es/banking/v1/accounts`, all three proxies match. Which one should be selected?

---

## Decision

Use **Longest Prefix Match** — the proxy whose `basePath` is the longest string that matches the beginning of the request URL.

In the example above:
- `/es` → matches (length 3)
- `/es/banking` → matches (length 11)
- `/es/banking/v1` → matches (length 15) ← **winner**

This is the same algorithm used by:
- **Apigee** for proxy base path matching
- **Network routers** for IP prefix matching
- **nginx** for location block matching

---

## Alternatives Considered

### First Match (ordered list)

Select the first proxy that matches, based on insertion order.

❌ **Rejected** — Fragile. Adding a new proxy can silently change routing for existing ones. Order-dependent systems are hard to debug.

### Exact Match Only

Require the `basePath` to match the URL exactly (no prefix matching).

❌ **Rejected** — Too rigid. Would require a separate proxy for every single path, defeating the purpose of base paths.

---

## Consequences

### ✅ Positive

- **Deterministic** — Same request always matches the same proxy, regardless of insertion order
- **Intuitive** — More specific paths naturally take priority over general ones
- **Industry standard** — Follows Apigee and router conventions

### ⚠️ Constraints

- **Base paths must be unique** — Two proxies cannot have the same `basePath`
- **Path design matters** — Proxy base paths should be designed with a clear hierarchy

---

## Related Pages

- [[Routing Engine]]
- [[gateway-core]]
