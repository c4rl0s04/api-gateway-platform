---
title: Public Developer Sandbox
type: architecture
doc_status: draft
implementation_status: planned
last_verified: 2026-08-09
tags:
  - type/architecture
  - area/developer-platform
sources: []
aliases:
  - Developer Portal and Sandbox
---

# Public Developer Sandbox

> [!summary] At a glance
> Planned architecture for a public developer portal where external users can
> safely discover and test sandbox APIs, while platform administration remains
> protected and mTLS private keys remain outside the platform.

## Context

The current Admin Panel is a control-plane application for trusted platform
and organization administrators. It can create proxies, products,
applications, credentials, certificate authorities, and certificates. It must
not become anonymously accessible.

The planned public surface is a separate developer portal. Anyone may browse
public documentation, but a developer must authenticate before creating an app
or receiving sandbox credentials. The portal is limited to predefined sandbox
products and cannot administer organizations, deployments, CAs, or production
configuration.

## Components

- **Public developer portal:** documentation, API catalogue, playground, and
  authenticated self-service onboarding.
- **Developer self-service API:** a narrowly scoped API distinct from the
  administrator Management API. It creates sandbox apps and grants only
  approved sandbox products.
- **Sandbox gateway:** public gateway hostnames and mock or dedicated sandbox
  upstreams. It uses the existing API key, OAuth, mTLS, product, and policy
  model.
- **Administrator control plane:** the existing Admin Panel and Management API
  remain OIDC-protected and private to authorized administrators.
- **Production infrastructure:** persistent PostgreSQL, Redis, PKI keystore,
  CRL storage, secret manager, public DNS, and TLS termination.

## Data Flow

### API key and OAuth

```text
Developer signs in
→ creates a sandbox app
→ receives consumerKey and one-time consumerSecret
→ receives an approved grant for a sandbox product
→ uses API key or obtains an OAuth access token
→ calls a sandbox proxy through the public gateway
```

The portal may invoke the existing constrained Playground BFF for API key and
OAuth examples. It must never allow arbitrary outbound requests or expose the
administrator Management API to an untrusted browser.

### mTLS

```text
Developer generates private key and CSR on their own machine
→ uploads only the CSR
→ platform signs it through a managed CA, or records an external certificate
→ developer downloads the public certificate and chain
→ developer configures certificate and private key in their client
→ Envoy validates the TLS client certificate
→ mtls-auth authorizes its fingerprint for the requested API
```

The platform must never generate, retain, return, or receive a client private
key. The portal should provide a CLI or Postman/cURL instructions for mTLS.
The current server-side Playground cannot execute an mTLS request on behalf of
a developer because it does not own the developer's private key.

## Failure Modes

- An unauthenticated visitor can read public information but cannot provision a
  credential or consume protected sandbox APIs.
- A sandbox credential cannot access non-sandbox products or production
  deployments.
- A missing, expired, revoked, or untrusted client certificate fails at Envoy
  or is rejected by `mtls-auth`.
- Redis, PostgreSQL, CRL, or secret-manager failures must fail closed for
  sensitive issuance and authentication paths.
- A lost private key requires a new CSR and certificate issuance or rotation;
  it cannot be recovered from the platform.

## Constraints

- Keep public developer capabilities separate from administrator capabilities
  and authorization roles.
- Use public TLS certificates or a CA already installed in client trust stores;
  `--cacert` is a local-development aid, not a normal public-client step.
- Store OAuth signing keys, OIDC secrets, PKI master keys, and runtime
  certificates in managed secret storage rather than `.local-secrets`.
- Use public DNS and environment-specific gateway hosts, with rate limits,
  quotas, audit events, abuse protection, backups, and observability.
- Use isolated sandbox products, data, upstreams, and credentials. Do not use
  development seeds or local credentials in an internet-facing environment.

## Delivery Outline

1. Define sandbox tenants, products, quotas, and public gateway domains.
2. Deploy the current platform services with managed persistence, DNS, TLS,
   secret storage, and an external or hardened OIDC provider.
3. Create the developer self-service boundary and public portal without
   exposing administrator operations.
4. Add API key and OAuth onboarding and a sandbox Playground flow.
5. Add CSR-based mTLS issuance, a client CLI, certificate rotation, and
   revocation guidance.
6. Add operational controls: monitoring, alerts, abuse controls, backups, and
   security review before any production exposure.

## Sources

- [[Authentication and Authorization]]
- [[Multi-Client PKI]]
- [[Management API]]
- [[How to Use the Proxy Playground]]
