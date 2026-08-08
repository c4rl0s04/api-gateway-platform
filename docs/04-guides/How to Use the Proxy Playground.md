---
title: How to Use the Proxy Playground
type: guide
doc_status: current
implementation_status: implemented
last_verified: 2026-08-08
tags:
  - type/guide
  - area/admin-panel
sources:
  - packages/admin-panel/app/playground/page.tsx
  - packages/admin-panel/components/playground-workspace.tsx
  - packages/admin-panel/app/api/playground/route.ts
  - packages/admin-panel/lib/playground-service.ts
  - packages/admin-panel/lib/playground-transport.ts
aliases: []
---

# How to Use the Proxy Playground

> [!summary] At a glance
> Use the authenticated Admin Panel to compose and execute requests against active business proxy deployments without manually discovering routes or authentication requirements.

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
2. Select an active business proxy, environment deployment, and operation.
3. Fill every path parameter. Add query parameters, headers, or a request body
   when required by the selected operation.
4. Complete the authorization section derived from the operation policy:
   - API key: select an eligible application credential or enter a key.
   - Client Credentials: select a credential, enter its current one-time secret,
     and review the requested scopes.
   - Access token: provide an already issued Bearer token.
   - JWT assertion: provide a client-signed JWT Bearer assertion and scopes.
   - mTLS: use the generated local cURL command with the client certificate and
     private key files; the browser and BFF do not receive the private key.
5. Select `Send request` and inspect the body, response headers, redacted
   request, timing, response size, and OAuth exchange timing when present.

The BFF accepts only a proxy, active deployment, and operation known to the
Management API. It derives the public gateway origin and path from that
configuration, then connects to Envoy over the internal Compose network with
the public hostname as TLS SNI and `Host`. It cannot be used as an arbitrary
URL proxy.

## Verification

- A successful seeded API-key or OAuth banking request returns `200` in the
  Inspector.
- The request tab and generated cURL replace API keys, Bearer tokens, and
  authorization headers with `<redacted>`.
- OAuth Client Credentials and JWT Bearer modes report the token endpoint
  timing without returning the issued access token.
- Gateway errors such as `401`, `403`, `404`, `405`, and `429` remain visible
  with their response body and safe headers.

Requests are limited to 256 KiB, responses to 1 MiB, and query/header lists to
20 entries each. The local request timeout defaults to 10 seconds.

## Troubleshooting or Rollback

- An empty proxy list means no active, non-system business proxy is visible to
  the signed-in actor.
- `playground_deployment_not_active` means the selected deployment changed
  after the page loaded; refresh and select the current deployment.
- `playground_authentication_mismatch` means the submitted mode does not match
  the effective authentication policy.
- `playground_token_exchange_failed` means `/oauth/token` rejected the client
  material or could not issue a token.
- `playground_mtls_requires_local_client` is expected for direct execution;
  run the generated cURL where the client key is stored.
- See [[Debug Policy Failure]] and [[Debug OAuth and mTLS]] for gateway-side
  diagnosis.
