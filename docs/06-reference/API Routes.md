---
title: API Routes
type: reference
doc_status: current
implementation_status: implemented
last_verified: 2026-08-09
tags:
  - type/reference
  - area/project
sources:
  - packages/gateway-core/src/server.ts
  - packages/management-api/src/server.ts
  - packages/management-api/src/routes/apps.routes.ts
  - packages/management-api/src/routes/audit.routes.ts
  - packages/management-api/src/routes/organizations.routes.ts
  - packages/management-api/src/routes/products.routes.ts
  - packages/management-api/src/routes/proxies.routes.ts
  - packages/management-api/src/routes/proxy-revisions.routes.ts
  - packages/management-api/src/routes/runtime-sync.routes.ts
  - packages/admin-panel/app/api/playground/route.ts
  - packages/admin-panel/app/api/lab/[...path]/route.ts
aliases: []
---

# API Routes

> [!summary] At a glance
> This is the registered gateway and Management API surface; Management API remains internal to Compose and is reached by browsers through the Admin Panel BFF.

## Current Support

### gateway-core

| Method | Path | Success | Purpose |
| --- | --- | --- | --- |
| `GET` | `/live` | `200` | Process liveness and timestamp |
| `GET` | `/ready` | `200` or `503` | Registry readiness, counts, and local runtime-sync state |
| `POST` | `/oauth/token` | `200` or OAuth error | Local Client Credentials and JWT Bearer token issuance |
| `GET` | `/oauth/.well-known/jwks.json` | `200` | Local public gateway signing keys |
| Any | `/*` | Upstream or gateway error | Proxy resolution, policies, and forwarding |

The catch-all can return:

- `421` when the request host does not identify a loaded environment.
- `404` when no proxy matches.
- `404` when a proxy matches but no operation path matches.
- `405` with `Allow` when the path exists but the HTTP method is not defined.
- Policy-defined statuses such as `401`, `403`, `429`, or `503`.
- `502` when the upstream cannot be reached.

The OAuth routes are persisted endpoints of the system-managed
`platform-oauth` proxy, not hard-coded Fastify routes. They are deployed in all
30 environments and never forward to an upstream.

The gateway intentionally does not expose a root `/health` route.

### management-api

| Method | Path | Success | Purpose |
| --- | --- | --- | --- |
| `GET` | `/live` | `200` | Process liveness |
| `GET` | `/ready` | `200` or `503` | PostgreSQL readiness |
| `GET` | `/v1/me` | `200` | Verified identity and active memberships |
| `GET` | `/v1/runtime-sync` | `200` | Committed version, pending outbox, and live gateway versions |
| `GET` | `/v1/organizations` | `200` | Organizations visible to the actor |
| `GET` | `/v1/organizations/:organizationId` | `200` | Organization detail |
| `POST` | `/v1/organizations` | `201` | Create organization; platform admin only |
| `PATCH` | `/v1/organizations/:organizationId` | `200` | Rename organization; platform admin only |
| `GET` | `/v1/environments` | `200` | All closed environments and deployment/product counts |
| `GET/POST` | `/v1/organizations/:organizationId/products` | `200/201` | List or create products |
| `GET/PATCH` | `/v1/products/:productId` | `200` | Read or update product configuration |
| `POST` | `/v1/organizations/:organizationId/proxies` | `201` | Create a logical proxy identity |
| `POST` | `/v1/organizations/:organizationId/proxy-configurations/validate` | `200` | Inspect OpenAPI or validate an OpenAPI/Gateway bundle without writes |
| `POST` | `/v1/organizations/:organizationId/proxies/configured` | `201` | Atomically create a proxy and immutable revision 1 |
| `GET` | `/v1/proxies` | `200` | Proxies visible to the actor |
| `GET` | `/v1/proxies/:proxyId` | `200` | Proxy, latest revision, active deployments, products, and counts |
| `PATCH` | `/v1/proxies/:proxyId` | `200` | Update logical proxy name or active state |
| `POST` | `/v1/proxies/:proxyId/revisions` | `201` | Import an immutable OpenAPI and Gateway YAML bundle |
| `GET` | `/v1/proxies/:proxyId/revisions` | `200` | Revision summaries visible to the actor |
| `GET` | `/v1/proxies/:proxyId/revisions/:revisionNumber` | `200` | Revision operations and effective policies |
| `GET` | `/v1/proxies/:proxyId/revisions/:revisionNumber/openapi` | `200` | Download the original OpenAPI document |
| `GET` | `/v1/proxies/:proxyId/revisions/:revisionNumber/gateway-config` | `200` | Download the original Gateway YAML |
| `POST` | `/v1/proxies/:proxyId/revisions/:revisionNumber/deployments` | `201` | Activate or roll back a revision in an environment |
| `GET` | `/v1/proxies/:proxyId/deployments` | `200` | Active and retired deployment history |
| `POST` | `/v1/proxy-deployments/:deploymentId/retire` | `200` | Retire an active deployment |
| `GET` | `/v1/organizations/:organizationId/apps` | `200` | Apps, credentials, grants, and certificates |
| `POST` | `/v1/organizations/:organizationId/apps` | `201` | Atomically create app, generated credential, and approved product grants |
| `GET` | `/v1/apps/:appId` | `200` | App, credentials, grants, public keys, and certificates |
| `PATCH` | `/v1/apps/:appId` | `200` | Update app name or lifecycle status |
| `POST` | `/v1/apps/:appId/credentials` | `201` | Generate explicit grants or clone an active credential |
| `GET/PATCH` | `/v1/credentials/:credentialId` | `200` | Read or update consumer key and lifecycle data |
| `POST` | `/v1/credentials/:credentialId/rotate-secret` | `200` | Rotate and return a new consumer secret once |
| `PUT` | `/v1/credentials/:credentialId/product-grants` | `200` | Replace the desired approved-grant set |
| `GET/POST` | `/v1/credentials/:credentialId/public-keys` | `200/201` | List or register RSA public JWKs |
| `POST` | `/v1/public-keys/:publicKeyId/revoke` | `200` | Revoke an application public key |
| `GET` | `/v1/audit-events` | `200` | Filter and paginate visible audit events |
| `GET` | `/v1/organizations/:organizationId/certificate-authorities` | `200` | Organization authorities |
| `POST` | `/v1/organizations/:organizationId/certificate-authorities/managed` | `201` | Create managed CA; platform admin only |
| `POST` | `/v1/organizations/:organizationId/certificate-authorities/external` | `201` | Import external CA; platform admin only |
| `POST` | `/v1/certificate-authorities/:authorityId/active` | `200` | Activate CA |
| `POST` | `/v1/certificate-authorities/:authorityId/retiring` | `200` | Stop issuance and retain trust |
| `POST` | `/v1/certificate-authorities/:authorityId/revoked` | `200` | Remove CA from runtime trust |
| `POST` | `/v1/certificate-authorities/:authorityId/rotate` | `200` | Create active replacement and retire old CA |
| `POST` | `/v1/certificate-authorities/:authorityId/refresh-crl` | `200` | Regenerate or download CRL |
| `POST` | `/v1/certificate-authorities/:authorityId/crl` | `200` | Upload external CA CRL |
| `GET` | `/v1/organizations/:organizationId/certificates` | `200` | List visible certificates |
| `GET` | `/v1/credentials/:credentialId/certificates` | `200` | List certificates for one credential |
| `POST` | `/v1/credentials/:credentialId/certificates/issue` | `201` | Issue managed certificate from CSR |
| `POST` | `/v1/credentials/:credentialId/certificates/external` | `201` | Register externally issued PEM/DER certificate upload |
| `GET` | `/v1/certificates/:certificateId/download` | `200` | Return public certificate and chain |
| `POST` | `/v1/certificates/:certificateId/revoke` | `200` | Revoke and refresh managed CRL |
| `GET` | `/v1/pki/status` | `200` | CA expiry, CRL, certificate, and audit status |

