---
title: "Management API Endpoint Reference"
type: reference
doc_status: current
implementation_status: implemented
last_verified: "2026-08-02"
tags:
  - type/reference
  - area/management-api
sources:
  - packages/management-api/src/server.ts
  - packages/management-api/src/routes
  - packages/management-api/src/errors.ts
  - packages/management-api/src/runtime-sync/publisher.ts
  - packages/admin-panel/app/api/management/[...path]/route.ts
aliases:
  - Management API Reference
---

# Management API Endpoint Reference

> [!summary] At a glance
> This is the authoritative HTTP reference for the implemented Management API. From the host, call `http://localhost:8080/api/management/*`; the BFF maps that path to the internal `/v1/*` API and forwards the OIDC Bearer token.

## Current Support

The Management API is internal to Compose on port `3002`. Postman and other
host clients use the Admin Panel BFF:

```text
http://localhost:8080/api/management/<path>
                        |
                        +-- http://management-api:3002/v1/<path>
```

Every `/v1` route requires an accepted OIDC token and at least one active
database membership. The BFF accepts `Authorization: Bearer <token>` or the
browser's `management_access_token` HttpOnly cookie. An explicit Bearer header
takes precedence.

| Role | Access |
| --- | --- |
| `platformAdmin` | All organizations; exclusively administers organizations and CAs |
| `organizationAdmin` | Reads and mutates resources in member organizations |
| `viewer` | Reads resources in member organizations |

### Operational and identity

| Method | Internal path | Role | Purpose |
| --- | --- | --- | --- |
| `GET` | `/live` | None | Process liveness |
| `GET` | `/ready` | None | PostgreSQL readiness |
| `GET` | `/v1/me` | Any member | Verified identity and active memberships |
| `GET` | `/v1/runtime-sync` | Any member | Committed version, pending changes, and live gateway status |

### Organizations, environments, and products

| Method | BFF path | Role | Purpose |
| --- | --- | --- | --- |
| `GET` | `/organizations` | Any member | List visible organizations |
| `GET` | `/organizations/:organizationId` | Visible member | Read organization |
| `POST` | `/organizations` | `platformAdmin` | Create from `{ "name": string }`; `201` |
| `PATCH` | `/organizations/:organizationId` | `platformAdmin` | Rename from `{ "name": string }` |
| `GET` | `/environments` | Any member | Read the closed environment catalog |
| `GET` | `/organizations/:organizationId/products` | Visible member | List products |
| `POST` | `/organizations/:organizationId/products` | Organization writer | Create product; `201` |
| `GET` | `/products/:productId` | Visible member | Read product |
| `PATCH` | `/products/:productId` | Organization writer | Update product fields |

Product create body:

```json
{
  "name": "Banking APIs",
  "scopes": ["banking:read", "banking:write"],
  "proxyIds": ["proxy-banking"],
  "environmentIds": ["env-qual-es"],
  "active": true
}
```

`proxyIds` must contain at least one proxy in the same organization.
`environmentIds: []` means all environments. Lists contain unique values;
`PATCH` accepts any non-empty subset. Removing product scopes trims them from
all grants in the same transaction. Use `active: false` instead of deletion.

### Proxies, revisions, and deployments

| Method | BFF path | Role | Purpose |
| --- | --- | --- | --- |
| `POST` | `/organizations/:organizationId/proxies` | Organization writer | Create logical proxy from `{ "name": string }`; `201` |
| `POST` | `/organizations/:organizationId/proxy-configurations/validate` | Organization writer | Inspect OpenAPI and optionally validate a complete bundle without writes |
| `POST` | `/organizations/:organizationId/proxies/configured` | Organization writer | Atomically create a logical proxy and immutable revision 1; `201` |
| `GET` | `/proxies` | Any member | List visible proxies and active deployments |
| `GET` | `/proxies/:proxyId` | Visible member | Read logical proxy |
| `PATCH` | `/proxies/:proxyId` | Organization writer | Update `name` and/or `active` |
| `POST` | `/proxies/:proxyId/revisions` | Organization writer | Import immutable bundle; `201` |
| `GET` | `/proxies/:proxyId/revisions` | Visible member | List revision summaries |
| `GET` | `/proxies/:proxyId/revisions/:revisionNumber` | Visible member | Read operations and policies |
| `GET` | `/proxies/:proxyId/revisions/:revisionNumber/openapi` | Visible member | Download original OpenAPI |
| `GET` | `/proxies/:proxyId/revisions/:revisionNumber/gateway-config` | Visible member | Download original Gateway YAML |
| `POST` | `/proxies/:proxyId/revisions/:revisionNumber/deployments` | Organization writer | Deploy or roll back revision; `201` |
| `GET` | `/proxies/:proxyId/deployments` | Visible member | Read active and retired history |
| `POST` | `/proxy-deployments/:deploymentId/retire` | Organization writer | Retire active deployment |

