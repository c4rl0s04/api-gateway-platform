---
title: Control Plane
type: map
doc_status: current
implementation_status: not-applicable
last_verified: 2026-08-02
tags:
  - type/map
  - area/management-api
sources:
  - docs
aliases:
  - Control Plane Map
---

# Control Plane

> [!summary] At a glance
> Use this map to understand and operate the APIs that manage proxies, products, applications, deployments, and runtime synchronization.

## Purpose

This area covers administrator identity, Management API authorization,
configuration persistence, immutable revisions, deployments, audit, and the
Admin Panel BFF.

## Recommended Reading

1. [[Data Plane vs Control Plane]]
2. [[Control Plane Flow]]
3. [[Management API]]
4. [[Proxy Revisions and Deployments]]
5. [[Hot Reload Sync]]

## Architecture

- [[Control Plane Flow]] explains Keycloak, the BFF, and Management API.
- [[Management API]] defines control-plane ownership and boundaries.
- [[Data Model]] and [[Proxy Revisions and Deployments]] explain persistence.
- [[Hot Reload Sync]] explains control-plane to data-plane convergence.

## Guides

- [[How to Use the Management API with Postman]]
- [[How to Add a New Proxy]]
- [[How to Import and Deploy a Proxy Revision]]

## Reference

- [[Management API Endpoint Reference]]
- [[API Routes]]
- [[Database Schema]]
- [[Current Status]]

## Troubleshooting

- [[Debug Gateway Runtime Sync]]
- [[Reset Local Database]]
- [[Debug Gateway 404]]

## Packages and Decisions

- Packages: [[management-api]], [[admin-panel]], and [[database]].
- Decisions: [[ADR-003 Prisma as ORM]] and
  [[ADR-007 Hostname-Based Environment Routing]].
