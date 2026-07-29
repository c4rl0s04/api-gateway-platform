---
title: Runtime Request Flow
type: architecture
doc_status: current
implementation_status: implemented
last_verified: 2026-07-29
tags:
  - type/architecture
  - area/gateway-core
sources:
  - packages/gateway-core/src/server.ts
  - packages/gateway-core/src/proxy/resolver.ts
  - packages/gateway-core/src/proxy/forwarder.ts
  - packages/gateway-core/src/policies/pipeline.ts
aliases: []
---

# Runtime Request Flow

> [!summary] At a glance
> Every non-operational request passes through hostname-based environment selection, proxy resolution, endpoint resolution, and the ordered policy pipeline; forwarding occurs only when a non-terminal forward endpoint continues.

## Context

The gateway keeps routing configuration in memory so request processing does not
query PostgreSQL for every request.

## Components

```mermaid
flowchart TD
    REQUEST["Incoming HTTPS request"] --> ENVOY["Envoy validates optional client certificate and sanitizes identity"]
    ENVOY --> OPERATIONAL{"Operational path?"}
    OPERATIONAL -->|"/live or /ready"| HEALTH["Gateway response"]
    OPERATIONAL -->|"No"| ENVIRONMENT{"Resolve Host to environment"}
    ENVIRONMENT -->|"Unknown"| MISDIRECTED["421 Misdirected Request"]
    ENVIRONMENT -->|"Known"| PROXY{"Resolve longest proxy prefix"}
    PROXY -->|"No match"| PROXY404["404 unknown proxy"]
    PROXY -->|"Match"| ENDPOINT{"Resolve explicit endpoint"}
    ENDPOINT -->|"No match"| ENDPOINT404["404 unknown endpoint"]
    ENDPOINT -->|"Match"| POLICIES["Run enabled policies by order"]
    POLICIES -->|"Halt denial"| POLICYRESPONSE["Policy error response"]
    POLICIES -->|"Terminal response"| LOCAL["Return local OAuth or JWKS response"]
    POLICIES -->|"Continue + forward"| FORWARD["Build upstream URL and forward bytes"]
    FORWARD -->|"Success"| RESPONSE["Stream upstream response"]
    FORWARD -->|"Connection failure"| BADGATEWAY["502 Bad Gateway"]
```

## Data Flow

Dynamic route parameters are extracted from the public endpoint path and
substituted into `targetPath`. Query parameters and arbitrary body bytes are
preserved. Hop-by-hop headers are removed from both directions.
The environment comes from the request authority matched against
`Environment.publicOrigin`; no request header or default environment can
override it.

## Failure Modes

Policy dependency failures are handled according to `failureMode`. Business
denials such as invalid credentials or exceeded limits halt normally and are not
treated as infrastructure degradation.

API key and mTLS authorization query PostgreSQL. OAuth token issuance queries
PostgreSQL and JWT Bearer additionally requires Redis replay protection.
Gateway-issued Bearer verification is stateless and does not query PostgreSQL.
For mTLS, Envoy rejects invalid chains and CRLs before the request reaches the
gateway; `mtls-auth` then authorizes the connection-derived fingerprint.

## Constraints

The gateway routing registry changes only at startup. Envoy certificate and CRL
trust is a separate runtime and reloads atomically through file SDS.

## Sources

See [[Routing Engine]], [[gateway-core]], and [[Debug Gateway 404]].
