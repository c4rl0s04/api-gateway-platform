---
title: Debug Lab Isolation and Egress
type: runbook
doc_status: current
implementation_status: implemented
last_verified: 2026-08-09
tags:
  - type/runbook
  - area/operations
  - area/developer-platform
sources:
  - packages/database/src/lab-workspaces.ts
  - packages/database/src/lab-upstreams.ts
  - packages/gateway-core/src/db/proxy-loader.ts
  - packages/lab-egress/src/security.ts
  - packages/lab-egress/src/server.ts
aliases: []
---

# Debug Lab Isolation and Egress

> [!summary] At a glance
> Diagnose missing lab routes, cross-workspace authorization rejection, hot-reload convergence, and blocked public upstreams without weakening ownership or SSRF controls.

## Symptoms

- Lab API returns `lab_expired`, `lab_resource_not_found`, or
  `lab_limit_reached`.
- Workspace hostname returns `421`, `404`, `401`, or `403`.
- Deployment remains queued in runtime sync.
- Public upstream returns `lab_upstream_blocked`.
- Lab data appears in a standard Management API list.

## Impact

Only the affected personal workspace should be unavailable. Cross-workspace or
standard-plane data exposure is a security incident, not a routing workaround.

## Diagnosis

1. Call `GET /api/lab/workspace` with the same OIDC identity used to create it.
2. Confirm `status = active` and `expiresAt` is in the future.
3. Compare the request hostname with the exact workspace hostname.
4. Check the proxy deployment is active, belongs to the same workspace, and
   references a qual environment.
5. Read the deployment `runtimeSync.version`, then inspect the standard
   `/api/management/runtime-sync` state as a platform administrator.
6. For `401/403`, confirm credential, product grant, proxy, environment, and
   token `workspace_id` all belong to this workspace.
7. For public egress, inspect protocol, explicit port, DNS results, and every
   redirect. Only HTTPS port 443 with public addresses is valid.
8. Query `GET /api/lab/audit-events` for the mutation and resulting resource ID.
9. As a platform administrator, verify standard organizations, proxies,
   products, apps, authorities, certificates, and audit lists exclude lab data.

## Resolution

- Wait for or diagnose outbox reconciliation; do not restart the gateway as a
  routine deployment step.
- Correct the selected workspace hostname or recreate the credential/grant
  inside the current lab.
- Use a managed mock when the desired upstream is private, authenticated, on a
  non-443 port, or not safe for public egress.
- Reset the lab only when existing credentials and routes may be revoked.
- Create a new lab after expiry if the 24-hour creation limit allows it.
- Never add private CIDRs, metadata hosts, or arbitrary redirects to an allowlist
  merely to make a test pass.

## Verification

- Workspace API key and OAuth calls succeed only on their own hostname.
- The same credential or access token fails against another workspace and a
  standard environment hostname.
- Gateway applied version reaches the deployment's outbox version.
- Managed mock or approved public HTTPS upstream returns within size and timeout
  limits.
- Standard catalog queries contain no lab organization or resource.

## Escalation

Treat any cross-workspace success, lab data in standard lists, private-network
egress, or internal identity header leakage as a security defect. Preserve
workspace ID, outbox version, gateway instance state, safe hostname, status, and
audit event; redact credentials and tokens.

