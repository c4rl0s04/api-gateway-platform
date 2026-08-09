---
title: How to Connect Local Keys to the Playground
type: guide
doc_status: current
implementation_status: implemented
last_verified: 2026-08-10
tags:
  - type/guide
  - area/security
  - area/admin-panel
sources:
  - packages/gateway-cli/src/cli.ts
  - packages/gateway-cli/src/agent.ts
  - packages/gateway-cli/src/identity-store.ts
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

### mTLS in the standard Playground

The standard Playground is an execution surface, not a certificate-management
surface. The client obtains its certificate before testing the proxy:

```text
Client owns key + certificate
→ administrator registers CRT on the application credential
→ client imports key + CRT into gatewayctl
→ Playground matches the certificate fingerprint
→ gatewayctl opens the mTLS connection
```

| Stage | Owner | Material crossing the boundary |
| --- | --- | --- |
| Obtain certificate | Client and its certificate authority | Public CRT and optional chain go to the administrator |
| Register certificate | Application administrator | CRT and chain only; never the private key |
| Import local identity | Certificate owner | Key and certificate paths remain inside `gatewayctl` |
| Connect | `gatewayctl` opens HTTPS to Envoy | TLS proof of private-key possession; the key itself never leaves |

1. Open the application detail under `Applications`.
2. On the intended credential, select `Register certificate` and upload the
   client CRT, optional intermediate chain, and trusted organization CA.
3. On the certificate-owner machine, import the matching private key and CRT
   using the command builder described below.
4. Start and pair the agent, then choose the local certificate identity. The
   Playground resolves its platform record from the SHA-256 fingerprint; no
   application credential is selected or modified here.
5. Select `Run with local certificate`. Execution is enabled only when the
   certificate is approved, current, and attached to a credential authorized
   for the selected proxy.

### Manage the Lab mTLS identity lifecycle

The Personal Lab deliberately retains generation and issuance controls so a
user can learn the complete lifecycle without changing standard applications:

| Action | Local private key | Platform certificate |
| --- | --- | --- |
| `Create new identity` | Creates a new encrypted key and CSR under a unique local alias | Unchanged until `Issue certificate` |
| `Issue certificate` | Reuses the selected key and installs the returned public certificate | Creates an approved certificate for the selected credential |
| `Renew certificate` | Preserves the selected private key and CSR | Issues and installs a replacement, then revokes the previous approved certificate |
| `Revoke certificate` | Preserves the local identity so it can request a replacement | Immediately marks the selected certificate revoked |
| `Remove local identity` | Removes the local alias and agent-generated private material | Does not revoke an active platform certificate |

Create another identity when a different key pair is required. Renew when the
same private key should receive a fresh short-lived certificate. Revoke before
removing a lost, compromised, or no-longer-used identity; deleting only the
local material cannot prove to the platform that its certificate should stop
being trusted.

The Lab selector may contain several identities for the same credential. It
matches the certificate using its SHA-256 fingerprint and enables `Run with
certificate` only while the matching platform record is approved and unexpired.

### mTLS with existing files

Expand `Use an existing certificate` under `Local certificate client`. Enter
the local identity name and key, certificate, and optional chain paths. The
Playground builds the command locally and provides a copy action; those paths
are not sent to the platform.

```bash
npm run gatewayctl -- keys add \
  --name banking-mtls \
  --type mtls \
  --key ./client.key \
  --certificate ./client.crt \
  --chain ./chain.crt
```

Run the copied command in a terminal, then select `Refresh local identities` in
the Playground. The selector shows installed certificate identities and labels
each one as authorized, unregistered, revoked, expired, or unauthorized for the
selected proxy. The imported private key remains at its original path. Losing
or moving that file makes the identity unusable until it is registered again.

## Verification

- `npm run gatewayctl -- agent status` reports `running: true`.
- The Playground displays `Local agent connected` and only public identity
  metadata.
- A registered JWT key appears under the selected credential with its `kid`.
- The assertion header uses `RS256`; decoded `iss` and `sub` match the consumer
  key; its lifetime is no more than 120 seconds.
- An mTLS response shows the selected certificate fingerprint but no private
  key or local path.
- The identity status shows the public certificate fingerprint, expiration,
  and whether the matching platform record is active, expired, or revoked.
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
- Revoke an active certificate before selecting `Remove local identity` when
  the platform must stop accepting it.
- Remove a local alias from the UI or with
  `npm run gatewayctl -- keys remove --id <id>`.
- See [[Debug Local Agent Pairing]] for origin, session, keychain, and audience
  errors.