Configuration validation uses `multipart/form-data` with required `openapi` and
optional `gateway` files. It returns an OpenAPI summary and, when Gateway YAML
is supplied, the normalized compiled configuration, warnings, and content hash.
It performs no writes or audit events.

Configured creation uses `multipart/form-data` with the text field `name` and
exactly one `openapi` and `gateway` file. Both endpoints cap each source at 5
MiB. Configured creation recompiles the bundle, then creates the proxy, revision
1, operations, policies, and both audit events in one transaction. It returns
`201 { "proxy": object, "revision": object }` and does not deploy or publish a
runtime synchronization event. The name-only endpoint remains compatible for
API clients.

Legacy revision import uses `multipart/form-data` with exactly `openapi` and
`gateway`, each at most 5 MiB. Deployment body is:

```json
{
  "environmentId": "env-qual-es",
  "upstreamBaseUrl": "http://banking-backend:9000"
}
```

`upstreamBaseUrl` is required for forwarding revisions. Deployment and
retirement return `runtimeRefreshRequired: false` and
`runtimeSync: { "version": number, "state": "queued" }`. Poll `/runtime-sync`
until the target gateway has `state: applied` and `appliedVersion` at least that
version. Revisions and history are immutable. System proxies cannot be mutated
through public routes.

### Applications, credentials, and grants

| Method | BFF path | Role | Purpose |
| --- | --- | --- | --- |
| `GET` | `/organizations/:organizationId/apps` | Visible member | List application aggregates |
| `POST` | `/organizations/:organizationId/apps` | Organization writer | Create app, credential, and grants; `201` |
| `GET` | `/apps/:appId` | Visible member | Read application aggregate |
| `PATCH` | `/apps/:appId` | Organization writer | Update `name` and/or `status` |
| `POST` | `/apps/:appId/credentials` | Organization writer | Generate explicit or cloned credential; `201` |
| `GET` | `/credentials/:credentialId` | Visible member | Read public credential detail |
| `PATCH` | `/credentials/:credentialId` | Organization writer | Update `consumerKey`, `expiresAt`, and/or `status` |
| `POST` | `/credentials/:credentialId/rotate-secret` | Organization writer | Replace and return secret once |
| `PUT` | `/credentials/:credentialId/product-grants` | Organization writer | Replace desired approved-grant set |

Application registration requires a name and at least one product:

```json
{
  "name": "Payments consumer",
  "products": [
    { "productId": "product-banking-apis", "scopes": ["banking:read"] }
  ]
}
```

Omitting grant `scopes` selects all current product scopes. The response
contains `application`, `credential`, and one-time `consumerSecret`.

An additional credential accepts one of two exclusive payloads. Explicit
creation uses `products` and optional nullable `expiresAt`. Cloning uses only:

```json
{ "sourceCredentialId": "credential-existing" }
```

The source must be a non-revoked credential from the same non-revoked app.
Cloning copies approved grants, scopes, and expiration while generating a new
key and secret. It does not copy JWKs, certificates, secret hashes, revoked
grants, or history. Every generated secret is returned once.

`PATCH /credentials/:credentialId` can replace `consumerKey`. The normalized
value is case-sensitive, globally unique, 1-120 characters, and cannot contain
whitespace, control characters, or `:`. The existing secret and all grants and
public material remain unchanged. The previous key stops authenticating on the
next request; already issued access tokens remain valid until `exp`. Conflicts
return `409 consumer_key_conflict`.

Application and credential states are `pending`, `approved`, and `revoked`.
Allowed transitions are `pending -> approved|revoked` and
`approved -> revoked`; `revoked` is terminal.

Grant replacement body:

```json
{
  "products": [
    { "productId": "product-banking-apis", "scopes": ["banking:read"] }
  ]
}
```

Included grants become `approved`; omitted grants become `revoked` without
being deleted. Explicitly including a revoked grant approves it again.
`products: []` revokes every grant.

### JWT Bearer public keys

| Method | BFF path | Role | Purpose |
| --- | --- | --- | --- |
| `GET` | `/credentials/:credentialId/public-keys` | Visible member | List public JWK records |
| `POST` | `/credentials/:credentialId/public-keys` | Organization writer | Register public RSA JWK; `201` |
| `POST` | `/public-keys/:publicKeyId/revoke` | Organization writer | Revoke public key |

Registration accepts `kid`, public `jwk`, optional `validFrom`, and optional
nullable `expiresAt`. Only RSA keys of at least 2048 bits and `RS256` are
accepted. `kid` is unique per credential. Rotation uses a new `kid`; private
RSA members are never accepted or returned.

### Certificate authorities and certificates

