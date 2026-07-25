# Apigee — Overview

**Google Apigee** is a full-lifecycle API management platform. It lets organizations design, secure, deploy, monitor, and scale APIs. Our project takes heavy inspiration from Apigee's architecture — specifically its resource hierarchy, proxy model, and policy engine.

---

## Resource Hierarchy

Apigee organizes everything into a clear hierarchy:

```
Organization
  └── Environment (e.g., dev, staging, prod)
        └── API Proxy
              ├── ProxyEndpoint  (client-facing: basePath, flows, policies)
              └── TargetEndpoint (backend-facing: target URL, load balancing)
```

- **Organization** — The top-level container. Represents a company or team.
- **Environment** — A deployment context (dev, staging, prod). Each environment has its own set of deployed proxies.
- **API Proxy** — The core unit. A proxy defines how incoming requests are received, processed, and forwarded.
- **ProxyEndpoint** — Defines the client-facing configuration: the `basePath` clients hit, and the flows/policies applied on the request side.
- **TargetEndpoint** — Defines where the request is forwarded: the backend URL, timeouts, and load balancing rules.

---

## Key Concepts

### API Proxies & BasePaths

Every API Proxy has a **basePath** (e.g., `/api/users`). When a request arrives, the gateway uses **Longest Prefix Match** to determine which proxy handles it:

- `/api/users/profile` → matches `/api/users` (not `/api`)
- `/api/orders` → matches `/api/orders`

### Flows

Flows define **when** policies execute during request processing:

1. **PreFlow** — Always runs first. Use for auth, validation.
2. **Conditional Flows** — Run only if a condition is met (e.g., specific HTTP method or path suffix).
3. **PostFlow** — Always runs last. Use for logging, response transformation.

### Policies

Policies are **reusable units of logic** attached to flows. Examples: rate limiting, OAuth validation, JSON-to-XML transformation. See [[Policies in Apigee]] for the full catalog.

---

## Mapping Apigee Concepts to Our Project

| Apigee Concept    | Our Equivalent                      | Notes                                           |
| ----------------- | ----------------------------------- | ------------------------------------------------ |
| Organization      | (single-tenant for now)             | Future: multi-org support                        |
| Environment       | (single env for now)                | Future: dev/staging/prod environments            |
| API Proxy         | `Proxy` model in Prisma             | Stored in PostgreSQL, loaded into memory         |
| ProxyEndpoint     | `Endpoint` model in Prisma          | Each proxy has multiple endpoints with basePaths |
| TargetEndpoint    | `targetUrl` field on Endpoint       | The backend URL to forward requests to           |
| BasePath          | `basePath` field on Endpoint        | Used for Longest Prefix Match routing            |
| Flows             | (not yet implemented)               | Future: PreFlow / PostFlow pipeline              |
| Policies          | (not yet implemented)               | Future: JSON-based policy engine                 |
| Policy XML Config | JSON config (planned)               | We'll convert Apigee's XML model to JSON         |

---

## See Also

- [[Policies in Apigee]] — Detailed catalog of Apigee policy types
- [[Request Lifecycle in Apigee]] — Step-by-step request processing flow
- [[Global Architecture]] — How our system maps to these concepts
