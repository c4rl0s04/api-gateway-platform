---
title: gatewayctl
type: package
doc_status: current
implementation_status: implemented
last_verified: 2026-08-09
tags:
  - type/package
  - area/security
  - area/developer-platform
sources:
  - packages/gateway-cli/package.json
  - packages/gateway-cli/src
  - packages/gateway-cli/test
aliases:
  - gateway-cli
---

# gatewayctl

> [!summary] At a glance
> `@api-gateway/gatewayctl` owns the closed loopback agent and local JWT/mTLS identity store used by the Playground and Personal Lab.

## Responsibility

- Import or generate separate JWT and mTLS identities.
- Encrypt generated keys with AES-256-GCM and a system-keychain master key.
- Validate imported key ownership, permissions, algorithm, and certificate match.
- Pair one allowed browser origin through a single-use nonce.
- Sign constrained RS256 JWT Bearer assertions.
- Generate CSRs, install public certificates, and execute local mTLS requests.

## Boundaries

The package never exposes private keys, unrestricted paths, directory listing,
shell commands, process execution, or arbitrary destinations. It does not call
Management API directly; the browser registers public JWKs and submits CSRs.

## Public Contracts

- Binary: `gatewayctl`, available in-repository through `npm run gatewayctl --`.
- Commands: `keys add|generate|list|remove` and `agent start|status|stop`.
- Loopback HTTP: origin-checked `POST /pair`, `POST /rpc`, and CORS/PNA
  preflight.
- RPC allowlist documented in [[gatewayctl Reference]].

## Runtime Flow

`agent start` loads its profile, binds a random `127.0.0.1` port, creates a
single-use nonce, writes PID/port state, and opens the Playground URL fragment.
After pairing, each RPC verifies the origin and timing-safe Bearer session hash,
executes one named operation, and writes a redacted local audit line.

## Configuration

See [[Environment Variables]] and [[gatewayctl Reference]]. Local state defaults
to `~/.gatewayctl`; the generated-key master key is stored in the operating
system keychain under `api-gateway-platform.gatewayctl`.

## Tests

Package tests cover encrypted and imported identity lifecycle, key permissions,
pairing reuse/expiry/origin boundaries, closed method dispatch, JWT audience and
TTL, certificate installation, and mTLS execution constraints.

## Limitations

- The current binary is repository-local and not yet packaged, signed, or
  distributed for external developers.
- A supported operating-system keychain is mandatory for generated keys.
- The agent is foreground-oriented; no OS service installation is included.

