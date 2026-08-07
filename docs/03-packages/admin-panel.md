---
title: admin-panel
type: package
doc_status: current
implementation_status: partial
last_verified: 2026-08-06
tags:
  - type/package
  - area/admin-panel
sources:
  - packages/admin-panel/package.json
  - packages/admin-panel/app
  - packages/admin-panel/components/access-screen.tsx
  - packages/admin-panel/components/session-shell.tsx
  - packages/admin-panel/lib/api-client.ts
  - infra/keycloak/themes/api-gateway/login
  - scripts/dev-local.sh
aliases: []
---

# admin-panel

> [!summary] At a glance
> `admin-panel` is a Next.js control-plane UI with OIDC Authorization Code + PKCE, an HttpOnly session, a Management API BFF, and a shared visual foundation for administrative access.

## Responsibility

The package is the browser interface for organization, proxy creation and
deployment, app, certificate authority, certificate, runtime status, and audit
views. It also owns the pre-authentication session surface shown before the
browser redirects to the identity provider.

## Boundaries

The browser never calls internal Management API directly. Route handlers own
OIDC login/callback/logout and proxy authenticated `/api/management/*` calls.
The Admin Panel does not render username or password fields and never receives
those credentials; the Keycloak login theme is a separate runtime resource.

## Public Contracts

- `GET /api/auth/login`, callback, session, and logout.
- `/api/management/[...path]` authenticated BFF.
- Dashboard, configured proxy creation, inventory/detail, applications,
  authorities, and certificates pages.

## Runtime Flow

The session shell first renders the stable access surface while it requests
`/api/auth/session`. A `401` exposes the sign-in command, while service and
network failures expose an inline retry state. The sign-in command redirects to
Keycloak. PKCE state and verifier are HttpOnly cookies; callback exchange stores
the short-lived access token in an HttpOnly cookie. Client components call the
BFF for reads and mutations.

## Authentication Interface

The pre-authentication surface and the `api-gateway` Keycloak login theme share
the following visual contract:

- Geist Sans for interface text and Geist Mono for technical identifiers.
- An off-white canvas, white surfaces, graphite text, and dark red accent.
- The Lucide `Waypoints` symbol and `API Gateway Platform` product name.
- A shadow-defined access surface, deliberate whitespace, and a quiet security
  footer that keeps the login hierarchy consistent across both runtimes.
- Maximum `8px` radius, tactile command states, visible keyboard focus, controls
  of at least `44px`, and reduced-motion support.

Admin Panel tokens are defined in `app/globals.css`. Keycloak owns its own
self-contained copies of the fonts and equivalent tokens under
`infra/keycloak/themes/api-gateway/login`; the theme inherits `keycloak.v2` and
does not override FreeMarker templates. The generated local realm selects the
theme through `loginTheme: api-gateway` and displays the product name through
`displayName`.

## Configuration

Compose serves the panel on host port `8080`. `MANAGEMENT_API_URL`,
`OIDC_ISSUER`, `OIDC_INTERNAL_BASE_URL`, `OIDC_CLIENT_ID`, and
`OIDC_CALLBACK_URL` configure its server-side integrations.

## Tests

Tests cover RFC 7636 S256 challenges, random URL-safe OIDC state, BFF token
selection, session failure states, proxy draft reduction and step validity,
Gateway YAML hydration and serialization, policy/path constraints, multipart
request formatting, error-to-step mapping, and the rendered retry action.
Platform configuration tests verify the generated realm metadata and read-only
Keycloak theme mount.

## Limitations

- The session does not implement refresh tokens; users log in again after token
  expiry.
- Automated browser tests are not yet part of the package suite.
- Proxy drafts are intentionally not persisted across refreshes or navigation.

## Related Notes

- [[Control Plane Flow]]
- [[Authentication and Authorization]]
- [[Management API]]
- [[Ports]]
