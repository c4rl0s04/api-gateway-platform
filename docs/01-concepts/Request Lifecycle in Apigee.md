# Request Lifecycle in Apigee

Understanding the full request lifecycle is critical to knowing **when** policies execute and **how** a request flows through the gateway. This note covers both Apigee's model and our current (simplified) implementation.

---

## Full Apigee Lifecycle

```
Client Request
      │
      ▼
┌─────────────────────────────────────────────────────┐
│                   PROXY ENDPOINT                     │
│                                                      │
│   1. Match API Proxy via basePath (Longest Prefix)   │
│                                                      │
│   ┌──────────── REQUEST FLOW ────────────┐           │
│   │                                      │           │
│   │  2. PreFlow Policies                 │           │
│   │     (always execute: auth, validate) │           │
│   │              │                       │           │
│   │              ▼                       │           │
│   │  3. Conditional Flows                │           │
│   │     (execute if condition matches)   │           │
│   │              │                       │           │
│   │              ▼                       │           │
│   │  4. PostFlow Policies                │           │
│   │     (always execute: logging, etc.)  │           │
│   │                                      │           │
│   └──────────────────────────────────────┘           │
│                      │                               │
└──────────────────────┼───────────────────────────────┘
                       │
                       ▼
              Forward to Target URL
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│                  TARGET ENDPOINT                     │
│                                                      │
│   5. Target PreFlow Policies (optional)              │
│   6. Send request to backend service                 │
│   7. Receive backend response                        │
│                                                      │
└──────────────────────┬───────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│              RESPONSE FLOW (reverse)                 │
│                                                      │
│   ┌──────────── RESPONSE FLOW ───────────┐           │
│   │                                      │           │
│   │  8. Target PostFlow (optional)       │           │
│   │              │                       │           │
│   │              ▼                       │           │
│   │  9. Proxy Response PreFlow           │           │
│   │              │                       │           │
│   │              ▼                       │           │
│   │  10. Proxy Response Conditional      │           │
│   │              │                       │           │
│   │              ▼                       │           │
│   │  11. Proxy Response PostFlow         │           │
│   │                                      │           │
│   └──────────────────────────────────────┘           │
│                                                      │
└──────────────────────┬───────────────────────────────┘
                       │
                       ▼
              Client Response
```

---

## Step-by-Step Breakdown

### 1. Proxy Matching (Longest Prefix Match)

When a request arrives (e.g., `GET /api/users/123`), the gateway looks at all registered basePaths and picks the **longest one that matches**:

| Registered basePaths | Incoming Path         | Match         |
| -------------------- | --------------------- | ------------- |
| `/api`               | `/api/users/123`      | ✅ (but shorter) |
| `/api/users`         | `/api/users/123`      | ✅ **Winner** |
| `/api/orders`        | `/api/users/123`      | ❌             |

### 2–4. Request Flows (ProxyEndpoint)

- **PreFlow**: Always runs. Attach policies that must execute on every request (auth, input validation).
- **Conditional Flows**: Run only when conditions are met (e.g., `request.verb == "POST"` or path suffix matches `/admin`).
- **PostFlow**: Always runs after conditional flows. Good for logging or cleanup.

### 5–7. Target Endpoint

The request is forwarded to the backend URL defined in the TargetEndpoint. The gateway acts as a **reverse proxy**, relaying the request and receiving the backend's response.

### 8–11. Response Flows

The response travels back through the pipeline in reverse. Response policies can transform the payload (e.g., XML → JSON), add headers (e.g., CORS), or log the response.

---

## Our Current Implementation (Simplified)

Our gateway currently implements a **simplified version** of this lifecycle:

```
Client Request
      │
      ▼
1. Resolve Proxy (match basePath via Longest Prefix Match)
      │
      ▼
2. Resolve Endpoint (find the matching endpoint)
      │
      ▼
3. Forward Request to targetUrl (reverse proxy via http-proxy)
      │
      ▼
4. Return Backend Response to Client
```

**What's implemented:**
- ✅ Longest Prefix Match routing
- ✅ Proxy → Endpoint resolution
- ✅ Request forwarding (reverse proxy)
- ✅ Response relay

**What's not yet implemented:**
- 🔲 PreFlow / PostFlow / Conditional flow pipeline
- 🔲 Policy execution engine
- 🔲 Response flow policies
- 🔲 Error/fault handling flows

---

## Future: Full Pipeline

In Week 4 (Policy Engine), we'll implement the full flow pipeline:

1. Build a `PolicyEngine` that executes an ordered list of policies
2. Attach policies to PreFlow, Conditional, and PostFlow stages
3. Support both request and response policy execution
4. Add fault handling for policy failures (e.g., auth rejection → 401)

---

## See Also

- [[Policies in Apigee]] — Full catalog of available policy types
- [[Routing Engine]] — How Longest Prefix Match works in our implementation
- [[gateway-core]] — Data Plane source code and architecture
