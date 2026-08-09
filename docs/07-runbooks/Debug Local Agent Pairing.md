---
title: Debug Local Agent Pairing
type: runbook
doc_status: current
implementation_status: implemented
last_verified: 2026-08-09
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
- Pairing reports `pairing_rejected`, `origin_not_allowed`, or
  `session_invalid`.
- JWT signing reports audience, consumer-key, identity, or TTL errors.
- mTLS reports a missing certificate, key mismatch, or TLS trust failure.

## Impact

JWT assertion generation and local mTLS execution are unavailable. API key,
known-secret Client Credentials, and access-token requests remain independent.

## Diagnosis

1. Run `npm run gatewayctl -- agent status`.
2. Confirm the foreground `agent start` process still owns the reported PID.
3. Compare the Admin Panel origin with `GATEWAYCTL_ALLOWED_ORIGINS`; scheme,
   hostname, and port must match exactly.
4. Start a fresh agent rather than reusing a consumed pairing URL.
5. Run `npm run gatewayctl -- keys list` and verify type, algorithm, fingerprint,
   and public certificate availability.
6. For JWT, compare the identity consumer-key binding with the selected
   credential and confirm the destination host matches an allowed audience.
7. For mTLS, confirm the identity has an installed certificate and that an
   imported key file still has owner-only permissions.
8. Inspect `~/.gatewayctl/agent-audit.ndjson` for operation code and status only.
   Do not add private keys or assertions to support logs.

## Resolution

```bash
npm run gatewayctl -- agent stop
npm run gatewayctl -- agent start
```

- Set the correct `GATEWAYCTL_PLAYGROUND_URL` before restart.
- Add the exact trusted UI origin to `GATEWAYCTL_ALLOWED_ORIGINS`.
- Add only the required gateway hostname pattern to
  `GATEWAYCTL_ALLOWED_AUDIENCE_HOSTS`.
- Re-register a moved imported key with `keys add`.
- Regenerate a local identity if keychain ciphertext cannot be decrypted; then
  register a new JWK or issue a new certificate and revoke the old material.

## Verification

- Pairing succeeds once and the page shows `Local agent connected`.
- A second use of the same URL is rejected.
- A JWT identity returns its public JWK and signs only an allowed audience.
- An mTLS identity executes the selected gateway URL without returning its
  private key or path.

## Escalation

Capture the agent version, error code, operation name, allowed-origin pattern,
destination hostname, and redacted audit line. Never attach the private key,
consumer secret, session token, pairing fragment, or complete assertion.

