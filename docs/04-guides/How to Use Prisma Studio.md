# 🔍 How to Use Prisma Studio

## What is Prisma Studio?

Prisma Studio is a **visual database browser** that lets you view and edit data in your PostgreSQL database through a web interface. It's like phpMyAdmin or pgAdmin, but designed specifically for Prisma schemas.

---

## Prerequisites

1. ✅ PostgreSQL is running (`docker-compose up postgres -d`)
2. ✅ Database is migrated (`npm run db:migrate --workspace=packages/database`)
3. ✅ Prisma Client is generated (`npm run db:generate --workspace=packages/database`)

---

## Launch Command

```bash
npm run db:studio --workspace=packages/database
```

This opens Prisma Studio in your browser at:

> **http://localhost:5555**

---

## What You Can Do

| Action | Description |
| ------ | ----------- |
| **Browse tables** | View all records in Organization, Environment, ApiProxy, Endpoint, EndpointPolicy |
| **Filter data** | Search and filter records by any column |
| **Edit records** | Click on any cell to edit values inline |
| **Add records** | Create new rows directly in the UI |
| **Delete records** | Remove records (be careful with cascading deletes!) |
| **View relations** | Navigate between related records (e.g., from a Proxy to its Endpoints) |

---

## Useful Actions

### Inspect seed data

After seeding, open Prisma Studio to verify that all sample proxies, endpoints, and policies were created correctly.

### Quick debugging

If the gateway shows `proxiesLoaded: 0`, use Prisma Studio to check whether any active proxies exist in the `ApiProxy` table.

### Manual configuration

While the Management API is not yet built, you can use Prisma Studio as a temporary admin panel to add or modify proxy configurations.

---

## ⚠️ Important Notes

> [!CAUTION]
> If you modify data in Prisma Studio while the gateway is running, the gateway will **not** automatically pick up the changes. You need to **restart the gateway** for it to reload the proxy configuration from the database.
>
> This limitation will be resolved when [[Hot Reload Sync]] is implemented.

---

## Related Pages

- [[Database and Prisma]]
- [[database]]
