---
title: "Glossary"
type: concept
doc_status: current
implementation_status: not-applicable
last_verified: 2026-07-31
tags:
  - type/concept
  - area/project
sources: []
aliases: []
---
# Glossary

> [!summary] At a glance
> This glossary defines the project vocabulary used across architecture, package, guide, and reference notes.

Quick reference for key terms used throughout this documentation vault.

---

| Term                        | Definition                                                                                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **API Gateway**             | A server that acts as the single entry point for client requests, routing them to backend services while applying security, rate limiting, and transformations. See [[What is an API Gateway]]. |
| **API Proxy**               | Stable logical identity used by products while routing configuration evolves through revisions. See [[Apigee - Overview]].                         |
| **ApiProxyRevision**        | Immutable OpenAPI and Gateway YAML bundle containing one proxy version's base path, operations, and policies.                                       |
| **BasePath**                | Revision URL prefix (e.g., `/api/users`) used to select the longest matching active proxy deployment.                                                |
| **ProxyOperation**          | Method and public path derived from OpenAPI, with a backend `targetPath` and ordered policies.                                                       |
| **ProxyDeployment**         | Historical activation of one exact proxy revision in one environment, with its upstream server and status.                                          |
| **UpstreamBaseUrl**         | Backend origin configured per deployment and combined with each operation `targetPath`.                                                             |
| **Policy**                  | A reusable, configurable unit of logic (e.g., rate limiting, auth) that executes during the request/response flow. See [[Policies in Apigee]].     |
| **Flow**                    | A stage in the request processing pipeline where policies are executed. Includes PreFlow, Conditional Flows, and PostFlow.                          |
| **PreFlow**                 | The first flow stage — policies here always execute on every request. Typically used for authentication and input validation.                        |
| **PostFlow**                | The last flow stage — policies here always execute after conditional flows. Typically used for logging and response transformation.                  |
| **Organization**            | Top-level ownership boundary for proxies, products, apps, authorities, memberships, and audit events.                                                |
| **Environment**             | Closed deployment target defined by stage and country/region, with one unique HTTPS public origin used for runtime selection.                          |
| **Data Plane**              | The component that handles real-time API traffic (`gateway-core`). Loads config into RAM, never queries the DB per request. See [[Data Plane vs Control Plane]]. |
| **Control Plane**           | The component that handles administrative operations (`management-api` + `admin-panel`). Persists config to PostgreSQL. See [[Data Plane vs Control Plane]]. |
| **Longest Prefix Match**    | The routing algorithm that selects the active revision with the longest matching base path. E.g., `/api/users` beats `/api` for `/api/users/123`.    |
| **ORM**                     | Object-Relational Mapping — a technique for querying and manipulating a database using an object-oriented language. We use Prisma as our ORM.       |
| **Prisma**                  | A next-generation Node.js/TypeScript ORM that provides type-safe database access, migrations, and schema management. Used in our Control Plane.     |
| **Reverse Proxy**           | A server that forwards client requests to backend servers and returns the response. The API Gateway functions as a reverse proxy.                    |
| **Hot Reload**              | The ability to update the Data Plane's in-memory configuration without restarting the process. See [[Hot Reload Sync]].                             |

---

## See Also

- [[What is an API Gateway]] — Conceptual introduction
- [[Apigee - Overview]] — Apigee's resource hierarchy and concepts
- [[Data Plane vs Control Plane]] — Architecture separation pattern
