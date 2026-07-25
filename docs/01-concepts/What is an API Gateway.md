# What is an API Gateway?

An **API Gateway** is a server that acts as the single entry point for all client requests to your backend services. Instead of clients communicating directly with multiple microservices, they send everything through the gateway, which routes, transforms, secures, and monitors each request before forwarding it to the appropriate backend.

---

## Why Do Organizations Need One?

Without an API Gateway, every client must know the address of every backend service, handle authentication individually, and deal with different response formats. This leads to:

- **Tight coupling** between clients and services
- **Duplicated logic** (auth, rate limiting, logging) across every service
- **No centralized control** over who accesses what, and how often
- **Difficult monitoring** — no single point to observe all traffic

An API Gateway solves all of this by centralizing cross-cutting concerns in one layer.

---

## The Hotel Receptionist Analogy

Think of an API Gateway like the **front desk of a hotel**:

- Guests (clients) don't go directly to rooms (backend services)
- They go through the **receptionist** (API Gateway) first
- The receptionist **verifies identity** (authentication), **checks reservations** (authorization), **gives directions** (routing), and **logs the visit** (monitoring)
- If a guest is being disruptive, the receptionist can **refuse entry** (rate limiting)

The backend services (rooms) never need to worry about who's knocking — the front desk handles all of that.

---

## How It Works

```
┌──────────┐       ┌───────────────┐       ┌──────────────────┐
│  Client  │ ───►  │  API Gateway  │ ───►  │ Backend Service A │
│  (App)   │       │               │ ───►  │ Backend Service B │
│          │       │  - Routing    │ ───►  │ Backend Service C │
│          │  ◄─── │  - Security   │  ◄─── │                  │
│          │       │  - Rate Limit │       │                  │
│          │       │  - Transform  │       │                  │
└──────────┘       └───────────────┘       └──────────────────┘
```

1. **Client** sends a request (e.g., `GET /api/users`)
2. **API Gateway** matches the request to a configured proxy via the base path
3. Gateway applies **policies** (auth, rate limiting, transformation)
4. Gateway **forwards** the request to the correct backend service
5. Backend **responds**, gateway applies response policies, and returns the result to the client

---

## Real-World Examples

| Product                   | Provider  | Type                  |
| ------------------------- | --------- | --------------------- |
| **Google Apigee**         | Google    | Full lifecycle API management |
| **AWS API Gateway**       | Amazon    | Managed gateway (REST, HTTP, WebSocket) |
| **Kong**                  | Kong Inc. | Open-source / Enterprise gateway |
| **Azure API Management**  | Microsoft | Full lifecycle API management |

Our project is inspired primarily by **Google Apigee**, adopting its resource hierarchy and policy-based architecture.

---

## See Also

- [[Apigee - Overview]] — Deep dive into the Apigee model we're following
- [[Data Plane vs Control Plane]] — How we split the system
- [[Glossary]] — Definitions of key terms
