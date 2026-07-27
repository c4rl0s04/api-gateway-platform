---
title: "ADR-006 Envoy and Managed Client PKI"
type: decision
doc_status: current
implementation_status: implemented
decision_status: accepted
last_verified: "2026-07-27"
tags:
  - type/decision
  - area/security
sources:
  - infra/envoy/envoy.yaml
  - packages/pki/src/keystore.ts
  - packages/pki/src/trust.ts
  - packages/management-api/src/services/certificate-authorities.ts
aliases: []
---

# ADR-006 Envoy and Managed Client PKI

> [!summary] At a glance
> Use Envoy as the only HTTPS ingress, derive client identity from the live TLS connection, and manage organization-scoped CAs through encrypted keys plus dynamically reloaded public trust bundles.

## Context

A static Nginx configuration tied local mTLS to one generated client
certificate. Multi-client operation requires real per-connection identity, CA
rotation, CRLs, dynamic trust updates, and a clear boundary between client,
platform, and ingress key material.

## Decision

- Use Envoy on `8443` as the only host-published data-plane ingress.
- Validate client chains and CRLs in Envoy and replace any client-supplied
  fingerprint header with the SHA-256 fingerprint derived from the TLS leaf.
- Load the server certificate and client validation context through file SDS.
- Support organization-scoped managed and external CAs.
- Encrypt managed CA private keys with AES-256-GCM in a `KeyStore`; keep the
  master key outside PostgreSQL and Git.
- Keep client keys entirely client-side and issue only from validated CSRs.
- Treat `active` CAs as issuers, `retiring` CAs as trust-only, and `revoked` CAs
  as excluded from runtime trust.

## Alternatives

- Static Nginx certificate headers: rejected because identity was not derived
  dynamically for arbitrary clients and trust updates required regeneration.
- Store client private keys in the platform: rejected because it destroys the
  client ownership boundary and increases breach impact.
- Store managed CA keys in PostgreSQL: rejected because public configuration
  access would also expose signing authority.
- Restart ingress after every change: rejected because SDS supports atomic
  runtime updates without interrupting unrelated clients.
- One global CA: rejected because it prevents organization-level trust and
  lifecycle boundaries.

## Consequences

Envoy, SDS resources, CA/CRL bundle generation, encrypted keystore backup, and
OIDC-authorized lifecycle operations become security-critical. Revocation can
take effect without restarting the gateway. A retiring CA must remain in the
bundle until all clients migrate. The local file keystore is suitable for
development, but production requires a managed KMS/HSM-backed `KeyStore` and a
durable SDS control plane.

## Related Implementation

- [[Multi-Client PKI]]
- [[Deployment Model]]
- [[mTLS Authentication]]
- [[How to Configure Application Authentication]]
