# Glossary

Quick reference for key terms used throughout this documentation vault.

---

| Term                        | Definition                                                                                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **API Gateway**             | A server that acts as the single entry point for client requests, routing them to backend services while applying security, rate limiting, and transformations. See [[What is an API Gateway]]. |
| **API Proxy**               | The core configuration unit that defines how incoming requests are received, processed, and forwarded to a backend. See [[Apigee - Overview]].     |
| **BasePath**                | The URL prefix (e.g., `/api/users`) used to match incoming requests to a specific proxy or endpoint. Matched via Longest Prefix Match.             |
| **Endpoint**                | A specific route within a proxy, defined by a basePath and a targetUrl. Each proxy can have multiple endpoints.                                     |
| **TargetURL**               | The backend service URL that the gateway forwards requests to after matching and policy execution.                                                  |
| **Policy**                  | A reusable, configurable unit of logic (e.g., rate limiting, auth) that executes during the request/response flow. See [[Policies in Apigee]].     |
| **Flow**                    | A stage in the request processing pipeline where policies are executed. Includes PreFlow, Conditional Flows, and PostFlow.                          |
| **PreFlow**                 | The first flow stage — policies here always execute on every request. Typically used for authentication and input validation.                        |
| **PostFlow**                | The last flow stage — policies here always execute after conditional flows. Typically used for logging and response transformation.                  |
| **Organization**            | In Apigee, the top-level container representing a company or team. Our project is currently single-tenant.                                          |
| **Environment**             | A deployment context (dev, staging, prod) within an organization. Each environment has its own deployed proxies.                                    |
| **Data Plane**              | The component that handles real-time API traffic (`gateway-core`). Loads config into RAM, never queries the DB per request. See [[Data Plane vs Control Plane]]. |
| **Control Plane**           | The component that handles administrative operations (`management-api` + `admin-panel`). Persists config to PostgreSQL. See [[Data Plane vs Control Plane]]. |
| **Longest Prefix Match**    | The routing algorithm that selects the proxy/endpoint with the longest matching basePath for a given request path. E.g., `/api/users` beats `/api` for `/api/users/123`. |
| **ORM**                     | Object-Relational Mapping — a technique for querying and manipulating a database using an object-oriented language. We use Prisma as our ORM.       |
| **Prisma**                  | A next-generation Node.js/TypeScript ORM that provides type-safe database access, migrations, and schema management. Used in our Control Plane.     |
| **Reverse Proxy**           | A server that forwards client requests to backend servers and returns the response. The API Gateway functions as a reverse proxy.                    |
| **Hot Reload**              | The ability to update the Data Plane's in-memory configuration without restarting the process. See [[Hot Reload Sync]].                             |

---

## See Also

- [[What is an API Gateway]] — Conceptual introduction
- [[Apigee - Overview]] — Apigee's resource hierarchy and concepts
- [[Data Plane vs Control Plane]] — Architecture separation pattern
