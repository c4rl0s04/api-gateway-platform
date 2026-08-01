---
title: Control Plane Flow
type: architecture
doc_status: current
implementation_status: partial
last_verified: 2026-07-31
tags:
  - type/architecture
  - area/management-api
sources:
  - packages/management-api/src/server.ts
  - packages/management-api/src/routes
  - packages/admin-panel/app/api/auth/login/route.ts
  - packages/admin-panel/app/api/auth/callback/route.ts
  - packages/admin-panel/app/api/management/[...path]/route.ts
  - packages/admin-panel/lib/oidc.ts
aliases: []
---

# Control Plane Flow

> [!summary] At a glance
> The control plane provides OIDC-protected revision deployment, application registration, PKI administration, and audit; product administration and hot reload remain planned.

## Context

The control plane combines `admin-panel`, Keycloak or a replaceable OIDC IdP,
`management-api`, PostgreSQL, the encrypted CA keystore, and Envoy SDS.

## Components

```mermaid
flowchart LR
    ADMIN["Administrator"] --> PANEL["admin-panel"]
    PANEL --> IDP["OIDC IdP"]
    PANEL -->|"BFF + Bearer token"| API["management-api"]
    API --> DATABASE["PostgreSQL"]
    API --> KEYSTORE["Encrypted CA keystore"]
    API --> SDS["Envoy SDS resources"]
    SDS --> ENVOY["Envoy"]
    DATABASE -. "loaded on restart" .-> GATEWAY["gateway-core"]
```

### Responsibilities

| Component | Responsibility |
| --- | --- |
| Keycloak | Authenticates the administrator and issues a signed OIDC access token. |
| Admin Panel | Renders the browser interface and starts the login flow. |
| BFF | Runs inside Admin Panel, stores the token in an HttpOnly cookie, and forwards browser requests with that token. |
| Management API | Validates the token and applies role and organization permissions before reading or changing configuration. |
| PostgreSQL | Stores memberships, roles, proxy configuration, applications, certificates, and audit events. |

The BFF, or Backend For Frontend, is not an additional deployed service. It is
the set of server-side routes under `admin-panel/app/api`. The browser calls
`/api/management/*` on Admin Panel, and the BFF translates that request to the
internal `/v1/*` Management API. Management API is therefore not exposed
directly to browser-side JavaScript.

Keycloak answers **who the administrator is**. It validates the login and signs
an access token. Management API answers **what that administrator may do** by
matching the token identity against `AdminMembership` records and enforcing the
stored role and organization boundary.

## Data Flow

```mermaid
sequenceDiagram
    participant User as Administrator
    participant Panel as Admin Panel
    participant Keycloak
    participant BFF as Admin Panel BFF
    participant API as Management API

    User->>Panel: Select sign in
    Panel->>Keycloak: Redirect with PKCE challenge
    User->>Keycloak: Submit credentials
    Keycloak->>BFF: Return one-time authorization code
    BFF->>Keycloak: Exchange code and PKCE verifier
    Keycloak-->>BFF: Signed access token
    BFF-->>User: Set HttpOnly token cookie
    User->>BFF: GET /api/management/proxies
    BFF->>API: GET /v1/proxies + Bearer token
    API->>API: Verify token and AdminMembership
    API-->>BFF: Authorized proxy list
    BFF-->>User: Proxy list
```

PKCE binds the login attempt to a random verifier temporarily stored by Admin
Panel. An intercepted authorization code cannot be exchanged without that
verifier. After the exchange, the short-lived access token is stored in an
`HttpOnly` cookie: the browser sends the cookie automatically, but client-side
JavaScript cannot read it.

For each management request, the BFF reads the cookie on the server, adds
`Authorization: Bearer <token>`, and forwards the method, query, content type,
and body to Management API. The BFF does not grant permissions. Management API
verifies the token signature, issuer, audience, and expiration, then checks the
database membership and role before running the requested operation.

Proxy imports compile OpenAPI and gateway configuration atomically; deployment
activation persists desired routing and requires gateway restart. CA/CRL
changes continue to publish dynamically to Envoy.

## Failure Modes

- Publishing before a committed database write could reload incomplete state.
- Direct Prisma writes could bypass deployment progression invariants.
- A reload event without snapshot validation could make the data plane unavailable.
- A database mutation followed by runtime publication failure can temporarily
  diverge persisted and active trust.

## Constraints

PKI and proxy revision APIs are implemented. Product and proxy web pages remain
contextual placeholders, and Redis-based routing hot reload remains a design.

## Sources

See [[Management API]], [[management-api]], [[admin-panel]], and
[[Hot Reload Sync]].
