# 🛠️ Management API

> [!WARNING]
> 🔲 **Not Yet Implemented** — This component is planned but has not been built yet.

## Overview

The Management API will be the **Control Plane** REST API for the API Gateway Platform. It will provide CRUD endpoints for managing all gateway configuration — organizations, environments, API proxies, endpoints, and policies.

---

## Planned Endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| `GET` | `/organizations` | List all organizations |
| `POST` | `/organizations` | Create an organization |
| `GET` | `/organizations/:id` | Get organization details |
| `GET` | `/environments` | List environments |
| `POST` | `/environments` | Create an environment |
| `GET` | `/proxies` | List API proxies |
| `POST` | `/proxies` | Create an API proxy |
| `PUT` | `/proxies/:id` | Update an API proxy |
| `DELETE` | `/proxies/:id` | Delete an API proxy |
| `GET` | `/proxies/:id/endpoints` | List endpoints for a proxy |
| `POST` | `/proxies/:id/endpoints` | Add an endpoint to a proxy |
| `PUT` | `/endpoints/:id` | Update an endpoint |
| `DELETE` | `/endpoints/:id` | Delete an endpoint |
| `POST` | `/endpoints/:id/policies` | Add a policy to an endpoint |

---

## Technology Stack (Planned)

- **Framework:** Fastify
- **Validation:** Zod
- **Database:** Prisma via `@api-gateway/database`
- **Notifications:** Redis Pub/Sub for hot-reload

---

## Related Pages

- [[Global Architecture]]
- [[management-api]]
