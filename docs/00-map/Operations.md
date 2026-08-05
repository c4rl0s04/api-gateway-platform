---
title: Operations
type: map
doc_status: current
implementation_status: not-applicable
last_verified: 2026-08-06
tags:
  - type/map
  - area/operations
sources:
  - docs
aliases:
  - Operations Map
---

# Operations

> [!summary] At a glance
> Use this map to start, configure, observe, validate, and recover the local platform and its runtime services.

## Purpose

This area covers the local topology, ports, environment variables, startup,
runtime health, synchronization, PKI operations, and incident diagnosis.

## Recommended Reading

1. [[Deployment Model]]
2. [[How to Start the Project]]
3. [[Ports]]
4. [[Environment Variables]]
5. [[Observability]]

## Architecture

- [[Deployment Model]] describes the all-in-one local topology.
- [[Observability]] records current and planned operational signals.
- [[Hot Reload Sync]] describes routing convergence and instance status.
- [[Multi-Client PKI]] describes runtime trust distribution.

## Guides

- [[How to Start the Project]]
- [[How to Manage the Local Platform Lifecycle]]
- [[How to Run Tests]]
- [[How to Operate the PKI]]
- [[How to Import and Deploy a Proxy Revision]]

## Reference

- [[Ports]]
- [[Command Reference]]
- [[Environment Variables]]
- [[Seed Example Catalog]]
- [[Current Status]]

## Troubleshooting

- [[Debug Gateway 404]]
- [[Debug Gateway Runtime Sync]]
- [[Debug OAuth and mTLS]]
- [[Debug Policy Failure]]
- [[Reset Local Database]]

## Packages and Decisions

- Packages: [[gateway-core]], [[management-api]], [[admin-panel]], and [[pki]].
- Decisions: [[ADR-006 Envoy and Managed Client PKI]] and
  [[ADR-007 Hostname-Based Environment Routing]].
