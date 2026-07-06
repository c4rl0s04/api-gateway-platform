# 🚀 How to Start the Project

## Prerequisites

| Requirement | Minimum Version | Check Command |
| ----------- | -------------- | ------------- |
| **Node.js** | v20+ | `node --version` |
| **npm** | v9+ (comes with Node) | `npm --version` |
| **Docker** | Latest | `docker --version` |
| **Docker Compose** | Latest (included in Docker Desktop) | `docker compose version` |

---

## Step-by-Step Setup

### 1. Install Dependencies

```bash
npm install
```

> This installs dependencies for **all packages** in the monorepo thanks to npm workspaces.

### 2. Start PostgreSQL

```bash
docker-compose up postgres -d
```

> [!NOTE]
> This starts PostgreSQL on port `5432` in the background. The `-d` flag runs it in detached mode.

### 3. Generate Prisma Client

```bash
npm run db:generate --workspace=packages/database
```

> Generates the typed Prisma Client from `schema.prisma`. Required before any database operation.

### 4. Build the Database Package

```bash
npm run build --workspace=packages/database
```

> Compiles TypeScript so other packages can import from `@api-gateway/database`.

### 5. Run Migrations

```bash
npm run db:migrate --workspace=packages/database
```

> Creates all tables in PostgreSQL based on the Prisma schema.

### 6. Seed the Database

```bash
npm run db:seed --workspace=packages/database
```

> Populates the database with sample organizations, environments, proxies, endpoints, and policies.

### 7. Start the Mock Backend (Terminal 1)

```bash
npm run mock-backend
```

> Starts `json-server` on **port 4000**. This simulates the backend services that the gateway forwards requests to.

### 8. Start the Gateway (Terminal 2)

Open a **new terminal** and run:

```bash
npm run dev --workspace=packages/gateway-core
```

> Starts `gateway-core` on **port 3000** with hot-reload enabled.

---

## ✅ Expected Result

When the gateway starts successfully, you should see output similar to:

```
[INFO] proxiesLoaded: 10
[INFO] Server listening on http://localhost:3000
```

The `proxiesLoaded: 10` message confirms that the gateway has read proxy configurations from the database and built its routing table.

---

## Quick Test

Test that the gateway is routing correctly:

```bash
# Test a proxied endpoint
curl http://localhost:3000/es/banking/v1/accounts

# Test with a specific ID
curl http://localhost:3000/es/banking/v1/accounts/1

# Test a different proxy
curl http://localhost:3000/es/insurance/v1/policies
```

You should receive JSON responses from the mock backend.

---

## Troubleshooting

### ❌ `Connection refused` on port 5432

PostgreSQL is not running. Start it with:
```bash
docker-compose up postgres -d
```

### ❌ `Cannot find module '@api-gateway/database'`

The database package hasn't been built. Run:
```bash
npm run db:generate --workspace=packages/database
npm run build --workspace=packages/database
```

### ❌ `proxiesLoaded: 0`

The database has no seed data. Run:
```bash
npm run db:seed --workspace=packages/database
```

### ❌ `502 Bad Gateway` on requests

The mock backend is not running. Start it in a separate terminal:
```bash
npm run mock-backend
```

### ❌ Port 3000 already in use

Another process is using port 3000. Either stop it or change the `PORT` in `.env`:
```bash
lsof -i :3000
kill -9 <PID>
```

---

## Related Pages

- [[gateway-core]]
- [[database]]
