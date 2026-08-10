---
title: Debug Local Agent Pairing
type: runbook
doc_status: current
implementation_status: implemented
last_verified: 2026-08-10
tags:
  - type/runbook
  - area/operations
  - area/security
sources:
  - packages/gateway-cli/src/agent.ts
  - packages/gateway-cli/src/config.ts
  - packages/gateway-cli/src/identity-store.ts
  - packages/admin-panel/lib/local-agent.ts
  - packages/admin-panel/lib/use-local-agent.ts
aliases: []
---

# Debug Local Agent Pairing

> [!summary] At a glance
> Restore the browser-to-loopback connection without exposing private keys, pairing tokens, assertions, or local filesystem paths.

## Symptoms

- Playground remains `Local agent disconnected`.
- The connection dialog reports agent unavailable, Local Network Access denied,
  incompatible protocol, or approval required.
- Pairing reports an expired code, attempt limit, `origin_not_allowed`, or
  `session_invalid`.
- JWT signing reports audience, consumer-key, identity, or TTL errors.
- mTLS reports a missing certificate, key mismatch, or TLS trust failure.

## Impact

JWT assertion generation and local mTLS execution are unavailable. API key,
known-secret Client Credentials, and access-token requests remain independent.

## Diagnosis

1. Run `npm run gatewayctl -- agent status`.
2. Confirm the reported port is `43127`, or matches the deliberate CLI/UI
   override. `status` verifies the HTTP instance ID as well as recorded state.
3. Confirm the foreground `agent start` process remains running. A foreign
   process on the fixed port produces a port-collision error rather than agent
   state.
4. Compare the Admin Panel origin with `GATEWAYCTL_ALLOWED_ORIGINS`; scheme,
   hostname, and port must match exactly.
5. In Chrome or Edge site settings, confirm Local Network Access is allowed for
   the Admin Panel origin. The dialog distinguishes this denial from an absent
   process when Chromium exposes the permission state.
6. Request a fresh terminal code. Codes expire after two minutes and pairing
   challenges cannot be replayed.
7. Run `npm run gatewayctl -- agent clients list`. Expired or revoked trust
   requires a new approval; an active entry should show recent use.
8. Run `npm run gatewayctl -- keys list` and verify type, algorithm, fingerprint,
   and public certificate availability.
9. For JWT, compare the identity consumer-key binding with the selected
   credential and confirm the destination host matches an allowed audience.
10. For mTLS, confirm the identity has an installed certificate and that an
   imported key file still has owner-only permissions.
11. Inspect `~/.gatewayctl/agent-audit.ndjson` for operation code and status only.
   Do not add private keys or assertions to support logs.

## Resolution

```bash
npm run gatewayctl -- agent stop
npm run gatewayctl -- agent start
```

- Use `--port` and the matching advanced UI override only when `43127` cannot be
  used; prefer resolving a foreign port collision.
- Add the exact trusted UI origin to `GATEWAYCTL_ALLOWED_ORIGINS`.
- Revoke a stale browser entry, reconnect, and enter the new terminal code when
  browser storage and the trusted-client registry no longer match.
- Add only the required gateway hostname pattern to
  `GATEWAYCTL_ALLOWED_AUDIENCE_HOSTS`.
- Re-register a moved imported key with `keys add`.
- Regenerate a local identity if keychain ciphertext cannot be decrypted; then
  register a new JWK or issue a new certificate and revoke the old material.

## Verification

- Pairing succeeds once and the page shows `Local agent connected`.
- Reloading, opening a second tab, or restarting the foreground agent restores
  a session without another code while browser trust remains active.
- A JWT identity returns its public JWK and signs only an allowed audience.
- An mTLS identity executes the selected gateway URL without returning its
  private key or path.

## Escalation

Capture the protocol/agent version, instance ID, error code, operation name,
allowed-origin pattern, destination hostname, and redacted audit line. Never
attach the private key, consumer secret, session token, terminal code, browser
control key, or complete assertion.
