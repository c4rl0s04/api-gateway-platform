---
title: gatewayctl Reference
type: reference
doc_status: current
implementation_status: implemented
last_verified: 2026-08-10
tags:
  - type/reference
  - area/security
  - area/developer-platform
sources:
  - package.json
  - packages/gateway-cli/package.json
  - packages/gateway-cli/src/cli.ts
  - packages/gateway-cli/src/config.ts
  - packages/gateway-cli/src/identity-store.ts
  - packages/gateway-cli/src/operations.ts
aliases:
  - Local Agent CLI Reference
---

# gatewayctl Reference

> [!summary] At a glance
> Authoritative commands, configuration, and closed RPC surface for the local developer agent.

## Current Support

Run the repository-local CLI as:

```bash
npm run gatewayctl -- <command>
```

The command builds `@api-gateway/pki` and `@api-gateway/gatewayctl` before
executing the CLI. A packaged installation may invoke the same binary directly
as `gatewayctl`.

## Authoritative Values

### Identity commands

| Command | Result |
| --- | --- |
| `npm run gatewayctl -- keys generate --name <name> --type jwt [--consumer-key <key>]` | Generates an RSA 2048 RS256 identity encrypted under `GATEWAYCTL_HOME`. |
| `npm run gatewayctl -- keys generate --name <name> --type mtls --credential-id <id> [--algorithm rsa\|ec]` | Generates a separate client key and CSR; RSA is the default. |
| `npm run gatewayctl -- keys add --name <name> --type jwt --file <private.pem> [--consumer-key <key>]` | Registers a reference to an existing JWT key after validating ownership and permissions. |
| `npm run gatewayctl -- keys add --name <name> --type mtls --key <client.key> [--certificate <client.crt>] [--chain <chain.crt>]` | Registers existing mTLS material and verifies that certificate and key match. |
| `npm run gatewayctl -- keys list` | Returns public metadata only: ID, alias, type, source, algorithm, key fingerprint, public JWK, certificate availability, certificate fingerprint, and certificate expiration. |
| `npm run gatewayctl -- keys remove --id <identity-id>` | Removes metadata and agent-generated encrypted material; it does not delete an imported source key. |

Identity names match `[A-Za-z0-9][A-Za-z0-9._-]{0,127}`. JWT and mTLS
identities are deliberately not interchangeable.

### Agent commands

| Command | Result |
| --- | --- |
| `npm run gatewayctl -- agent start [--port <port>] [--open]` | Binds `127.0.0.1:43127` by default, writes verified runtime state, and remains in the foreground. `--open` opens the Playground without pairing data. |
| `npm run gatewayctl -- agent status` | Probes the recorded port and reports running only when the live instance ID matches local state. |
| `npm run gatewayctl -- agent stop` | Verifies the recorded live instance before requesting `SIGTERM`. `Ctrl+C` performs the same clean shutdown. |
| `npm run gatewayctl -- agent clients list` | Lists browser client ID, exact origin, label, trust dates, last use, and revocation state; no private key is stored. |
| `npm run gatewayctl -- agent clients revoke --id <client-id>` | Revokes browser trust and immediately invalidates its active agent sessions. |

First approval prints an eight-character code after the browser requests
pairing. The code expires after two minutes and permits five attempts. Pairing
and session challenges are signed with the browser's non-exportable P-256 key,
are single-use, and expire after 30 seconds. Bearer sessions last 15 minutes and
remain in tab memory only. Browser trust lasts 30 days by default.

### Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `GATEWAYCTL_HOME` | `~/.gatewayctl` | Manifest, encrypted generated keys, CSRs, installed public certificates, agent state, and local audit. |
| `GATEWAYCTL_PORT` | `43127` | Fixed IPv4 loopback port; range 1-65535. The CLI `--port` option overrides it for one start. |
| `GATEWAYCTL_TRUSTED_CLIENT_DAYS` | `30` | Absolute browser trust lifetime; range 1-365 days. |
| `GATEWAYCTL_ALLOWED_ORIGINS` | `http://localhost:8080` | Comma-separated exact browser origins accepted by CORS and pairing. |
| `GATEWAYCTL_ALLOWED_AUDIENCE_HOSTS` | `*.gateway.localhost,*.lab.gateway.localhost` | Comma-separated exact or left-wildcard HTTPS hosts allowed for assertions and mTLS requests. |
| `GATEWAYCTL_PLAYGROUND_URL` | `http://localhost:8080/playground` | Page opened only when `agent start --open` is used. It never contains pairing data. |
| `GATEWAYCTL_GATEWAY_CA_CERT_FILE` | Local development CA when present | Optional trust anchor for development gateway TLS. Public deployments should use publicly trusted server certificates. |

### Closed RPC methods

| Method | Purpose |
| --- | --- |
| `agent.status` | Version and supported-method discovery. |
| `identity.list` | Public local identity metadata. |
| `identity.remove` | Remove one explicitly selected local identity and agent-generated private material. Imported source key files are not deleted. |
| `jwt.generateKey` | Generate an encrypted local RS256 key. |
| `jwt.getPublicJwk` | Return only the selected public JWK and metadata. |
| `jwt.signAssertion` | Sign a 1-120 second JWT Bearer assertion for an allowed HTTPS audience. |
| `mtls.generateKeyAndCsr` | Generate a private key plus CSR and return the CSR. |
| `mtls.getCsr` | Return an existing CSR. |
| `mtls.installCertificate` | Install a public certificate and optional chain after key-match validation. |
| `mtls.executeRequest` | Execute an allowed HTTPS request locally using the selected certificate and key. |

There are no filesystem browsing, arbitrary URL, command, process, or shell
methods. Agent bodies are limited to 256 KiB; mTLS responses are limited to 1
MiB. Sensitive headers are removed from returned diagnostics.

## Examples

```bash
npm run gatewayctl -- keys generate \
  --name banking-jwt \
  --type jwt \
  --consumer-key ck_example

GATEWAYCTL_PLAYGROUND_URL=http://localhost:8080/lab \
  npm run gatewayctl -- agent start --open
```

## Source Files

- `packages/gateway-cli/src/cli.ts`
- `packages/gateway-cli/src/agent.ts`
- `packages/gateway-cli/src/identity-store.ts`
- `packages/gateway-cli/src/operations.ts`
- `packages/gateway-cli/test`

See [[Local Client Agent Architecture]], [[How to Connect Local Keys to the Playground]], and [[Debug Local Agent Pairing]].
