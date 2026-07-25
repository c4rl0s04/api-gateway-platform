# ADR-003: Prisma as ORM

| Field | Value |
| ----- | ----- |
| **Status** | ✅ Accepted |
| **Date** | 2026-07-06 |
| **Category** | Database |

---

## Context

The API Gateway Platform needs to interact with a PostgreSQL database from TypeScript. The team needed to choose a database access layer that provides:

- Type safety with TypeScript
- A migration system for schema evolution
- Easy setup and developer experience
- Good ecosystem support

---

## Decision

Use **Prisma** as the ORM for all database access.

### Key Reasons

| Feature | Benefit |
| ------- | ------- |
| **Type safety** | Auto-generated TypeScript types from the schema — no manual type definitions needed |
| **Auto-generated client** | `prisma generate` creates a fully typed client with autocomplete for all models |
| **Migration system** | `prisma migrate dev` handles schema changes with versioned SQL migrations |
| **Prisma Studio** | Built-in visual database browser for debugging and data inspection |
| **Ecosystem popularity** | Large community, extensive documentation, active development |
| **Declarative schema** | Single `schema.prisma` file as source of truth for the database structure |

---

## Alternatives Considered

### Raw SQL (pg / node-postgres)

Write SQL queries directly using the `pg` driver.

❌ **Rejected** — No type safety. Query results are `any` by default. No migration tooling. Manual mapping between rows and TypeScript objects.

### TypeORM

A popular TypeScript ORM using decorators and classes.

❌ **Rejected** — Decorator-heavy approach adds complexity. Class-based models feel heavy for a configuration-focused schema. Less intuitive migration workflow compared to Prisma.

### Drizzle ORM

A newer, lightweight TypeScript ORM with a SQL-like query builder.

❌ **Rejected** — Smaller ecosystem at the time of evaluation. Less mature migration tooling. No built-in visual browser like Prisma Studio.

### Knex.js

A SQL query builder for Node.js.

❌ **Rejected** — Query builder only, not a full ORM. No auto-generated types. Requires manual type definitions for all query results.

---

## Consequences

### ✅ Positive

- **Centralized** — All database access is consolidated in the `@api-gateway/database` package
- **Type-safe queries** — Compiler catches query errors at build time
- **Easy schema evolution** — Migrations are tracked and versioned
- **Great DX** — Prisma Studio, auto-completion, readable schema format

### ⚠️ Constraints

- **Migrations required** — Every schema change requires running `prisma migrate dev`
- **Generated folder gitignored** — `src/generated/` must be regenerated on each machine after cloning
- **Build step dependency** — Other packages must wait for `db:generate` and `build` before they can use the database package

---

## Related Pages

- [[Database and Prisma]]
- [[database]]
