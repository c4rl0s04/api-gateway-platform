# API Gateway Platform

A TypeScript monorepo for a lightweight API gateway inspired by Google Apigee.

The implemented data plane loads proxy deployments from PostgreSQL, resolves
explicit endpoints, executes API key and rate-limit policies, and forwards HTTP
traffic. The Management API and Admin Panel are partial scaffolds.

## Documentation

Open [`docs/`](docs/README.md) as an Obsidian vault or browse it directly:

- [Project Map](docs/00-map/Project%20Map.md)
- [Current Status](docs/00-map/Current%20Status.md)
- [How to Start the Project](docs/04-guides/How%20to%20Start%20the%20Project.md)

Validate documentation with:

```bash
npm run docs:index
npm run docs:check
```

## Development

```bash
npm run dev:local
```

This single command generates reusable local signing keys and mTLS certificates,
builds the application image, migrates and seeds PostgreSQL, and starts
PostgreSQL, Redis, the mock upstream, `gateway-core`, and the mTLS ingress.
Stop the foreground environment with `Ctrl+C`.

```bash
npm run dev:local:detached
npm run dev:local:down
```

The detached variant returns control to the terminal. See
[How to Start the Project](docs/04-guides/How%20to%20Start%20the%20Project.md)
for verification, data persistence, and troubleshooting.
