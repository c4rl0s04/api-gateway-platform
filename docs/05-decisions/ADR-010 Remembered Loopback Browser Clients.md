---
title: ADR-010 Remembered Loopback Browser Clients
type: decision
doc_status: current
implementation_status: implemented
decision_status: accepted
last_verified: 2026-08-10
tags:
  - type/decision
  - area/security
  - area/developer-platform
sources:
  - packages/gateway-cli/src/agent.ts
  - packages/gateway-cli/src/browser-auth.ts
  - packages/gateway-cli/src/runtime-state.ts
  - packages/gateway-cli/src/trusted-client-store.ts
  - packages/admin-panel/lib/browser-agent-identity.ts
  - packages/admin-panel/lib/local-agent.ts
  - packages/admin-panel/lib/use-local-agent.ts
aliases:
  - Reliable Loopback Agent Connection
---

# ADR-010 Remembered Loopback Browser Clients

> [!summary] At a glance
> Discover `gatewayctl` on a fixed loopback port, approve each browser once with a terminal code, and authenticate later sessions using a non-exportable browser key.

## Context

ADR-008 established the correct key-custody boundary but used a random port and
one-time data in a URL fragment. Reloads, new tabs, agent restarts, signed-out
redirects, and browser local-network controls made that connection difficult to
discover and recover.

The browser needs a durable identity without persisting an agent Bearer token or
making JWT and mTLS private keys available to JavaScript.

## Decision

- Bind the foreground agent to `127.0.0.1:43127` by default, with explicit CLI,
  environment, and per-browser port overrides.
- Expose only the versioned `/v1/status`, pairing, session-challenge, session,
  and closed RPC endpoints.
- Generate one non-exportable ECDSA P-256 browser-control key in IndexedDB.
- Persist only its public JWK, exact origin, client metadata, and absolute trust
  expiry in `~/.gatewayctl/trusted-clients.json`.
- Require an eight-character terminal code plus a signed, single-use challenge
  for first approval.
- Issue random 256-bit Bearer sessions for 15 minutes, retain only their hashes
  in agent memory, and renew them with fresh signed challenges.
- Keep trust for 30 days by default and allow local listing and immediate
  revocation through `gatewayctl agent clients`.
- Use browser Local Network Access, exact-origin CORS, request timeouts, and
  `targetAddressSpace: local`; never downgrade these controls for discovery.

The browser-control key authenticates a browser installation to the agent. It
cannot sign OAuth assertions, perform mTLS, or replace a client identity.

## Alternatives

- **Retain random-port fragment pairing:** rejected because discovery and
  reconnection depend on transient navigation state.
- **Persist Bearer sessions in browser storage:** rejected because a copied
  token would bypass proof of possession until expiry.
- **Use a browser extension or OS background service:** deferred because it
  adds installation, signing, update, and distribution requirements.
- **Upload client private keys:** rejected by the original trust boundary.
- **Expose a generic local command bridge:** rejected because the browser needs
  a small cryptographic API, not machine control.

## Consequences

- The agent is automatically discoverable after OIDC login and reconnects after
  reloads, new tabs, session expiry, and process restarts.
- First use still requires visible user approval in the terminal.
- Clearing browser site data creates a new browser identity that must be
  approved; restarting the agent does not.
- Chrome or Edge may require the user to grant Local Network Access explicitly.
- Public Admin Panel deployments require HTTPS and the exact public origin in
  `GATEWAYCTL_ALLOWED_ORIGINS`.
- Protocol v1 fragments and sessions are intentionally invalid.

## Related Implementation

- [[Local Client Agent Architecture]]
- [[gatewayctl Reference]]
- [[How to Connect Local Keys to the Playground]]
- [[Debug Local Agent Pairing]]
- [[ADR-008 Closed Loopback Client Agent]]
