# ➕ How to Add a New Proxy

> [!WARNING]
> 🔲 **Will be completed when the Management API is built.** The proper workflow will be to use the admin panel or the Management API endpoints.

## Current Workarounds

Until the Management API is implemented, you can add new proxies using these methods:

---

### Option 1: Modify the Seed Script

Edit `packages/database/src/seed.ts` to include your new proxy, then re-run:

```bash
npm run db:reset --workspace=packages/database
```

> [!CAUTION]
> `db:reset` will **delete all existing data** and re-seed from scratch. Use this only in development.

---

### Option 2: Prisma Studio

1. Open Prisma Studio: `npm run db:studio --workspace=packages/database`
2. Navigate to the **ApiProxy** table
3. Click **Add record**
4. Fill in: `name`, `basePath`, `targetUrl`, `environmentId`, `isActive`
5. Save the record
6. Add related **Endpoint** records for the proxy
7. **Restart the gateway** to pick up the new configuration

See [[How to Use Prisma Studio]] for more details.

---

### Option 3: Raw SQL

Connect to PostgreSQL directly and insert records:

```bash
docker exec -it api-gateway-postgres psql -U postgres -d gateway
```

```sql
INSERT INTO "ApiProxy" (id, name, "basePath", "targetUrl", "environmentId", "isActive", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'my-new-proxy', '/my/api/v1', 'http://localhost:4000', '<env-id>', true, now(), now());
```

> [!NOTE]
> Remember to also add Endpoint records, or the proxy will match but return 404 for all paths.

---

## Related Pages

- [[Management API]]
- [[How to Use Prisma Studio]]
