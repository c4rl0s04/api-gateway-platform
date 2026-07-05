# API Gateway Platform

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

## 📅 Roadmap de Implementación

> **Nota de Diseño (Políticas):** En la semana 4, el motor de políticas se diseñará simulando el comportamiento exacto de Apigee. Las configuraciones de las políticas (AssignMessage, OAuth, etc.) se almacenarán y definirán usando formato **XML**. El `gateway-core` se encargará de parsear este XML a JSON en tiempo de carga y ejecutar la lógica en el flujo correspondiente (Request PreFlow, Target PostFlow, etc.).

### Semana 1: Setup y Gateway Core (Data Plane)
- [x] Estructura del monorepo (`npm workspaces`).

## Roadmap
- [ ] Week 1: Gateway Core base & Proxy Forwarding
- [ ] Week 2: Management API base & Data Model
- [ ] Week 3: Admin Panel scaffolding
- [ ] Week 4: Policies execution engine (Auth, Rate-Limit)
- [ ] Week 5: CI/CD Setup
- [ ] Week 6: Metrics & Monitoring integration
- [ ] Week 7: Advanced Policies (Transform, Validation)
- [ ] Week 8: Polish & Documentation
