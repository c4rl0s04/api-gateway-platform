---
title: Seed Example Catalog
type: reference
doc_status: current
implementation_status: implemented
last_verified: 2026-07-31
tags:
  - type/reference
  - area/database
sources:
  - packages/database/src/seed.ts
  - packages/database/src/seed-policies.ts
  - packages/database/src/seed-proxy-scenarios.ts
  - packages/database/test/seed-proxy-scenarios.test.ts
  - scripts/test-seed-examples.sh
aliases:
  - Development Seed Examples
---

# Seed Example Catalog

> [!summary] At a glance
> A clean local seed creates 16 immutable revisions and 48 deployment records that demonstrate active history, promotion, rollback, undeployed changes, policy inheritance, and every implemented authentication policy.

## Current Support

The base seed creates 9 organizations, 30 closed environments, and 11 logical
proxies. The policy seed adds 8 products, 9 apps, 9 credentials, explicit
approved grants, OAuth and mTLS material, revision bundles, and deployment
history. Rerunning either seed is idempotent.

## Authoritative Values

| Proxy | Revisions | Active deployment | Example |
| --- | ---: | --- | --- |
| Platform OAuth | 1 | All 30 environments | Local token and JWKS operations |
| ES Banking | 3 | Revision 2 in `qual-es` and `pprod-es` | Revision 1 retired; revision 3 undeployed |
| US Banking | 2 | Revision 2 in `qual-us` | API-key header changes to `x-partner-key` |
| UK Logistics | 1 | Same revision in `qual-uk`, `pprod-uk`, and `prod-uk` | Exact-revision promotion |
| FR E-commerce | 2 | Revision 1 in `qual-fr` | Deployment history is revision 1, 2, then rollback to 1 |
| ES E-commerce | 2 | Revision 2 in `qual-es` | Rate limit changes to OAuth defaults |
| DE Healthcare | 1 | Revision 1 in `qual-de` | OAuth Bearer defaults with a public ping override |
| US Identity | 1 | Revision 1 in `qual-us` | API key and OAuth operations |
| JP IoT | 1 | Revision 1 in `qual-jp` | OAuth Bearer plus fail-closed rate limiting |
| BR Streaming | 1 | Revision 1 in `qual-br` | Public rate limiting and a disabled policy |
| KR Gaming | 1 | Revision 1 in `qual-kr` | Inherited API key plus rate limiting |

A clean seed contains 43 active and 5 retired deployment records. ES Banking
revision 2 accounts for two active environments; its revision 3 changes the
base path to `/es/banking/v2` but has no deployment.

The policy examples cover:

- Revision-level defaults and operation-level complete replacement.
- Explicit public operations using `policies: []`.
- API key headers `x-api-key` and `x-partner-key`.
- OAuth access-token scopes from eight products.
- Direct mTLS on ES Banking health.
- Open and closed Redis failure modes.
- Enabled and disabled policies.
- Multiple HTTP methods on the same OpenAPI path.

## Examples

Representative development consumer keys are:

| Product | Consumer key |
| --- | --- |
| Banking APIs | `dev-bank-key-abc123` |
| Logistics APIs | `dev-logistics-key-001` |
| Commerce APIs | `dev-commerce-key-001` |
| Healthcare APIs | `dev-healthcare-key-001` |
| Identity APIs | `dev-id-key-def456` |
| IoT APIs | `dev-iot-key-001` |
| Streaming APIs | `dev-streaming-key-001` |
| Gaming APIs | `dev-gaming-key-001` |

Run the complete live verification with:

```bash
npm run test:integration:seed-examples
```

It checks PostgreSQL history, active revision selection, promotion, rollback,
the undeployed revision, API-key defaults and custom headers, OAuth scopes,
public operations, disabled policies, and seed idempotency.

## Source Files

- `packages/database/src/seed-proxy-scenarios.ts`
- `packages/database/src/seed-policies.ts`
- `packages/database/test/seed-proxy-scenarios.test.ts`
- `scripts/test-seed-examples.sh`
