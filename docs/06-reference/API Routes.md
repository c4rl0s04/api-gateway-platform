---
title: API Routes
type: reference
doc_status: current
implementation_status: implemented
last_verified: 2026-07-31
tags:
  - type/reference
  - area/project
sources:
  - packages/gateway-core/src/server.ts
  - packages/management-api/src/server.ts
  - packages/management-api/src/routes/apps.routes.ts
  - packages/management-api/src/routes/proxies.routes.ts
  - packages/management-api/src/routes/proxy-revisions.routes.ts
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
| `GET` | `/ready` | `200` or `503` | Registry readiness plus deployment and environment counts |
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
| `GET` | `/v1/organizations` | `200` | Organizations visible to the actor |
| `GET` | `/v1/organizations/:organizationId` | `200` | Organization detail |
| `GET` | `/v1/environments` | `200` | All closed environments and deployment/product counts |
| `POST` | `/v1/organizations/:organizationId/proxies` | `201` | Create a logical proxy identity |
| `GET` | `/v1/proxies` | `200` | Proxies visible to the actor |
| `GET` | `/v1/proxies/:proxyId` | `200` | Proxy, latest revision, active deployments, products, and counts |
| `POST` | `/v1/proxies/:proxyId/revisions` | `201` | Import an immutable OpenAPI and Gateway YAML bundle |
| `GET` | `/v1/proxies/:proxyId/revisions` | `200` | Revision summaries visible to the actor |
| `GET` | `/v1/proxies/:proxyId/revisions/:revisionNumber` | `200` | Revision operations and effective policies |
| `GET` | `/v1/proxies/:proxyId/revisions/:revisionNumber/openapi` | `200` | Download the original OpenAPI document |
| `GET` | `/v1/proxies/:proxyId/revisions/:revisionNumber/gateway-config` | `200` | Download the original Gateway YAML |
| `POST` | `/v1/proxies/:proxyId/revisions/:revisionNumber/deployments` | `201` | Activate or roll back a revision in an environment |
| `GET` | `/v1/proxies/:proxyId/deployments` | `200` | Active and retired deployment history |
| `GET` | `/v1/organizations/:organizationId/apps` | `200` | Apps, credentials, grants, and certificates |
| `POST` | `/v1/organizations/:organizationId/apps` | `201` | Atomically create app, generated credential, and approved product grants |
| `GET` | `/v1/apps/:appId` | `200` | App, credentials, grants, public keys, and certificates |
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
| `POST` | `/v1/credentials/:credentialId/certificates/issue` | `201` | Issue managed certificate from CSR |
| `POST` | `/v1/credentials/:credentialId/certificates/external` | `201` | Register externally issued certificate |
| `GET` | `/v1/certificates/:certificateId/download` | `200` | Return public certificate and chain |
| `POST` | `/v1/certificates/:certificateId/revoke` | `200` | Revoke and refresh managed CRL |
| `GET` | `/v1/pki/status` | `200` | CA expiry, CRL, certificate, and audit status |

Every `/v1` route requires an accepted OIDC Bearer token and at least one active
database membership. CA mutations require `platformAdmin`; certificate and
proxy mutations require `platformAdmin` or the matching `organizationAdmin`.
A `viewer` has read-only access.

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

The deployment response includes `runtimeRefreshRequired: true`. The active
runtime changes only after restarting the gateway.

## Examples

```bash
curl --cacert .local-secrets/pki/authorities/local-development/ca.crt \
  https://qual-es.gateway.localhost:8443/live
curl --cacert .local-secrets/pki/authorities/local-development/ca.crt \
  https://qual-es.gateway.localhost:8443/ready
```

Management API is intentionally not callable from the host.

## Source Files

- `packages/gateway-core/src/server.ts`
- `packages/management-api/src/server.ts`
- `packages/management-api/src/routes/proxy-revisions.routes.ts`

## Related Notes

- [[Runtime Request Flow]]
- [[Management API]]
- [[How to Import and Deploy a Proxy Revision]]
- [[Debug Gateway 404]]
