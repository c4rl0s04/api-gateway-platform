---
title: Policy Types
type: reference
doc_status: current
implementation_status: partial
last_verified: 2026-07-27
tags:
  - type/reference
  - area/policies
sources:
  - packages/shared/src/policies/config.ts
  - packages/gateway-core/src/policies/registry.ts
  - packages/gateway-core/src/policies
aliases: []
---

# Policy Types

> [!summary] At a glance
> Shared contracts recognize ten closed policy names; six have executable factories and the remainder are explicit planned placeholders.

## Current Support

| Policy type | Shared contract | Runtime factory | Reference |
| --- | --- | --- | --- |
| `api-key-auth` | Typed config | Implemented | [[API Key Verification]] |
| `rate-limit` | Typed config | Implemented | [[Rate Limiting]] |
| `oauth-token` | Typed config | Implemented | [[OAuth Token Issuance]] |
| `oauth-access-token` | Typed config | Implemented | [[OAuth Access Token Verification]] |
| `jwks-endpoint` | Typed terminal config | Implemented | [[OAuth 2.0]] |
| `mtls-auth` | Typed config | Implemented | [[mTLS Authentication]] |
| `transform` | Generic config | Planned | [[Assign Message]] |
| `schema-validation` | Generic config | Planned | [[JSON to XML]] |
| `audit-log` | Generic config | Planned | [[Message Logging]] |
| `cors` | Generic config | Planned | [[CORS]] |

Other Apigee policy notes in [[Policy Reference Index]] are research references
and are not accepted runtime type values.

## Authoritative Values

All policy configuration includes:

```typescript
type PolicyFailureMode = 'open' | 'closed';
```

`api-key-auth` adds `header`, defaulting to `x-api-key`.
`rate-limit` requires positive integer `limit` and `windowSeconds`.
OAuth configs define closed grants, TTL, audience, allowed/required scopes.
`mtls-auth` and `jwks-endpoint` currently add no fields beyond `failureMode`.

`jwt-auth` is deliberately absent. See [[JWT Validation]].

## Examples

```json
{
  "type": "rate-limit",
  "order": 2,
  "enabled": true,
  "config": {
    "limit": 100,
    "windowSeconds": 60,
    "failureMode": "open"
  }
}
```

## Source Files

- `packages/shared/src/policies/config.ts`
- `packages/gateway-core/src/policies/registry.ts`

## Related Notes

- [[Policies in Apigee]]
- [[Debug Policy Failure]]
- [[gateway-core]]
