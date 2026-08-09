---
title: How to Learn the Gateway with the Lab
type: guide
doc_status: current
implementation_status: implemented
last_verified: 2026-08-09
tags:
  - type/guide
  - area/developer-platform
  - area/admin-panel
sources:
  - packages/admin-panel/components/personal-lab-workspace.tsx
  - packages/admin-panel/components/lab-quick-playground.tsx
  - packages/admin-panel/components/lab-advanced-workspace.tsx
  - packages/management-api/src/services/lab-example.ts
aliases:
  - Personal Lab Tutorial
---

# How to Learn the Gateway with the Lab

> [!summary] At a glance
> Provision a disposable 24-hour workspace, run the seeded banking example, then create a complete proxy-to-credential chain without affecting shared platform configuration.

## Goal

Understand how upstream, proxy revision, deployment, product, app, credential,
policy, and runtime request fit together using the real gateway.

## Prerequisites

- Start the local platform with `npm run dev:local` or its detached variant.
- Sign in through OIDC at `http://localhost:8080`.
- Open `Personal lab` in the navigation.
- Connect [[gatewayctl Reference|gatewayctl]] only when testing mTLS or a
  client-owned JWT key.

## Steps

1. Select `Create personal lab`. Provisioning creates a hidden organization,
   lab CA, mock upstream, proxy revision 1, qual deployment, product, app, and
   first credential.
2. Store the displayed initial consumer secret if you need Client Credentials.
   It exists only in the current tab and cannot be read later.
3. Review `How the sample is connected`:

   ```text
   managed mock
   → Sample Banking Proxy revision 1
   → qual deployment at the workspace hostname
   → Sample Banking Product
   → Test Application and lab credential
   ```

4. In `Run the deployed sample`, execute:
   - `GET /accounts` to test API key plus rate limiting.
   - `POST /transfers` to obtain and use an OAuth access token through Client
     Credentials or a JWT Bearer assertion.
   - `GET /certificate-profile` to issue and execute mTLS through the local
     agent.
5. Use `Advanced workspace` in order:
   - Create a declarative mock or restricted public HTTPS upstream.
   - Import OpenAPI plus Gateway YAML and deploy revision 1 to a qual
     environment.
   - Create a product with scopes and proxy association.
   - Create an application and its first approved credential.
   - Customize the consumer key or rotate the one-time secret.
   - Inspect audit events for each mutation.
6. Import a second revision to change paths, targets, or policies. Deploy it and
   observe automatic hot reload; deploy the older revision to practice rollback.
7. Select `Reset` to revoke the current resources and rebuild a clean sample, or
   `Revoke workspace` when finished.

## Verification

- Runtime URL uses `<workspace-id>.lab.gateway.localhost:8443`.
- The sample API-key request returns `200` with the managed mock body.
- OAuth tokens contain the workspace ID and fail against another hostname.
- A deployed revision appears without restarting the gateway.
- Lab resources do not appear in standard organization, proxy, product,
  application, certificate authority, or audit lists.
- Identical base paths can exist in separate labs without conflict.

## Troubleshooting or Rollback

- `lab_limit_reached` means the OIDC user already created three labs in 24
  hours. Reuse the active workspace rather than creating another.
- `lab_expired` means the fixed 24-hour lifetime ended. Create a new workspace
  when the creation window permits it.
- `lab_upstream_blocked` means the public target or resolved address violates
  the egress boundary. Use a managed mock for private or authenticated APIs.
- `local_agent_required` means the selected flow needs a client-owned key.
- Check the workspace audit list and [[Debug Lab Isolation and Egress]] before
  resetting; reset intentionally revokes existing credentials.

