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
| `npm run gatewayctl -- agent start` | Binds a random loopback port, writes runtime state, prints and opens the one-time pairing URL, and remains in the foreground. |
| `npm run gatewayctl -- agent status` | Reports whether the PID in local agent state is still running. |
| `npm run gatewayctl -- agent stop` | Requests `SIGTERM` for the recorded agent process. `Ctrl+C` performs the same clean shutdown in the foreground. |

The pairing nonce is 256 bits, single-use, and carried in the URL fragment.
The resulting origin-bound session lasts 30 minutes and is renewed by active
RPC calls.

### Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `GATEWAYCTL_HOME` | `~/.gatewayctl` | Manifest, encrypted generated keys, CSRs, installed public certificates, agent state, and local audit. |
| `GATEWAYCTL_ALLOWED_ORIGINS` | `http://localhost:8080` | Comma-separated exact browser origins accepted by CORS and pairing. |
| `GATEWAYCTL_ALLOWED_AUDIENCE_HOSTS` | `*.gateway.localhost,*.lab.gateway.localhost` | Comma-separated exact or left-wildcard HTTPS hosts allowed for assertions and mTLS requests. |
| `GATEWAYCTL_PLAYGROUND_URL` | `http://localhost:8080/playground` | Page opened by `agent start`. Use `/lab` when pairing directly with the lab portal. |
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
  npm run gatewayctl -- agent start
```

## Source Files

- `packages/gateway-cli/src/cli.ts`
- `packages/gateway-cli/src/agent.ts`
- `packages/gateway-cli/src/identity-store.ts`
- `packages/gateway-cli/src/operations.ts`
- `packages/gateway-cli/test`

See [[Local Client Agent Architecture]], [[How to Connect Local Keys to the Playground]], and [[Debug Local Agent Pairing]].