| Method | BFF path | Role | Purpose |
| --- | --- | --- | --- |
| `GET` | `/organizations/:organizationId/certificate-authorities` | Visible member | List organization CAs |
| `POST` | `/organizations/:organizationId/certificate-authorities/managed` | `platformAdmin` | Create managed CA; `201` |
| `POST` | `/organizations/:organizationId/certificate-authorities/external` | `platformAdmin` | Import external CA; `201` |
| `POST` | `/certificate-authorities/:authorityId/active` | `platformAdmin` | Activate CA |
| `POST` | `/certificate-authorities/:authorityId/retiring` | `platformAdmin` | Retain trust but stop issuance |
| `POST` | `/certificate-authorities/:authorityId/revoked` | `platformAdmin` | Remove runtime trust |
| `POST` | `/certificate-authorities/:authorityId/rotate` | `platformAdmin` | Create replacement and retire current CA |
| `POST` | `/certificate-authorities/:authorityId/refresh-crl` | `platformAdmin` | Refresh CRL |
| `POST` | `/certificate-authorities/:authorityId/crl` | `platformAdmin` | Upload `{ "crlPem": string }` |
| `GET` | `/organizations/:organizationId/certificates` | Visible member | List certificates |
| `POST` | `/credentials/:credentialId/certificates/issue` | Organization writer | Issue from CSR; `201` |
| `POST` | `/credentials/:credentialId/certificates/external` | Organization writer | Register external certificate; `201` |
| `GET` | `/certificates/:certificateId/download` | Visible member | Return public certificate and chain |
| `POST` | `/certificates/:certificateId/revoke` | Organization writer | Revoke certificate |
| `GET` | `/pki/status` | Any member | Read expiry, CRL, and certificate status |

Managed CA creation accepts `name` and optional `validityDays` from 365 to
3650. Issuance accepts `csrPem`, optional `authorityId`, and optional
`validityDays` from 1 to 365. Revocation reasons are `unspecified`,
`keyCompromise`, or `cessationOfOperation`. See [[How to Operate the PKI]].

### Audit

| Method | BFF path | Role | Purpose |
| --- | --- | --- | --- |
| `GET` | `/audit-events` | Any member | Read append-only events visible to the actor |

Filters are `organizationId`, `action`, `resourceType`, `resourceId`, `cursor`,
and `limit`. `limit` defaults to 50 and is capped at 200. The response is
`{ "items": [...], "nextCursor": string|null }`. Non-platform actors are
restricted to active organization memberships even without a filter.

## Authoritative Values

Creation/import routes return `201`; reads and updates return `200`. There are
no physical-delete routes. Errors use:

```json
{
  "error": "credential_not_found",
  "message": "Credential does not exist"
}
```

| Status | Meaning |
| --- | --- |
| `400` | Invalid request, bundle, scope, key, or upstream configuration |
| `401` | Missing, malformed, expired, or untrusted OIDC token |
| `403` | Role or organization boundary denied |
| `404` | Resource absent or not visible |
| `409` | Invalid transition, duplicate key, immutable proxy, deployment conflict, or missing promotion |
| `500` | Unexpected internal failure without implementation details |

Stable codes include `organization_not_found`, `product_not_found`,
`proxy_not_found`, `environment_not_found`, `app_not_found`,
`credential_not_found`, `invalid_scope`, `organization_mismatch`,
`invalid_status_transition`, `consumer_key_conflict`,
`credential_clone_not_allowed`, `system_proxy_immutable`, and
`active_deployment_not_found`.

Revision/deployment codes also include `invalid_openapi`,
`invalid_gateway_config`, `unknown_operation`, `policy_not_supported`,
`revision_not_found`, `upstream_required`, `promotion_required`, and
`deployment_conflict`. Application security routes also use
`product_not_active`, `public_key_not_found`, and `public_key_conflict`.

## Examples

```bash
curl http://localhost:8080/api/management/organizations \
  --header "Authorization: Bearer $ACCESS_TOKEN"
```

```bash
curl --request PATCH \
  http://localhost:8080/api/management/products/$PRODUCT_ID \
  --header "Authorization: Bearer $ACCESS_TOKEN" \
  --header "Content-Type: application/json" \
  --data '{"scopes":["banking:read"]}'
```

See [[How to Use the Management API with Postman]] for the complete workflow.

## Source Files

- `packages/management-api/src/server.ts`
- `packages/management-api/src/routes/organizations.routes.ts`
- `packages/management-api/src/routes/products.routes.ts`
- `packages/management-api/src/routes/proxy-revisions.routes.ts`
- `packages/management-api/src/routes/apps.routes.ts`
- `packages/management-api/src/routes/audit.routes.ts`
- `packages/management-api/src/routes/certificate-authorities.ts`
- `packages/management-api/src/routes/certificates.ts`
- `packages/management-api/src/errors.ts`
- `packages/admin-panel/app/api/management/[...path]/route.ts`

## Related Notes

- [[Management API]]
- [[API Routes]]
- [[How to Use the Management API with Postman]]
- [[How to Import and Deploy a Proxy Revision]]
- [[How to Configure Application Authentication]]
