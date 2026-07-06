# 📦 shared

## Responsibility

The `shared` package contains **shared TypeScript types** used across the entire monorepo. It provides a single source of truth for the data structures that flow between packages.

> [!IMPORTANT]
> This package contains **only types** — no logic, no runtime code, no dependencies. It is a pure type library.

---

## Key Types

### `ProxyConfig`

Represents a fully loaded API proxy with its endpoints and policies. Used by `gateway-core` to build the routing table.

```typescript
interface ProxyConfig {
  id: string;
  name: string;
  basePath: string;
  targetUrl: string;
  isActive: boolean;
  endpoints: EndpointConfig[];
}
```

### `EndpointConfig`

Represents a single endpoint within a proxy.

```typescript
interface EndpointConfig {
  id: string;
  path: string;
  method: string;
  policies: PolicyConfig[];
}
```

### `PolicyConfig`

Represents a policy attached to an endpoint.

```typescript
interface PolicyConfig {
  id: string;
  name: string;
  type: PolicyType;
  configuration: Record<string, unknown>;
  executionOrder: number;
}
```

### `PolicyType`

Enum of supported policy types.

```typescript
enum PolicyType {
  RATE_LIMIT = 'rate-limit',
  API_KEY = 'api-key',
  CORS = 'cors',
  TRANSFORM = 'transform',
  CACHE = 'cache',
}
```

---

## Package Structure

```
packages/shared/
├── src/
│   ├── index.ts          # Re-exports all types
│   └── types/
│       ├── proxy.ts       # ProxyConfig, EndpointConfig
│       └── policy.ts      # PolicyConfig, PolicyType
├── package.json
└── tsconfig.json
```

---

## Used By

| Package | How |
| ------- | --- |
| `gateway-core` | Types for proxy loading and routing |
| `management-api` | Types for API request/response validation |
| `database` | Types aligned with Prisma models |

---

## Related Pages

- [[gateway-core]]
- [[database]]
- [[Monorepo and Packages]]
