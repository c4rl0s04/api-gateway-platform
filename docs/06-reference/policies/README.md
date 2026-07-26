---
title: Policy Reference Index
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
aliases:
  - Policies Reference
---

# Policy Reference Index

> [!summary] At a glance
> This index separates implemented gateway policies from planned contracts and Apigee research references.

## Current Support

| Policy | Project status | Category |
| --- | --- | --- |
| [[API Key Verification]] | Implemented as `api-key-auth` | Security |
| [[Rate Limiting]] | Implemented as `rate-limit` | Traffic management |
| [[OAuth Token Issuance]] | Implemented as `oauth-token` | Security |
| [[OAuth Access Token Verification]] | Implemented as `oauth-access-token` | Security |
| [[mTLS Authentication]] | Implemented as `mtls-auth` | Security |
| [[OAuth 2.0]] | Implemented overview; JWKS uses `jwks-endpoint` | Security |
| [[JWT Validation]] | External direct JWT explicitly unsupported | Security |
| [[CORS]] | Contract only as `cors` | Security |
| [[Assign Message]] | Related to planned `transform` | Mediation |
| [[Message Logging]] | Related to planned `audit-log` | Extension |

## Apigee Research References

Security: [[OAuth 2.0]], [[Basic Authentication]], [[JWT Validation]], and
[[CORS]].

Traffic management: [[Spike Arrest]], [[Quota]], and
[[Concurrent Rate Limit]].

Mediation: [[Assign Message]], [[Extract Variables]], [[JSON to XML]],
[[XML to JSON]], and [[XSLT Transform]].

Extension: [[JavaScript Callout]], [[Service Callout]], [[Raise Fault]], and
[[Message Logging]].

These notes describe concepts for future design. They are not claims of runtime
support.

## Authoritative Sources

Use [[Policy Types]] for the accepted type catalog and
`packages/gateway-core/src/policies/registry.ts` for executable factories.

## Related Notes

- [[Policies in Apigee]]
- [[Request Lifecycle in Apigee]]
- [[Debug Policy Failure]]
