# API Gateway Platform

A TypeScript monorepo for a lightweight API gateway inspired by Google Apigee.

The platform loads proxy deployments from PostgreSQL, executes API key, OAuth,
mTLS, and rate-limit policies, and forwards HTTP traffic behind Envoy. Its
OIDC-protected control plane manages organization certificate authorities,
client certificate issuance, revocation, rotation, and audit state.

## Documentation

Open [`docs/`](docs/README.md) as an Obsidian vault or browse it directly:

- [Project Map](docs/00-map/Project%20Map.md)
- [Current Status](docs/00-map/Current%20Status.md)
- [How to Start the Project](docs/04-guides/How%20to%20Start%20the%20Project.md)
- [How to Manage the Local Platform Lifecycle](docs/04-guides/How%20to%20Manage%20the%20Local%20Platform%20Lifecycle.md)
- [Command Reference](docs/06-reference/Command%20Reference.md)

Validate documentation with:

```bash
npm run docs:index
npm run docs:check
```

## Development

```bash
npm run dev:local
```

This single command generates reusable local OAuth and encrypted PKI material,
builds the application image, migrates and seeds PostgreSQL, and starts Envoy,
the gateway, PostgreSQL, Redis, Keycloak, Management API, Admin Panel, and the
mock upstream.
Stop the foreground environment with `Ctrl+C`.

```bash
npm run dev:local:detached
npm run dev:local:down
```

The detached variant returns control to the terminal. See
[How to Start the Project](docs/04-guides/How%20to%20Start%20the%20Project.md)
for verification, data persistence, and troubleshooting.
See [How to Manage the Local Platform Lifecycle](docs/04-guides/How%20to%20Manage%20the%20Local%20Platform%20Lifecycle.md)
to resume retained containers without rerunning the seed setup.

- API ingress: `https://<stage>-<region>.gateway.localhost:8443`
- Example QUAL ES ingress: `https://qual-es.gateway.localhost:8443`
- Admin Panel: `http://localhost:8080`
- Local Keycloak: `http://localhost:8081`
