---
title: "How to Use the Management API with Postman"
type: guide
doc_status: current
implementation_status: implemented
last_verified: "2026-08-10"
tags:
  - type/guide
  - area/management-api
sources:
  - packages/admin-panel/app/api/management/[...path]/route.ts
  - packages/admin-panel/lib/management-auth.ts
  - packages/management-api/src/routes
  - scripts/dev-local.sh
  - scripts/test-platform.mjs
aliases:
  - Postman Management API Guide
---

# How to Use the Management API with Postman

> [!summary] At a glance
> Call the Management API through `http://localhost:8080/api/management`, authenticate with a local Keycloak Bearer token, and execute the same organization-to-credential workflow used by the platform integration test.

## Goal

Use Postman without the Admin Panel UI to create and modify control-plane
resources. The sequence below creates an organization, proxy revision,
deployment, product, app, credentials, grants, and public key, then verifies
the audit trail.

## Prerequisites

- Start the complete local platform with `npm run dev:local` or
  `npm run dev:local:detached`.
- Keep `http://localhost:8080` and `http://localhost:8081` reachable.
- Read the generated local password from `.local-secrets/keycloak/users.env`.
  Do not commit, paste into documentation, or export that file.
- Have an OpenAPI 3.0/3.1 document and Gateway YAML bundle. See
  [[How to Import and Deploy a Proxy Revision]].
- Use the generated `platform-admin` account for organization administration.
  Use `organization-admin` to test organization boundaries and `viewer` to
  test read-only behavior.

Create a Postman environment with these variables:

| Variable | Initial value |
| --- | --- |
| `managementBaseUrl` | `http://localhost:8080/api/management` |
| `keycloakBaseUrl` | `http://localhost:8081` |
| `accessToken` | Empty |
| `organizationId` | Empty |
| `environmentId` | `env-qual-es` |
| `proxyId` | Empty |
| `revisionNumber` | Empty |
| `deploymentId` | Empty |
| `runtimeVersion` | Empty |
| `productId` | Empty |
| `appId` | Empty |
| `credentialId` | Empty |
| `consumerKey` | Empty |
| `consumerSecret` | Empty; mark sensitive |
| `publicKeyId` | Empty |

For every Management API request, select Bearer Token authorization and use
`{{accessToken}}`. Do not add `/v1`; the BFF inserts it.

## Steps

### 1. Obtain a local OIDC token

Create a `POST` request to:

```text
{{keycloakBaseUrl}}/realms/api-gateway/protocol/openid-connect/token
```

Use `x-www-form-urlencoded`:

| Key | Value |
| --- | --- |
| `grant_type` | `password` |
| `client_id` | `platform-e2e` |
| `username` | `platform-admin` |
| `password` | The current `PLATFORM_ADMIN_PASSWORD` value |

The password grant and `platform-e2e` client exist only for local automated
testing. Normal browser login uses Authorization Code with PKCE.

Add this Postman post-response script:

```javascript
pm.environment.set('accessToken', pm.response.json().access_token);
```

Confirm the token with `GET {{managementBaseUrl}}/me`.

### 2. Create the organization

`POST {{managementBaseUrl}}/organizations`:

```json
{
  "name": "Postman Example"
}
```

Capture the identifier:

```javascript
pm.environment.set('organizationId', pm.response.json().id);
```

Rename it with `PATCH
{{managementBaseUrl}}/organizations/{{organizationId}}` and a new `name` to
verify platform-admin mutation.

### 3. Create and import the proxy

Create the logical identity with `POST
{{managementBaseUrl}}/organizations/{{organizationId}}/proxies`:

```json
{
  "name": "Postman Banking Proxy"
}
```

Capture `proxyId`. Then call `POST
{{managementBaseUrl}}/proxies/{{proxyId}}/revisions` with Body set to
`form-data`:

| Key | Type | Value |
| --- | --- | --- |
| `openapi` | File | OpenAPI JSON or YAML |
| `gateway` | File | Gateway JSON or YAML |

Capture the returned revision:

```javascript
pm.environment.set('revisionNumber', pm.response.json().revisionNumber);
```

The files are immutable after import. Any path, operation, policy, or base-path
change requires a new import.

### 4. Deploy the revision

`POST {{managementBaseUrl}}/proxies/{{proxyId}}/revisions/
{{revisionNumber}}/deployments`:

```json
{
  "environmentId": "{{environmentId}}",
  "upstreamBaseUrl": "http://example-backend:9000"
}
```

Capture both IDs:

```javascript
const body = pm.response.json();
pm.environment.set('deploymentId', body.deployment.id);
pm.environment.set('runtimeVersion', body.runtimeSync.version);
```

A successful result contains `runtimeRefreshRequired: false`. Poll `GET
{{managementBaseUrl}}/runtime-sync` until `gateway-local` has `state: applied`
and `appliedVersion >= {{runtimeVersion}}` before testing the route. The same
deployment request with an older `revisionNumber` performs a rollback.

### 5. Create the product

`POST {{managementBaseUrl}}/organizations/{{organizationId}}/products`:

```json
{
  "name": "Postman Banking Product",
  "scopes": ["banking:read", "banking:write"],
  "proxyIds": ["{{proxyId}}"],
  "environmentIds": ["{{environmentId}}"],
  "active": true
}
```

Capture `productId`. Use `environmentIds: []` when the product should be valid
in every environment.

### 6. Register the app

`POST {{managementBaseUrl}}/organizations/{{organizationId}}/apps`:

