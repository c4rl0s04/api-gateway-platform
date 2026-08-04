---
title: Data Plane
type: map
doc_status: current
implementation_status: not-applicable
last_verified: 2026-08-02
tags:
  - type/map
  - area/gateway-core
sources:
  - docs
aliases:
  - Data Plane Map
---

# Data Plane

> [!summary] At a glance
> Use this map to understand how an incoming API request is routed, authorized, and forwarded by the gateway.

## Purpose

This area covers Envoy-to-gateway traffic, environment selection, proxy and
operation resolution, policy execution, local responses, and forwarding.

## Recommended Reading

1. [[What is an API Gateway]]
2. [[Data Plane vs Control Plane]]
3. [[Global Architecture]]
4. [[Runtime Request Flow]]
5. [[Routing Engine]]

## Architecture

- [[Runtime Request Flow]] explains the complete request sequence.
- [[Routing Engine]] owns hostname, proxy, operation, and method resolution.
- [[Hot Reload Sync]] explains how running registries receive routing changes.

## Guides

- [[How to Add a New Proxy]]
- [[How to Import and Deploy a Proxy Revision]]

## Reference

- [[API Routes]]
- [[Policy Types]]
- [[Policy Reference Index]]

## Troubleshooting

- [[Debug Gateway 404]]
- [[Debug Policy Failure]]
- [[Debug Gateway Runtime Sync]]

## Packages and Decisions

- Packages: [[gateway-core]] and [[shared]].
- Decisions: [[ADR-001 Longest Prefix Match]], [[ADR-002 Explicit Endpoints]],
  and [[ADR-007 Hostname-Based Environment Routing]].
