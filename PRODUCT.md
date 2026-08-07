# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Platform operators and security administrators use the portal to understand gateway routing, manage organization-scoped application security, and operate certificate trust.

## Product Purpose

API Gateway Platform is a control plane for a lightweight enterprise API gateway. It gives operators a clear view of routing and runtime security while providing administrative workflows for applications, certificate authorities, client certificates, and audit activity.

## Positioning

The platform joins explicit environment-aware proxy routing with OIDC-protected administration, policy execution, and managed multi-client PKI in one TypeScript system.

## Operating Context

Operators work across organization-scoped applications, proxy deployments, API products, certificate authorities, and certificate lifecycle records. Gateway traffic enters through Envoy, resolves by environment hostname and longest path prefix, passes through an ordered policy pipeline, and then reaches an upstream service.

## Capabilities and Constraints

- The current admin login is OIDC with PKCE through Keycloak or a corporate identity provider.
- JWT and mTLS login methods are planned and may be communicated as unavailable upcoming methods; they must not appear interactive.
- Gateway routing, API key and OAuth security, direct mTLS, rate limiting, runtime reload, application security, PKI, and audit capabilities are implemented.
- Proxy lifecycle management is available in the admin panel: a guided flow atomically creates a logical proxy with validated revision 1, followed by deliberate staged deployment or rollback, activation, and retirement. The compatible name-only API remains available but is not exposed by the portal. API-product mutation remains incomplete and must not be presented as available.
- Proxy state refreshes from the Management API without browser caching; inventory state polls while visible and deployment mutations expose runtime application progress.
- The frontend is Next.js 14 with React 18 and TypeScript.

## Brand Commitments

The interface uses red as its primary brand color. It must feel clean, minimal, modern, low-density, and professional in both light and dark modes.

## Evidence on Hand

Repository architecture documentation, current capability status, management API contracts, and the existing admin panel are available as product evidence. No customer claims, production benchmarks, or commercial proof are available and none should be invented.

## Product Principles

- Make the active request path and its security boundaries immediately legible.
- Keep operational actions direct and organization context explicit.
- Communicate implemented and upcoming capabilities honestly.
- Treat certificate trust and identity as first-class gateway infrastructure.

## Accessibility & Inclusion

Interactive text and red accents must meet WCAG AA contrast. Keyboard focus, semantic status feedback, responsive layouts, and reduced-motion preferences are required.
