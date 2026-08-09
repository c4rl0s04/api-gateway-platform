---
title: How to Connect Local Keys to the Playground
type: guide
doc_status: current
implementation_status: implemented
last_verified: 2026-08-09
tags:
  - type/guide
  - area/security
  - area/admin-panel
sources:
  - packages/gateway-cli/src/cli.ts
  - packages/gateway-cli/src/agent.ts
  - packages/gateway-cli/src/operations.ts
  - packages/admin-panel/components/playground-workspace.tsx
  - packages/admin-panel/components/lab-quick-playground.tsx
  - packages/admin-panel/lib/use-local-agent.ts
aliases:
  - Connect gatewayctl to the Playground
---

# How to Connect Local Keys to the Playground

> [!summary] At a glance
> Register a client-owned JWT or mTLS identity, pair `gatewayctl` with the Playground, and run real cryptographic flows without uploading the private key.

## Goal

Use a real application credential with JWT Bearer Grant or mTLS while the
private key remains on the developer machine.

## Prerequisites

- Start the platform and sign in to the Admin Panel.
- Select an app credential with an approved product grant.
- Ensure the system keychain is available when generating an identity.
- For imported keys, set restrictive owner-only file permissions.
- In non-local deployments, configure allowed browser origins, gateway hosts,
  and publicly trusted server TLS.

## Steps

### JWT Bearer assertion

1. Generate a dedicated signing identity:

   ```bash
   npm run gatewayctl -- keys generate \
     --name banking-jwt \
     --type jwt \
     --consumer-key <consumer-key>
   ```

2. Start and pair the local agent:

   ```bash
   npm run gatewayctl -- agent start
   ```

   Keep this foreground process running. It opens the Playground with a
   single-use fragment; the pairing value is not sent to the platform server.

3. In `JWT assertion`, select the application credential and local signing
   identity.
4. Select `Register public key`. Only the RSA JWK is written to the credential.
5. Select `Generate assertion`. The agent signs `iss = sub = consumerKey`, the
   selected token endpoint audience, a random `jti`, and a short expiration.
6. Send the token request, then use the returned gateway-signed access token on
   an operation protected by `oauth-access-token`.

### mTLS with a new key

The Lab and Playground show the same four-stage flow beside the mTLS controls:

```text
Generate locally → Issue on platform → Install locally → Connect from agent
```

| Stage | Owner | Material crossing the boundary |
| --- | --- | --- |
| Generate key and CSR | `gatewayctl` on the client machine | CSR only; the private key stays encrypted locally |
| Issue certificate | Management API and the credential's active CA | CSR enters; public certificate and chain leave |
| Install certificate | Browser hands public material to `gatewayctl` | Certificate and chain only |
| Connect | `gatewayctl` opens HTTPS to Envoy | TLS proof of private-key possession; the key itself never leaves |

1. In an mTLS operation, connect the agent and select `Generate CSR`.
2. Choose the application credential. The agent creates the key and returns
   only the CSR.
3. Select `Issue certificate`. Management API signs the CSR with the authorized
   CA and returns public certificate material.
4. The browser sends that certificate and chain back to the agent. The agent
   verifies the key match and installs them beside its encrypted identity.
5. Select `Run with local certificate`. The HTTPS connection originates from
   the developer machine and the browser receives only safe status, headers,
   body, and timing.

### mTLS with existing files

```bash
npm run gatewayctl -- keys add \
  --name banking-mtls \
  --type mtls \
  --key ./client.key \
  --certificate ./client.crt \
  --chain ./chain.crt
```

The imported private key remains at its original path. Losing or moving that
file makes the identity unusable until it is registered again.

## Verification

- `npm run gatewayctl -- agent status` reports `running: true`.
- The Playground displays `Local agent connected` and only public identity
  metadata.
- A registered JWT key appears under the selected credential with its `kid`.
- The assertion header uses `RS256`; decoded `iss` and `sub` match the consumer
  key; its lifetime is no more than 120 seconds.
- An mTLS response shows the selected certificate fingerprint but no private
  key or local path.
- `~/.gatewayctl/agent-audit.ndjson` contains operation names and outcomes, not
  complete assertions or key material.

## Troubleshooting or Rollback

- Start a new agent when pairing is expired or already consumed.
- Set `GATEWAYCTL_PLAYGROUND_URL=http://localhost:8080/lab` when the desired
  pairing page is the personal lab.
- Set `GATEWAYCTL_GATEWAY_CA_CERT_FILE` only for a development CA; a public
  deployment should use normal operating-system trust.
- Revoke the registered JWK or certificate through the appropriate API when a
  local key is lost.
- Remove a local alias with `npm run gatewayctl -- keys remove --id <id>`.
- See [[Debug Local Agent Pairing]] for origin, session, keychain, and audience
  errors.
