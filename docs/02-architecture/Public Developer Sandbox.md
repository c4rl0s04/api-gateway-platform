---
title: Public Developer Sandbox
type: architecture
doc_status: current
implementation_status: partial
last_verified: 2026-08-09
tags:
  - type/architecture
  - area/developer-platform
sources:
  - packages/admin-panel/app/lab/page.tsx
  - packages/management-api/src/routes/lab-workspaces.routes.ts
  - packages/gateway-cli/src
  - packages/lab-egress/src
  - docker-compose.yml
aliases:
  - Developer Portal and Sandbox
---

# Public Developer Sandbox

> [!summary] At a glance
> The implemented Personal Gateway Lab and local client agent provide the sandbox behavior and key-custody model. Publishing them on the Internet still requires production infrastructure, public DNS/TLS, abuse controls, and a dedicated external portal posture.

## Context

The earlier design proposed a catalogue-only public sandbox plus manual CSR
guidance. It has been superseded by two implemented capabilities:

- [[Personal Gateway Lab]] gives each authenticated user a complete, isolated,
  24-hour gateway configuration space using the real data and control planes.
- [[Local Client Agent Architecture]] lets a developer sign JWT assertions,
  generate CSRs, install certificates, and execute mTLS without transferring
  private keys to the platform.

The current Admin Panel remains an administrative and local-learning surface.
Running it locally does not make it production-ready or safely anonymous.

## Components

| Capability | Current state | Public deployment requirement |
| --- | --- | --- |
| Personal workspace, sample, advanced CRUD, audit | Implemented | Durable database, quotas, support policy, and lifecycle monitoring |
| API key and OAuth quick Playground | Implemented | Public gateway DNS/TLS, abuse limits, logs, and safe demo data |
| Client-owned JWT and mTLS keys | Implemented through `gatewayctl` | Signed distributable CLI, trusted origins/audiences, update policy |
| Mock and public HTTPS upstreams | Implemented through `lab-egress` | Production DNS controls, network egress policy, metrics, alerting |
| OIDC ownership | Implemented with local Keycloak | Hardened or corporate IdP, account lifecycle, external-client policy |
| Public anonymous catalogue | Not implemented | Separate Developer Portal information architecture and content policy |

## Data Flow

```text
OIDC developer
→ Personal Gateway Lab
→ isolated proxy/product/app/credential configuration
→ durable hot reload
→ workspace hostname
→ managed mock or protected public HTTPS egress
```

For client-owned key flows:

```text
Developer Portal or Admin Panel
↔ origin-bound gatewayctl on 127.0.0.1
→ public JWK or CSR only reaches the platform
→ private key signs or connects locally
```

## Failure Modes

- A lab credential cannot authorize a standard route or another workspace.
- Expiry or revocation removes routes and identity material through the durable
  outbox; requests also enforce lifetime lazily.
- Unsafe public upstreams fail closed in `lab-egress`.
- Missing local agent prevents mTLS and reusable client-key signing but does not
  grant the server access to those keys.
- A public deployment without correct DNS, TLS, origin, audience, egress, rate
  limit, monitoring, or secret management must not be presented as secure.

## Constraints

- The implemented lab is authenticated, not anonymous.
- Isolation is logical inside a shared runtime, not a dedicated compute sandbox
  for untrusted executable code.
- Upstreams are declarative mocks or unauthenticated public HTTPS APIs only.
- The platform never receives client private keys.
- Local `.local-secrets`, development CA trust, local Keycloak credentials, and
  `*.localhost` hostnames are not public deployment mechanisms.

## Public Delivery Remaining

1. Deploy PostgreSQL, Redis, keystore, signing keys, and backups through managed
   production services and secret storage.
2. Configure wildcard lab DNS and publicly trusted gateway certificates.
3. Replace or harden local Keycloak and define external account lifecycle.
4. Distribute a signed `gatewayctl` binary with production origin/audience
   defaults and an update channel.
5. Add per-user quotas, rate limiting, abuse detection, metrics, alerting,
   retention, and purge operations.
6. Perform threat modeling and penetration testing of OIDC ownership, logical
   isolation, loopback pairing, and egress.
7. Build the external Developer Portal shell if anonymous documentation and API
   discovery are required separately from administration.

## Sources

- [[Personal Gateway Lab]]
- [[How to Learn the Gateway with the Lab]]
- [[Local Client Agent Architecture]]
- [[How to Connect Local Keys to the Playground]]
- [[Debug Lab Isolation and Egress]]
