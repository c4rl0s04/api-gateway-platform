---
title: lab-egress
type: package
doc_status: current
implementation_status: implemented
last_verified: 2026-08-09
tags:
  - type/package
  - area/security
  - area/developer-platform
sources:
  - packages/lab-egress/package.json
  - packages/lab-egress/src
  - packages/lab-egress/test
aliases: []
---

# lab-egress

> [!summary] At a glance
> `@api-gateway/lab-egress` is the internal upstream boundary for declarative Personal Lab mocks and unauthenticated public HTTPS APIs.

## Responsibility

- Resolve an opaque upstream ID to an active, unexpired workspace resource.
- Serve bounded declarative mock responses.
- Forward public HTTPS requests after fresh DNS and address validation.
- Validate every redirect and prevent DNS rebinding.
- Strip internal, identity, hop-by-hop, cookie, and authorization headers.
- Enforce per-workspace request quotas, timeouts, and size limits.

## Boundaries

The gateway receives only `http://lab-egress:3010/upstreams/<id>` and never an
external target URL. `lab-egress` is not host-published. It cannot reach HTTP,
non-443 ports, private networks, loopback, link-local, multicast, or metadata
services and does not persist cookies or external credentials.

## Public Contracts

- `GET /live` and `GET /ready` inside Compose.
- Internal `/upstreams/:upstreamId/*` for gateway forwarding.
- Upstream configuration is created through [[Lab API Reference]], not through
  direct service calls.

## Runtime Flow

For each request, the service loads ownership and expiry from PostgreSQL,
consumes the workspace quota, then either matches a declarative mock route or
builds a public target. Public forwarding resolves DNS immediately, pins the
validated address for that connection, and repeats validation for each of at
most three redirects.

## Configuration

`HOST`, `PORT`, and `DATABASE_URL` are listed in [[Environment Variables]].
Code-enforced limits are 256 KiB requests, 1 MiB responses, 10-second timeout,
three redirects, 120 requests per workspace per minute, and 5-second maximum
mock latency.

## Tests

Package tests cover public/private address classification, target construction,
header stripping, mock execution, valid public HTTPS behavior, and blocked SSRF
inputs. `test:platform` verifies the service remains internal and is used by an
isolated lab workflow.

## Limitations

- Public upstream authentication and stored external secrets are unsupported.
- The quota counter is process-local in the current single-instance local
  runtime.
- This is logical network protection, not an execution sandbox; executable mock
  code is intentionally unsupported.

