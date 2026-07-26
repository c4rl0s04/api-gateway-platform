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
npm install
docker compose up -d postgres redis
npm run db:migrate:deploy --workspace=packages/database
npm run db:seed --workspace=packages/database
npm run db:seed:policies --workspace=packages/database
```

Start the mock upstream and gateway in separate terminals:

```bash
npm run mock-backend
npm run dev --workspace=packages/gateway-core
```

Do not start all workspaces together until the current local port collisions are
resolved. See [Ports](docs/06-reference/Ports.md).
