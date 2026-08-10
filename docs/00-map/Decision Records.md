---
title: Decision Records
type: map
doc_status: current
implementation_status: not-applicable
last_verified: 2026-08-10
tags:
  - type/map
  - area/architecture
sources:
  - docs
aliases:
  - ADR Index
  - Decision Record Index
---

# Decision Records

> [!summary] At a glance
> Use this map to find the accepted and planned architectural decisions behind routing, persistence, policies, OAuth, and PKI.

## Purpose

Decision records explain why durable architectural choices were made. Use the
linked architecture and reference notes for current behavior and exact values.

## Recommended Reading

1. [[Global Architecture]]
2. [[Data Plane vs Control Plane]]
3. The decision group related to the area being changed.
4. [[Current Status]] to verify whether the decision is implemented or planned.

## Architecture

- Routing decisions relate to [[Routing Engine]] and [[Runtime Request Flow]].
- Persistence decisions relate to [[Data Model]].
- Security decisions relate to [[Authentication and Authorization]] and
  [[Multi-Client PKI]].

## Guides

- [[How to Document the Project]] defines how to add or supersede an ADR.
- [[Development]] links decisions back to package ownership and tests.

## Reference

- [[Documentation Index]] is the authoritative metadata inventory.
- [[Current Status]] separates implemented, partial, and planned capabilities.

## Troubleshooting

When behavior and intent appear inconsistent, compare the relevant ADR with
[[Current Status]] and the authoritative reference note before changing code.

## Packages and Decisions

- Routing: [[ADR-001 Longest Prefix Match]], [[ADR-002 Explicit Endpoints]],
  and [[ADR-007 Hostname-Based Environment Routing]].
- Persistence: [[ADR-003 Prisma as ORM]].
- Policies: [[ADR-004 XML Policies]].
- Security: [[ADR-005 Signed OAuth Tokens]] and
  [[ADR-006 Envoy and Managed Client PKI]].
- Developer platform: [[ADR-010 Remembered Loopback Browser Clients]]
  supersedes the connection mechanism in
  [[ADR-008 Closed Loopback Client Agent]];
  [[ADR-009 Logical Lab Workspace Isolation]] defines Lab isolation.
