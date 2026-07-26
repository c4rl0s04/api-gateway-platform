---
title: Rate Limiting
type: policy
doc_status: current
implementation_status: implemented
last_verified: 2026-07-27
tags:
  - type/policy
  - area/policies
sources:
  - packages/gateway-core/src/policies/rate-limit/rate-limit.policy.ts
  - packages/shared/src/policies/config.ts
aliases:
  - rate-limit
---

# Rate Limiting

> [!summary] At a glance
> The implemented `rate-limit` policy uses an atomic Redis fixed window keyed by client identity, proxy, and time bucket.

## Current Support

The identifier is the authenticated `appId` when available, otherwise the
request IP. Redis executes increment, expiration, and limit evaluation in one
Lua script.

| Outcome | Behavior |
| --- | --- |
| Below limit | Continue |
| Above limit | `429`, `Retry-After`, and zero remaining |
| Redis failure with `closed` mode | `503` |
| Redis failure with `open` mode | Continue with `X-RateLimit-Policy: degraded` |

## Authoritative Values

```json
{
  "limit": 100,
  "windowSeconds": 60,
  "failureMode": "open"
}
```

Both numeric values must be positive integers.

## Examples

The response always includes `X-RateLimit-Limit` after this policy begins
execution. A limited response also includes `Retry-After` and
`X-RateLimit-Remaining: 0`.

## Source Files

- `packages/gateway-core/src/policies/rate-limit/rate-limit.policy.ts`
- `packages/shared/src/policies/config.ts`

## Related Notes

- [[Policy Reference Index]]
- [[Debug Policy Failure]]
