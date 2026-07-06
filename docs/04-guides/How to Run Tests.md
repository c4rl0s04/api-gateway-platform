# 🧪 How to Run Tests

## Prerequisites

Before running tests, make sure:

1. ✅ Dependencies are installed (`npm install`)
2. ✅ PostgreSQL is running (`docker-compose up postgres -d`)
3. ✅ Database is migrated and seeded
4. ✅ Prisma Client is generated (`npm run db:generate --workspace=packages/database`)
5. ✅ Database package is built (`npm run build --workspace=packages/database`)

---

## Running Tests

```bash
npm test --workspace=packages/gateway-core
```

> [!NOTE]
> Tests are currently only in the `gateway-core` package. As other packages are implemented, they will have their own test suites.

---

## Test Descriptions

The test suite validates the core routing engine behavior:

| # | Test | What it verifies |
| - | ---- | ---------------- |
| 1 | **Longest prefix match** | The correct proxy is selected when multiple proxies share a common prefix |
| 2 | **Static vs dynamic priority** | Static endpoints (`/accounts/summary`) match before dynamic ones (`/accounts/:id`) |
| 3 | **Parameter extraction** | Dynamic segments (`:id`) are correctly extracted from the URL |
| 4 | **No proxy found** | Returns 404 when no proxy matches the request path |
| 5 | **No endpoint found** | Returns 404 when a proxy matches but no endpoint does |

---

## Expected Output

```
 ✓ should select the proxy with the longest matching basePath
 ✓ should prioritize static endpoints over dynamic ones
 ✓ should extract parameters from dynamic segments
 ✓ should return 404 when no proxy matches
 ✓ should return 404 when no endpoint matches

 Test Files  1 passed (1)
      Tests  5 passed (5)
```

---

## Troubleshooting

### ❌ Tests fail with database connection errors

Make sure PostgreSQL is running and the database is set up:
```bash
docker-compose up postgres -d
npm run db:migrate --workspace=packages/database
npm run db:seed --workspace=packages/database
```

### ❌ `Cannot find module` errors

Rebuild the dependencies:
```bash
npm run db:generate --workspace=packages/database
npm run build --workspace=packages/database
```

### ❌ Tests hang or timeout

Check that no other process is holding a database connection. Try resetting:
```bash
npm run db:reset --workspace=packages/database
```

---

## Related Pages

- [[gateway-core]]
