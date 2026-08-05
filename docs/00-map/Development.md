---
title: Development
type: map
doc_status: current
implementation_status: not-applicable
last_verified: 2026-08-06
tags:
  - type/map
  - area/project
sources:
  - docs
aliases:
  - Development Map
---

# Development

> [!summary] At a glance
> Use this map to find package ownership, persistence contracts, development workflows, tests, seeds, and documentation rules.

## Purpose

This area helps contributors locate the package and authoritative contract to
change before implementing a feature.

## Recommended Reading

1. [[Monorepo and Packages]]
2. [[Global Architecture]]
3. [[Data Model]]
4. [[Project Map]]
5. [[How to Run Tests]]

## Architecture

- [[Monorepo and Packages]] explains workspace boundaries.
- [[Data Model]] and [[Database Schema]] explain persistence ownership.
- [[Routing Engine]] and [[Proxy Revisions and Deployments]] cover proxy changes.

## Guides

- [[How to Add a New Proxy]]
- [[How to Import and Deploy a Proxy Revision]]
- [[How to Use Prisma Studio]]
- [[How to Run Tests]]
- [[Command Reference]]
- [[How to Document the Project]]

## Reference

- [[Database Schema]]
- [[API Routes]]
- [[Policy Types]]
- [[Seed Example Catalog]]
- [[Documentation Index]]

## Troubleshooting

- [[Reset Local Database]]
- [[Debug Gateway 404]]
- [[Debug Policy Failure]]

## Packages and Decisions

- Packages: [[gateway-core]], [[management-api]], [[admin-panel]], [[database]],
  [[pki]], and [[shared]].
- Start architectural rationale at [[Decision Records]].
