---
title: ADR-008 Closed Loopback Client Agent
type: decision
doc_status: current
implementation_status: implemented
decision_status: accepted
last_verified: 2026-08-09
tags:
  - type/decision
  - area/security
  - area/developer-platform
sources:
  - packages/gateway-cli/src/agent.ts
  - packages/gateway-cli/src/operations.ts
  - packages/gateway-cli/src/identity-store.ts
  - packages/admin-panel/lib/local-agent.ts
aliases: []
---

# ADR-008 Closed Loopback Client Agent

> [!summary] At a glance
> Use an origin-bound loopback agent with a fixed cryptographic RPC allowlist so the web interface can request signatures and mTLS connections without obtaining client private keys or arbitrary machine access.

## Context

JWT Bearer Grant and mTLS require client-owned private keys. Uploading those
keys to the Admin Panel or BFF would violate the trust model. A browser cannot
reliably access existing filesystem keys or issue an mTLS request with arbitrary
client certificates, and a remote terminal would create an unacceptable command
execution surface.

## Decision

Implement `gatewayctl` as a local process that:

- binds only a random `127.0.0.1` port;
- pairs through a 256-bit single-use nonce in a URL fragment;
- binds a 30-minute renewable session to an exact configured origin;
- exposes only identity metadata, RS256 assertion, CSR, certificate install, and
  mTLS request operations;
- encrypts generated private keys with AES-256-GCM using a system-keychain master
  key;
- retains imported keys as validated local references;
- records redacted local operation audit events.

No general filesystem, directory, process, command, shell, or arbitrary proxy
operation is part of the protocol.

## Alternatives

- **Upload private keys to the platform:** rejected because compromise of the
  browser, BFF, logs, or database could expose client identity material.
- **Browser WebCrypto only:** retained as an optional quick lab JWT path, but it
  cannot use existing keys or provide the realistic mTLS workflow.
- **Generate keys on the server:** rejected because the platform would become
  custodian of client private keys.
- **Remote terminal or generic local bridge:** rejected because it expands the
  attack surface beyond the required cryptographic operations.
- **Manual CLI output only:** secure but too disconnected from the Playground
  to guide registration, issuance, and request execution coherently.

## Consequences

- A developer must run one local command before using client-owned key flows.
- Origin and audience configuration must be correct for each deployment.
- The browser receives assertions and public certificate material, but never a
  private key or unrestricted local path.
- Pairing, keychain, and endpoint compatibility require dedicated tests and
  troubleshooting.
- JWT and mTLS operations can be reused by a future Developer Portal without
  changing the key custody model.

## Related Implementation

- [[Local Client Agent Architecture]]
- [[gatewayctl Reference]]
- [[How to Connect Local Keys to the Playground]]
- [[Debug Local Agent Pairing]]