Every `/v1` route requires an accepted OIDC Bearer token and at least one active
database membership. CA mutations require `platformAdmin`; certificate and
proxy mutations require `platformAdmin` or the matching `organizationAdmin`.
A `viewer` has read-only access.

### admin-panel BFF

| Method | Path | Success | Purpose |
| --- | --- | --- | --- |
| Any | `/api/management/*` | Management response | Authenticated browser/Postman bridge to internal `/v1/*` routes |
| `POST` | `/api/playground` | `200` | Validate and execute a configured operation through Envoy |
| Any | `/api/lab/*` | Lab API response | Authenticated bridge to internal `/lab/v1/*` routes |
| `POST` | `/api/lab/playground` | `200` | Validate and execute an operation from the active Personal Lab |

`POST /api/playground` requires the same OIDC session cookie or explicit Bearer
token as the Management BFF. It accepts configuration IDs, request inputs, and
an optional edited target URL. The server re-reads the selected proxy,
deployment, and revision; the URL must retain the deployment origin and match
the selected operation path. Active business proxies can execute, while
system-managed execution is restricted to the `platform-oauth` token and JWKS
operations. API keys, assertions, secrets, and automatically exchanged tokens
are omitted or redacted. A token returned by direct `/oauth/token` execution is
preserved because it is the requested operation response.

For exact request bodies, role boundaries, response fields, filters, and stable
errors, use [[Management API Endpoint Reference]].
The complete workspace-owned surface and `/api/lab/*` to `/lab/v1/*` mapping
are authoritative in [[Lab API Reference]].

Application registration accepts:

```json
{
  "name": "Payments consumer",
  "products": [
    {
      "productId": "product-banking-apis",
      "scopes": ["banking:read"]
    }
  ]
}
```

`scopes` is optional and defaults to all scopes declared by that product.
The `201` response contains `application`, `credential`, and
`consumerSecret`. The secret is returned exactly once. List and detail routes
never return the secret or its hash. The request cannot select authentication
methods or provide custom credential material.

Revision import requires `multipart/form-data` with exactly two file fields,
`openapi` and `gateway`, each limited to 5 MiB. Deployment receives:

```json
{
  "environmentId": "env-qual-es",
  "upstreamBaseUrl": "http://banking-backend:9000"
}
```

The deployment response includes `runtimeRefreshRequired: false` and a queued
`runtimeSync.version`. `GET /v1/runtime-sync` exposes committed, pending, and
per-instance applied versions; routing changes do not require a restart.

## Examples

```bash
curl --cacert .local-secrets/pki/authorities/local-development/ca.crt \
  https://qual-es.gateway.localhost:8443/live
curl --cacert .local-secrets/pki/authorities/local-development/ca.crt \
  https://qual-es.gateway.localhost:8443/ready
```

Management API is not published directly to the host. Browsers use an HttpOnly
session cookie through the BFF; Postman and other API clients send an explicit
Bearer token to `http://localhost:8080/api/management/*`.

## Source Files

- `packages/gateway-core/src/server.ts`
- `packages/management-api/src/server.ts`
- `packages/management-api/src/routes/proxy-revisions.routes.ts`

## Related Notes

- [[Runtime Request Flow]]
- [[Management API]]
- [[Management API Endpoint Reference]]
- [[How to Use the Management API with Postman]]
- [[How to Use the Proxy Playground]]
- [[How to Import and Deploy a Proxy Revision]]
- [[Debug Gateway 404]]
- [[Lab API Reference]]
