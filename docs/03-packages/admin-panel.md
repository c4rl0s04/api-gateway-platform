---
title: admin-panel
type: package
doc_status: current
implementation_status: partial
last_verified: 2026-07-27
tags:
  - type/package
  - area/admin-panel
sources:
  - packages/admin-panel/package.json
  - packages/admin-panel/app
  - packages/admin-panel/lib/api-client.ts
aliases: []
---

# admin-panel

> [!summary] At a glance
> `admin-panel` is a Next.js scaffold with placeholder pages and no working Management API client.

## Responsibility

The target package is the browser interface for control-plane workflows.

## Boundaries

Current routes include placeholder pages for the dashboard, applications,
products, and proxies. The API client contains only a stub.

## Public Contracts

No stable UI or HTTP client contract exists yet.

## Runtime Flow

Next.js serves static placeholder headings. There is no data loading, mutation,
authentication, error handling, or connection to `management-api`.

## Configuration

The package uses the standard Next.js development port unless overridden when
starting the process. That default conflicts with the gateway and Grafana.

## Tests

The package test and lint scripts are TODO placeholders.

## Limitations

- No usable administration workflow.
- No API integration.
- No authentication or authorization.
- No component or end-to-end tests.

## Related Notes

- [[Control Plane Flow]]
- [[Management API]]
- [[Ports]]
