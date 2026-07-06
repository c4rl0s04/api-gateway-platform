# API Gateway Platform

We're building an enterprise-grade API Gateway inspired by Google Apigee. It acts as a reverse proxy sitting between client applications and backend services, handling routing, security policies, rate limiting, and request transformation.

The platform follows a **Control Plane / Data Plane** separation. The Data Plane (`gateway-core`) handles real-time traffic routing using an in-memory registry loaded from PostgreSQL. The Control Plane (`management-api` + `admin-panel`) will let administrators configure proxies, endpoints, and policies via a web dashboard.

This documentation vault serves as the single source of truth for architecture decisions, concepts, and implementation guides. Whether you're onboarding, reviewing design choices, or looking up how a specific component works — start here.

---

## Current Status

| Week | Milestone            | Status |
| ---- | -------------------- | ------ |
| 1    | Routing Engine       | ✅      |
| 2    | PostgreSQL Integration | ✅      |
| 3    | Management API       | 🔲      |
| 4    | Policy Engine        | 🔲      |
| 5    | Admin Panel          | 🔲      |
| 6    | Metrics & Monitoring | 🔲      |

---

## Quick Navigation

- [[01-concepts]] — Core concepts: what an API Gateway is, Apigee model, Data Plane vs Control Plane
- [[02-architecture]] — System architecture, diagrams, and component breakdown
- [[03-adr]] — Architecture Decision Records (ADRs)
- [[04-guides]] — How-to guides for setup, development, and deployment
- [[05-weekly-log]] — Weekly progress logs and retrospectives
- [[06-policies]] — Policy definitions and implementation details
- [[07-references]] — External links, specs, and research notes

---

## Quick Start

👉 **New here?** Start with [[How to Start the Project]] to get the platform running locally.
