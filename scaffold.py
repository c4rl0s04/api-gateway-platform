import os

def write_file(path, content):
    dir_name = os.path.dirname(path)
    if dir_name:
        os.makedirs(dir_name, exist_ok=True)
    with open(path, 'w') as f:
        f.write(content)

structure = {
    "README.md": """# API Gateway Platform

A multi-tenant API Gateway inspired by Apigee.

## Architecture
- **Data Plane (gateway-core)**: Fastify server handling proxying, policies, and rate-limiting.
- **Control Plane (management-api)**: Fastify server providing CRUD for organizations, proxies, products, and apps.
- **Admin Panel (admin-panel)**: Next.js dashboard for configuration.

## Getting Started
```bash
# Start infrastructure (Postgres, Redis, Prometheus, Grafana)
docker-compose up -d

# Install dependencies
npm install

# Run services
npm run dev
```

## Roadmap
- [ ] Week 1: Gateway Core base & Proxy Forwarding
- [ ] Week 2: Management API base & Data Model
- [ ] Week 3: Admin Panel scaffolding
- [ ] Week 4: Policies execution engine (Auth, Rate-Limit)
- [ ] Week 5: CI/CD Setup
- [ ] Week 6: Metrics & Monitoring integration
- [ ] Week 7: Advanced Policies (Transform, Validation)
- [ ] Week 8: Polish & Documentation
""",
    "package.json": """{
  "name": "api-gateway-platform",
  "version": "1.0.0",
  "private": true,
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "dev": "npm run dev --workspaces --if-present",
    "build": "npm run build --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "lint": "npm run lint --workspaces --if-present"
  }
}""",
    "tsconfig.base.json": """{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}""",
    ".gitignore": """node_modules
dist
.env
.next
coverage
""",
    ".env.example": """DATABASE_URL=postgresql://postgres:postgres@localhost:5432/apigw
REDIS_URL=redis://localhost:6379
JWT_SECRET=supersecret
""",
    "docker-compose.yml": """version: '3.8'

services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
      POSTGRES_DB: apigw
    ports:
      - "5432:5432"

  redis:
    image: redis:7
    ports:
      - "6379:6379"

  prometheus:
    image: prom/prometheus
    volumes:
      - ./infra/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"

  grafana:
    image: grafana/grafana
    environment:
      - GF_AUTH_ANONYMOUS_ENABLED=true
      - GF_AUTH_ANONYMOUS_ORG_ROLE=Admin
    volumes:
      - ./infra/grafana/provisioning:/etc/grafana/provisioning
      - ./infra/grafana/dashboards:/var/lib/grafana/dashboards
    ports:
      - "3000:3000"

  # TODO: gateway-core
  # TODO: management-api
  # TODO: admin-panel
""",
    ".github/workflows/ci.yml": """name: CI

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: password
          POSTGRES_DB: apigw
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7
        ports:
          - 6379:6379
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm install
      - run: npm run lint
      - run: npm run build
      - run: npm run test
""",
    "packages/gateway-core/package.json": """{
  "name": "gateway-core",
  "version": "1.0.0",
  "main": "dist/server.js",
  "scripts": {
    "dev": "ts-node src/server.ts",
    "build": "tsc",
    "test": "echo \\\"TODO: test\\\"",
    "lint": "echo \\\"TODO: lint\\\""
  },
  "dependencies": {
    "fastify": "^4.24.3",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "typescript": "^5.2.2",
    "ts-node": "^10.9.1",
    "@types/node": "^20.8.7"
  }
}""",
    "packages/gateway-core/tsconfig.json": """{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}""",
    "packages/gateway-core/Dockerfile": """# TODO: Dockerfile
FROM node:18-alpine
WORKDIR /app
""",
    "packages/gateway-core/src/server.ts": """import Fastify from 'fastify';

const server = Fastify({ logger: true });

server.get('/health', async (request, reply) => {
  return { status: 'ok' };
});

const start = async () => {
  try {
    await server.listen({ port: 3001, host: '0.0.0.0' });
    console.log('Gateway Core running on http://localhost:3001');
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};
start();
""",
    "packages/gateway-core/src/proxy/resolver.ts": """// stub: resuelve proxy por path
export const resolveProxy = () => {};
""",
    "packages/gateway-core/src/proxy/forwarder.ts": """// stub: forward HTTP con undici
export const forwardRequest = () => {};
""",
    "packages/gateway-core/src/policies/types.ts": """export type PolicyContext = {};
export type PolicyResult = {};
export type Policy = {};
""",
    "packages/gateway-core/src/policies/registry.ts": """// stub: registro de políticas por tipo
export const policyRegistry = {};
""",
    "packages/gateway-core/src/policies/auth/api-key.policy.ts": """// stub
""",
    "packages/gateway-core/src/policies/auth/jwt.policy.ts": """// stub
""",
    "packages/gateway-core/src/policies/rate-limit/rate-limit.policy.ts": """// stub
""",
    "packages/gateway-core/src/policies/transform/transform.policy.ts": """// stub
""",
    "packages/gateway-core/src/policies/validation/schema-validation.policy.ts": """// stub
""",
    "packages/gateway-core/src/policies/logging/audit-log.policy.ts": """// stub
""",
    "packages/gateway-core/src/config/env.ts": """import { z } from 'zod';

export const envSchema = z.object({
  PORT: z.string().optional().default('3001'),
});

// export const env = envSchema.parse(process.env);
""",
    "packages/gateway-core/src/metrics/prometheus.ts": """// stub: registro prom-client y endpoint /metrics
""",
    "packages/gateway-core/src/types/proxy-config.ts": """export type ProxyConfig = {};
""",
    "packages/gateway-core/test/health.test.ts": """// test real: GET /health devuelve 200
""",
    "packages/management-api/package.json": """{
  "name": "management-api",
  "version": "1.0.0",
  "main": "dist/server.js",
  "scripts": {
    "dev": "ts-node src/server.ts",
    "build": "tsc",
    "test": "echo \\\"TODO: test\\\"",
    "lint": "echo \\\"TODO: lint\\\""
  },
  "dependencies": {
    "fastify": "^4.24.3",
    "zod": "^3.22.4",
    "@prisma/client": "^5.5.2"
  },
  "devDependencies": {
    "typescript": "^5.2.2",
    "ts-node": "^10.9.1",
    "@types/node": "^20.8.7",
    "prisma": "^5.5.2"
  }
}""",
    "packages/management-api/tsconfig.json": """{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}""",
    "packages/management-api/Dockerfile": """# TODO: Dockerfile
FROM node:18-alpine
WORKDIR /app
""",
    "packages/management-api/src/server.ts": """import Fastify from 'fastify';

const server = Fastify({ logger: true });

server.get('/health', async (request, reply) => {
  return { status: 'ok' };
});

const start = async () => {
  try {
    await server.listen({ port: 3002, host: '0.0.0.0' });
    console.log('Management API running on http://localhost:3002');
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};
start();
""",
    "packages/management-api/src/routes/organizations.routes.ts": """// stub
""",
    "packages/management-api/src/routes/proxies.routes.ts": """// stub
""",
    "packages/management-api/src/routes/products.routes.ts": """// stub
""",
    "packages/management-api/src/routes/apps.routes.ts": """// stub
""",
    "packages/management-api/src/services/.gitkeep": """""",
    "packages/management-api/src/db/prisma/schema.prisma": """generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Organization {
  id        String   @id @default(uuid())
  name      String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
""",
    "packages/management-api/src/db/client.ts": """import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
""",
    "packages/management-api/src/middleware/admin-auth.middleware.ts": """// stub
""",
    "packages/management-api/src/config/env.ts": """import { z } from 'zod';

export const envSchema = z.object({
  PORT: z.string().optional().default('3002'),
  DATABASE_URL: z.string().min(1),
});
""",
    "packages/management-api/test/health.test.ts": """// stub
""",
    "packages/admin-panel/package.json": """{
  "name": "admin-panel",
  "version": "1.0.0",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "echo \\\"TODO: test\\\"",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "typescript": "^5.2.2",
    "@types/node": "^20.8.7",
    "@types/react": "^18.2.33",
    "@types/react-dom": "^18.2.14"
  }
}""",
    "packages/admin-panel/tsconfig.json": """{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}""",
    "packages/admin-panel/next.config.js": """/** @type {import('next').NextConfig} */
const nextConfig = {}
module.exports = nextConfig
""",
    "packages/admin-panel/app/layout.tsx": """export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
""",
    "packages/admin-panel/app/page.tsx": """export default function Dashboard() {
  return <h1>Dashboard</h1>;
}
""",
    "packages/admin-panel/app/proxies/page.tsx": """export default function Proxies() {
  return <h1>Proxies</h1>;
}
""",
    "packages/admin-panel/app/products/page.tsx": """export default function Products() {
  return <h1>Products</h1>;
}
""",
    "packages/admin-panel/app/apps/page.tsx": """export default function Apps() {
  return <h1>Apps</h1>;
}
""",
    "packages/admin-panel/components/.gitkeep": """""",
    "packages/admin-panel/lib/api-client.ts": """// stub: cliente fetch hacia management-api
""",
    "packages/shared/package.json": """{
  "name": "shared",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "dev": "tsc --watch",
    "build": "tsc",
    "test": "echo \\\"TODO: test\\\"",
    "lint": "echo \\\"TODO: lint\\\""
  },
  "devDependencies": {
    "typescript": "^5.2.2"
  }
}""",
    "packages/shared/tsconfig.json": """{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true
  },
  "include": ["src/**/*"]
}""",
    "packages/shared/src/index.ts": """export * from './types/common';
""",
    "packages/shared/src/types/common.ts": """export type ID = string;
""",
    "infra/prometheus/prometheus.yml": """global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'gateway-core'
    static_configs:
      - targets: ['gateway-core:3001']
""",
    "infra/grafana/provisioning/datasources/prometheus.yml": """apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    url: http://prometheus:9090
    access: proxy
    isDefault: true
""",
    "infra/grafana/provisioning/dashboards/dashboards.yml": """apiVersion: 1

providers:
  - name: 'Default'
    orgId: 1
    folder: ''
    type: file
    disableDeletion: false
    updateIntervalSeconds: 10
    options:
      path: /var/lib/grafana/dashboards
""",
    "infra/grafana/dashboards/.gitkeep": """""",
    "docs/architecture.md": """# Architecture

## Data Plane
The Gateway Core handles incoming requests, applies policies (auth, rate limiting), and forwards them to the backend services.

## Control Plane
The Management API manages configuration (proxies, products, apps, etc.) via a CRUD API.
""",
    "docs/data-model.md": """# Data Model

Entities:
- Organization
- Environment
- APIProxy
- Product
- DeveloperApp
""",
    "docs/policies.md": """# Policies

- Auth (API Key, JWT)
- Rate Limit
- Transform
- Validation
- Logging
""",
    "scripts/seed-dev.sh": """#!/bin/bash
# stub: script para levantar docker-compose y correr migraciones + seed
echo "TODO: seed-dev.sh"
"""
}

for path, content in structure.items():
    write_file(path, content)
