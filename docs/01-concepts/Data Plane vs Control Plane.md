# Data Plane vs Control Plane

The **Data Plane / Control Plane** separation is a fundamental architectural pattern in API gateways (and networking in general). Our platform follows this pattern to keep live traffic handling completely decoupled from administrative operations.

---

## Data Plane — `gateway-core`

The Data Plane is the **fast path**. It handles every single client request in real time.

**Responsibilities:**
- Receive incoming HTTP requests
- Match requests to proxies via **Longest Prefix Match** on basePaths
- Forward requests to the correct backend (reverse proxy)
- Apply policies (rate limiting, auth, transformation) — *future*
- Return responses to clients

**Key design decision:** The Data Plane loads all proxy/endpoint configuration **into memory (RAM)** at startup. It **never queries the database per request**. This ensures:
- Ultra-low latency routing
- No database dependency during live traffic
- Database outages don't crash the gateway

```
┌─────────────────────────────────────────┐
│              DATA PLANE                 │
│           (gateway-core)                │
│                                         │
│   ┌─────────────┐   ┌───────────────┐  │
│   │  In-Memory   │   │   Routing     │  │
│   │  Registry    │──►│   Engine      │  │
│   │  (proxies +  │   │  (LPM match)  │  │
│   │  endpoints)  │   └───────┬───────┘  │
│   └──────▲───────┘           │          │
│          │              Forward to      │
│     Load at startup     backend URL     │
│          │                   │          │
└──────────┼───────────────────┼──────────┘
           │                   ▼
     ┌─────┴─────┐      ┌──────────┐
     │ PostgreSQL │      │ Backend  │
     │   (read)   │      │ Services │
     └────────────┘      └──────────┘
```

---

## Control Plane — `management-api` + `admin-panel`

The Control Plane is the **admin path**. It handles configuration, not traffic.

**Responsibilities:**
- CRUD operations on proxies, endpoints, and policies
- Persist all configuration to **PostgreSQL** via Prisma ORM
- Provide a REST API for programmatic access (`management-api`)
- Provide a web dashboard for visual management (`admin-panel`) — *future*

```
┌─────────────────────────────────────────┐
│            CONTROL PLANE                │
│                                         │
│   ┌──────────────┐  ┌───────────────┐   │
│   │ admin-panel   │  │ management-   │   │
│   │ (React UI)    │─►│ api (Express) │   │
│   └──────────────┘  └───────┬───────┘   │
│                             │           │
│                        CRUD ops         │
│                             │           │
└─────────────────────────────┼───────────┘
                              ▼
                       ┌────────────┐
                       │ PostgreSQL │
                       │ (read/write)│
                       └────────────┘
```

---

## Synchronization Between Planes

When an admin creates or updates a proxy via the Control Plane, the Data Plane needs to know about it.

| Strategy            | Status    | How It Works                                              |
| ------------------- | --------- | --------------------------------------------------------- |
| **Restart**         | ✅ Current | Restart `gateway-core` to reload all config from DB       |
| **Hot Reload API**  | 🔲 Planned | Hit a `POST /reload` endpoint on gateway-core to refresh  |
| **Redis Pub/Sub**   | 🔲 Future  | Control Plane publishes events, Data Plane subscribes     |
| **Webhook/Polling** | 🔲 Future  | Data Plane polls or receives webhook on config changes    |

---

## Why This Matters

1. **Independent Scaling** — Scale the Data Plane (more gateway instances) without touching the Control Plane, and vice versa.
2. **Fault Isolation** — If the admin panel crashes, live API traffic is **completely unaffected**.
3. **Performance** — The Data Plane never waits on database queries during request handling.
4. **Security** — The Data Plane doesn't need write access to the database. Smaller attack surface.

---

## See Also

- [[Global Architecture]] — Full system architecture diagram
- [[Hot Reload Sync]] — Detailed plan for real-time config synchronization
- [[gateway-core]] — Data Plane implementation details