```json
{
  "name": "Postman Client",
  "products": [
    {
      "productId": "{{productId}}",
      "scopes": ["banking:read", "banking:write"]
    }
  ]
}
```

Capture all one-time values immediately:

```javascript
const body = pm.response.json();
pm.environment.set('appId', body.application.id);
pm.environment.set('credentialId', body.credential.id);
pm.environment.set('consumerKey', body.credential.consumerKey);
pm.environment.set('consumerSecret', body.consumerSecret);
```

The app does not select an authentication method. The same credential can be
used as API key or Client Credentials; registered public material enables JWT
Bearer or mTLS. Policies on the proxy operation choose what the request must
present.

### 7. Create and rotate an additional credential

`POST {{managementBaseUrl}}/apps/{{appId}}/credentials`:

```json
{
  "expiresAt": null,
  "products": [
    {
      "productId": "{{productId}}",
      "scopes": ["banking:read"]
    }
  ]
}
```

This returns a different consumer key and one-time secret. Alternatively clone
only the approved grants, scopes, and expiration of another active credential:

```json
{ "sourceCredentialId": "{{credentialId}}" }
```

The clone receives a new key and secret and no JWKs or certificates. To rotate
an explicit or cloned credential, call
`POST {{managementBaseUrl}}/credentials/{{credentialId}}/rotate-secret` with
no body and replace the saved `consumerSecret`. The previous value must fail
immediately for Client Credentials.

Customize the current public identifier with `PATCH
{{managementBaseUrl}}/credentials/{{credentialId}}`:

```json
{ "consumerKey": "postman-client-key" }
```

The value is globally unique and cannot contain whitespace, controls, or `:`.
The existing secret remains valid with the new key; the previous key fails
immediately. Save the replacement in `consumerKey`.

### 8. Replace grants and reduce scopes

Replace the complete desired grant set with `PUT
{{managementBaseUrl}}/credentials/{{credentialId}}/product-grants`:

```json
{
  "products": [
    {
      "productId": "{{productId}}",
      "scopes": ["banking:read"]
    }
  ]
}
```

Send `{ "products": [] }` to revoke all grants, then send the explicit product
again to approve it. Update the product with `PATCH
{{managementBaseUrl}}/products/{{productId}}`; removing a product scope also
removes it from every grant.

### 9. Register and revoke a JWT public key

Generate the private key outside the platform and convert only its public key
to a 2048-bit or stronger RSA JWK. Call `POST
{{managementBaseUrl}}/credentials/{{credentialId}}/public-keys`:

```json
{
  "kid": "postman-client-2026-01",
  "jwk": {
    "kty": "RSA",
    "n": "PUBLIC_MODULUS",
    "e": "AQAB"
  },
  "expiresAt": null
}
```

Capture `publicKeyId`, list with `GET
{{managementBaseUrl}}/credentials/{{credentialId}}/public-keys`, and revoke
with `POST {{managementBaseUrl}}/public-keys/{{publicKeyId}}/revoke`.

### 10. Issue a multi-proxy developer token

As `platformAdmin` or the matching `organizationAdmin`, send `POST
{{managementBaseUrl}}/organizations/{{organizationId}}/developer-tokens`:

```json
{
  "environmentId": "env-qual-es",
  "productIds": ["{{productId}}"],
  "proxyIds": ["{{proxyId}}"],
  "scopes": ["banking:read"],
  "ttlSeconds": 600
}
```

Capture `accessToken` only when needed for the current test. The response is
not cacheable, the token is not persisted, and the API accepts only active
business proxies exposed by the selected products in a `qual` environment.
This does not replace app-specific OAuth testing.

### 11. Inspect audit and retire the deployment

Filter credential events:

```text
GET {{managementBaseUrl}}/audit-events?organizationId={{organizationId}}&resourceId={{credentialId}}&limit=50
```

The result should include creation, rotation, grant replacement, and lifecycle
events. Retire routing with `POST
{{managementBaseUrl}}/proxy-deployments/{{deploymentId}}/retire`; capture and
wait for its new `runtimeSync.version`. The route should then return `404`
without restarting the gateway.

## Verification

- `GET /me` identifies `platformAdmin` and its active memberships.
- App and credential reads contain consumer keys but never secrets or hashes.
- The original secret fails after rotation and the new secret succeeds.
- Removing a grant denies API key, Client Credentials, and mTLS access on the
  next request.
- Product scope reductions are visible in `GET /credentials/:credentialId`.
- Registered JWK reads contain only public members.
- Key replacement preserves the secret and invalidates only the previous key.
- Cloning copies approved authorization only, not public-key or certificate
  material.
- Runtime status confirms deploy, rollback, and retirement versions.
- Audit results contain every mutation and respect organization filters.
- Developer-token issuance is denied to `viewer` and appears as
  `developerToken.issue` without storing the Bearer token.
- Previously issued OAuth access tokens remain valid until `exp`; grant changes
  do not revoke already issued stateless tokens.

## Troubleshooting or Rollback

- `401`: obtain a new Keycloak token and ensure its audience includes
  `management-api`.
- `403`: check the OIDC subject's active database membership and role.
- `404`: verify captured IDs and organization visibility.
- `409 promotion_required`: deploy the same revision through `qual`, `pprd`,
  and then `prod` in the same region.
- `409 system_proxy_immutable`: create a business proxy instead of editing
  `platform-oauth`.
- `400 invalid_scope`: use only scopes currently declared by the product.
- To roll back routing, deploy an older immutable revision and wait for its
  runtime version. To preserve history, revoke or deactivate resources instead
  of deleting them.

Exact payload and error contracts are in [[Management API Endpoint Reference]].
