---
title: admin-panel
type: package
doc_status: current
implementation_status: partial
last_verified: 2026-07-27
tags:
  - type/package
  - area/admin-panel
sources:
  - packages/admin-panel/package.json
  - packages/admin-panel/app
  - packages/admin-panel/lib/api-client.ts
aliases: []
---

# admin-panel

> [!summary] At a glance
> `admin-panel` is a Next.js control-plane UI with OIDC Authorization Code + PKCE, an HttpOnly session, and a BFF for PKI Management API workflows.

## Responsibility

The package is the browser interface for organization, app, certificate
authority, certificate, runtime status, and audit views.

## Boundaries

The browser never calls internal Management API directly. Route handlers own
OIDC login/callback/logout and proxy authenticated `/api/management/*` calls.
Products and proxies remain context-only placeholders.

## Public Contracts

- `GET /api/auth/login`, callback, session, and logout.
- `/api/management/[...path]` authenticated BFF.
- Dashboard, applications, authorities, and certificates pages.

## Runtime Flow

Unauthenticated users are redirected to Keycloak. PKCE state and verifier are
HttpOnly cookies; callback exchange stores the short-lived access token in an
HttpOnly cookie. Client components call the BFF for reads and mutations.

## Configuration

Compose serves the panel on host port `8080`. `MANAGEMENT_API_URL`,
`OIDC_ISSUER`, `OIDC_INTERNAL_BASE_URL`, `OIDC_CLIENT_ID`, and
`OIDC_CALLBACK_URL` configure its server-side integrations.

## Tests

Tests cover RFC 7636 S256 challenges and random URL-safe OIDC state.

## Limitations

- Product, proxy, app, credential, and grant mutations are not implemented.
- The session does not implement refresh tokens; users log in again after token
  expiry.
- Automated browser tests are not yet part of the package suite.

## Related Notes

- [[Control Plane Flow]]
- [[Management API]]
- [[Ports]]
