---
title: shared
type: package
doc_status: current
implementation_status: implemented
last_verified: 2026-07-29
tags:
  - type/package
  - area/shared
sources:
  - packages/shared/package.json
  - packages/shared/src
  - packages/shared/test
aliases: []
---

# shared

> [!summary] At a glance
> `@api-gateway/shared` defines runtime-neutral routing, deployment, and policy contracts consumed across the monorepo.

## Responsibility

The package centralizes values that multiple packages must interpret
identically. It contains contract validation but no infrastructure access or
policy execution.

## Boundaries

- Defines `ProxyConfig` and `EndpointConfig`.
- Defines stage and region catalogs.
- Validates each environment's canonical HTTPS `publicOrigin`.
- Defines deployment progression helpers.
- Defines policy type catalogs and configuration schemas.
- Applies defaults and validates external policy configuration with Zod.

## Public Contracts

```typescript
interface ProxyConfig {
  id: string;
  name: string;
  basePath: string;
  deploymentId: string;
  environment: EnvironmentConfig;
  systemManaged: boolean;
  upstreamBaseUrl: string | null;
  endpoints: EndpointConfig[];
  organizationId: string;
  active: boolean;
}
```

`EndpointConfig.mode` is `forward | local`; local endpoints have nullable
`targetPath`. Use [[Policy Types]] to distinguish executable and planned types.

## Runtime Flow

Database records are converted into shared contracts during gateway startup.
`parsePolicyConfig()` selects the schema for each type before a policy reaches
the execution registry.

## Configuration

Policy configuration shares `failureMode: "open" | "closed"`.
`api-key-auth` adds a header name; `rate-limit` requires positive `limit` and
`windowSeconds` values. OAuth schemas enforce closed grants, maximum token TTL,
audiences, and scope lists.

## Tests

The package currently tests deployment catalogs and promotion progression.
Policy schema behavior is exercised mainly through gateway tests.

## Limitations

- A policy type in `POLICY_TYPES` does not mean its runtime factory exists.
- Some source comments still describe examples in Spanish; they do not alter the public contract.

## Related Notes

- [[Monorepo and Packages]]
- [[Database Schema]]
- [[Policy Types]]
