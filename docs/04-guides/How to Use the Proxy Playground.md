---
title: How to Use the Proxy Playground
type: guide
doc_status: current
implementation_status: implemented
last_verified: 2026-08-10
tags:
  - type/guide
  - area/admin-panel
sources:
  - packages/admin-panel/app/playground/page.tsx
  - packages/admin-panel/components/playground-workspace.tsx
  - packages/admin-panel/app/api/playground/route.ts
  - packages/admin-panel/lib/playground-service.ts
  - packages/admin-panel/lib/playground-transport.ts
  - packages/admin-panel/lib/use-local-agent.ts
  - packages/gateway-cli/src/operations.ts
  - packages/database/src/openapi-request-bodies.ts
aliases: []
---

# How to Use the Proxy Playground

> [!summary] At a glance
> Use the authenticated Admin Panel to compose and execute requests against active proxy deployments without manually discovering routes or authentication requirements.

## Goal

Select a deployed operation, provide its request values and authentication
material, execute it through Envoy and the gateway, and inspect the response.

## Prerequisites

- Start the local platform with `npm run dev:local`.
- Sign in at `http://localhost:8080` with a configured OIDC account.
- Ensure the proxy has an active deployment in the environment to test.
- Have an application credential authorized for the proxy product when its
  operation requires API key or OAuth authentication.

## Steps

1. Open `Playground` from the Admin Panel navigation.
2. Search for and select an active proxy, environment deployment, and
   operation. `Platform OAuth` is grouped separately from business proxies.
3. Fill every path parameter and add query parameters or safe custom headers.
   The request URL updates immediately. It can also be edited directly; after
   focus leaves the field, the playground extracts path and query values back
   into the composer. The origin and selected operation cannot be changed.
4. For operations with an OpenAPI `requestBody`, select a media type and an
   explicit or schema-generated example. Edit the populated body values as
   needed. JSON is checked locally before the request can be sent. Operations
   without a declared request body remain freeform.
5. Complete the authorization section derived from the operation policy:
   - API key: select an eligible application credential or enter a key.
   - Client Credentials: select a credential, enter its current one-time secret,
     and review the requested scopes.
   - Access token: provide an already issued Bearer token.
   - JWT assertion: provide an assertion or connect `gatewayctl`, select a local
     RS256 identity, register its public JWK, and sign locally.
   - mTLS: connect `gatewayctl`, select an installed client certificate, and
     execute from the certificate-owner machine. Register CRTs from the owning
     application configuration, not from the Playground. Expand `Use an
     existing certificate` to build the local import command; the browser and
     BFF do not receive the private key or file paths.
   - Developer token: for an OAuth-protected operation in `qual`, an authorized
     administrator may select additional products, proxies, and scopes. The
     current proxy remains mandatory.
6. Review the live, redacted cURL in the Inspector before sending. Select
   `Send request`, then inspect the body, response headers, exact redacted
   request, timing, response size, and OAuth exchange timing when present.

### Obtain an access token manually

1. Select `Platform OAuth`, the target environment, and `POST /token`.
2. Select the organization that owns the application credential.
3. Choose Client Credentials or JWT assertion, according to the grants exposed
   by the endpoint policy.
4. Provide the one-time consumer secret or signed assertion, review scopes,
   and send the request.
5. Inspect the OAuth response or use `Copy access token`, then select a business
   endpoint protected by `oauth-access-token` and paste it in `Access token`
   mode.

The token endpoint response intentionally exposes the newly issued access
token to the authenticated operator. Consumer secrets and JWT assertions are
still redacted from request diagnostics and are never persisted by the panel.

### Issue a developer token for several proxies

1. Select an OAuth-protected business operation in a `qual` deployment.
2. Choose `Developer token` in the authorization method selector.
3. Select products from the current organization. The Playground derives the
   eligible active proxies and scopes from those products.
4. Keep the current proxy selected and optionally add other eligible proxies.
5. Choose the scopes and a lifetime from 60 to 900 seconds, then issue the
   token.
6. Use the returned Bearer token against any selected proxy in that same
   environment until it expires.

This mode is available to `platformAdmin` and the matching
`organizationAdmin`; `viewer` is read-only. It does not create or modify an
app credential and it does not provide access to all proxies in an environment.
Use the normal Client Credentials or JWT assertion modes when testing the real
permissions of a specific application.

The BFF accepts only a proxy, active deployment, and operation known to the
Management API. An optional edited URL must retain the selected deployment
origin and match the operation path. The BFF then connects to Envoy over the
internal Compose network with the public hostname as TLS SNI and `Host`; it
cannot be used as an arbitrary URL proxy. System-managed execution is limited
to the token and JWKS operations of `proxy-platform-oauth`.

## Verification

- A successful seeded API-key or OAuth banking request returns `200` in the
  Inspector.
- A developer token succeeds only for its selected `qual` proxies and scopes.
- The Preview tab changes before execution as URL, headers, body, and
  authorization mode change.
- The request tab and generated cURL replace API keys, Bearer tokens, and
  authorization headers with `<redacted>`.
- Copied local cURL commands include the project CA through `--cacert`. Replace
  every `<redacted>` placeholder with the real credential before executing the
  command; the playground never writes secrets to response history or the
clipboard.

### Connect client-owned keys

1. Run `npm run gatewayctl -- agent start` on the machine that owns the key.
2. Continue in the Playground page opened by the CLI. Pairing data is carried in
   the fragment and remains local to the browser.
3. Select a public local identity alias. The page never receives its private
   key or unrestricted filesystem path.
4. For JWT, register the public JWK and generate a 60-second assertion.
5. For mTLS, select a local certificate whose SHA-256 fingerprint is registered
   on an authorized application credential, then run through the agent.

When the certificate and key already exist, the Playground's local certificate
client provides an editable `keys add` command builder. It shell-quotes every
value, keeps path values in browser memory, and refreshes only public identity
metadata from the connected agent after the command runs.

The standard Playground never creates keys, submits CSRs, issues certificates,
or changes an application credential. Those controls remain available only in
the Personal Lab. Standard certificate registration belongs to the application
detail and global certificate inventory.

Use [[How to Connect Local Keys to the Playground]] for the full workflow and
[[gatewayctl Reference]] for commands and configuration.
- Automatic OAuth Client Credentials and JWT Bearer modes on business APIs
  report token endpoint timing without returning the intermediate token.
- Direct `Platform OAuth` execution returns the access token because obtaining
  it for manual testing is the purpose of that selected operation.
- Gateway errors such as `401`, `403`, `404`, `405`, and `429` remain visible
  with their response body and safe headers.

Requests are limited to 256 KiB, responses to 1 MiB, and query/header lists to
20 entries each. The local request timeout defaults to 10 seconds.

## Troubleshooting or Rollback

- An empty proxy list means no executable active deployment is visible to the
  signed-in actor.
- `playground_url_not_allowed` means an edited URL changed the deployment
  origin. `playground_url_mismatch` means it changed the selected route.
- `playground_deployment_not_active` means the selected deployment changed
  after the page loaded; refresh and select the current deployment.
- `playground_authentication_mismatch` means the submitted mode does not match
  the effective authentication policy.
- `playground_token_exchange_failed` means `/oauth/token` rejected the client
  material or could not issue a token.
- `playground_mtls_requires_local_client` means the browser/BFF cannot own the
  mTLS key; connect the local agent or use the generated cURL where the key is
  stored.
- See [[Debug Policy Failure]] and [[Debug OAuth and mTLS]] for gateway-side
  diagnosis.
