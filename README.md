# API Gateway Platform

A TypeScript monorepo for a lightweight API gateway inspired by Google Apigee.

The platform loads proxy deployments from PostgreSQL, executes API key, OAuth,
mTLS, and rate-limit policies, and forwards HTTP traffic behind Envoy. Its
OIDC-protected control plane manages organization certificate authorities,
client certificate issuance, revocation, rotation, and audit state.

## Tech Stack

![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white)
![Envoy](https://img.shields.io/badge/Envoy-F83E7D?style=for-the-badge&logo=envoyproxy&logoColor=white)

- **Core**: Node.js, TypeScript (npm workspaces)
- **Frontend**: Next.js 14, React 18
- **Data & Auth**: PostgreSQL, Redis, Keycloak (OIDC)
- **Proxy**: Envoy

## Prerequisites

Before starting the project, ensure you have the following installed:
- **Node.js**: `>=22.19.0`
- **Docker** & **Docker Compose**

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

### Testing

To run the unit tests across all workspaces:
```bash
npm run test
```

To run isolated platform integration tests (Envoy, Management API, etc):
```bash
npm run test:platform
```

- API ingress: `https://<stage>-<region>.gateway.localhost:8443`
- Example QUAL ES ingress: `https://qual-es.gateway.localhost:8443`
- Admin Panel: `http://localhost:8080`
- Local Keycloak: `http://localhost:8081`
