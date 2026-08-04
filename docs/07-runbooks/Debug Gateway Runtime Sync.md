---
title: "Debug Gateway Runtime Sync"
type: runbook
doc_status: current
implementation_status: implemented
last_verified: "2026-08-02"
tags:
  - type/runbook
  - area/operations
  - area/gateway-core
sources:
  - packages/gateway-core/src/runtime-sync/reloader.ts
  - packages/management-api/src/runtime-sync/publisher.ts
  - packages/management-api/src/services/runtime-sync.ts
  - packages/database/src/gateway-config-changes.ts
aliases: []
---

# Debug Gateway Runtime Sync

> [!summary] At a glance
> Diagnose a routing change that remains queued, is not visible in a gateway, or causes a runtime instance to report an invalid snapshot.

## Symptoms

- A deployment response remains visually in `queued` state.
- `GET /runtime-sync` shows a gateway behind `latestVersion`.
- `pendingChanges` stays above zero.
- A gateway reports `state: error` and retains an older `appliedVersion`.

## Impact

The database mutation and deployment history are preserved, but one or more
gateway instances may continue serving their last valid routing snapshot.

## Diagnosis

1. Call `GET http://localhost:8080/api/management/runtime-sync` with an OIDC
   Bearer token.
2. Compare `latestVersion` with each live gateway's `appliedVersion`.
3. If `redisAvailable` is false or `pendingChanges` is non-zero, inspect Redis
   and Management API logs.
4. If an instance reports `state: error`, inspect `lastError` and validate the
   active deployments, upstreams, base paths, operations, and policies.
5. Confirm `GATEWAY_INSTANCE_ID` values are unique and the gateway and
   Management API use the same `REDIS_URL` and PostgreSQL database.

## Resolution

- Restore Redis connectivity; the outbox dispatcher republishes pending rows.
- Correct invalid active configuration through a new revision, rollback,
  deployment retirement, or proxy deactivation.
- Wait one reconciliation interval after restoring a disconnected gateway.
- Do not edit outbox versions or in-memory state manually.

## Verification

The affected instance reports `state: applied`, its `appliedVersion` is at least
`latestVersion`, `synchronized` is true, and the expected route resolves without
restarting the gateway.

## Escalation

If PostgreSQL has the intended active deployment but all instances repeatedly
reject the snapshot, preserve the `lastError`, active revision sources, and
deployment IDs for investigation. The last valid snapshot should continue to
serve traffic.
