---
title: Debug Policy Failure
type: runbook
doc_status: current
implementation_status: partial
last_verified: 2026-07-27
tags:
  - type/runbook
  - area/policies
sources:
  - packages/gateway-core/src/policies/pipeline.ts
  - packages/gateway-core/src/policies/registry.ts
  - packages/gateway-core/src/policies/auth/api-key.policy.ts
  - packages/gateway-core/src/policies/rate-limit/rate-limit.policy.ts
aliases: []
---

# Debug Policy Failure

> [!summary] At a glance
> Separate normal policy denials from dependency failures before changing `failureMode` or infrastructure.

## Symptoms

Typical statuses are `401`, `403`, `429`, or `503`. Startup can also fail when
policy type or configuration validation is invalid.

## Impact

The policy pipeline can halt before the upstream receives the request.

## Diagnosis

1. Identify the policy type and endpoint from logs.
2. `401`: verify the configured header, credential existence, and active state.
3. `403`: verify that a credential product includes the current proxy and environment.
4. `429`: inspect `Retry-After` and `X-RateLimit-*` headers.
5. `503`: inspect dependency logs and the policy's `failureMode`.
6. Startup failure: compare the stored type with [[Policy Types]] and validate required config.
7. OAuth, Bearer, or mTLS failure: continue with [[Debug OAuth and mTLS]].

## Resolution

- Correct credentials or product relationships for normal authorization denials.
- Restore PostgreSQL for `api-key-auth` dependency failures.
- Restore Redis for `rate-limit` dependency failures.
- Use `failureMode: open` only when degraded operation is an explicit product decision.
- Do not store a contract-only policy type on an active endpoint until its factory exists.

## Verification

Repeat the request and confirm policy ordering, expected headers, and whether the
upstream was called.

## Escalation

Escalate unexpected `503` responses with the request ID, policy type, proxy ID,
endpoint ID, and dependency error log.
