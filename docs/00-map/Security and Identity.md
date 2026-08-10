---
title: Security and Identity
type: map
doc_status: current
implementation_status: not-applicable
last_verified: 2026-08-10
tags:
  - type/map
  - area/security
sources:
  - docs
aliases:
  - Security and Identity Map
---

# Security and Identity

> [!summary] At a glance
> Use this map to understand API keys, OAuth, JWT Bearer, mTLS, application credentials, PKI, and administrator identity.

## Purpose

This area separates client authentication, product authorization, token
issuance, certificate trust, and OIDC-based administrator access.

## Recommended Reading

1. [[Authentication and Authorization]]
2. [[OAuth 2.0]]
3. [[Multi-Client PKI]]
4. [[Control Plane Flow]]
5. [[How to Configure Application Authentication]]
6. [[Local Client Agent Architecture]]

## Architecture

- [[Authentication and Authorization]] explains all supported client flows.
- [[Multi-Client PKI]] explains organization CAs and certificate lifecycle.
- [[Control Plane Flow]] explains Keycloak and administrator memberships.
- [[Local Client Agent Architecture]] defines client-side key custody.
- [[Personal Gateway Lab]] defines workspace-bound credentials and tokens.

## Guides

- [[How to Configure Application Authentication]]
- [[How to Operate the PKI]]
- [[How to Use the Management API with Postman]]
- [[How to Connect Local Keys to the Playground]]

## Reference

- [[API Key Verification]]
- [[OAuth Token Issuance]] and [[OAuth Access Token Verification]]
- [[mTLS Authentication]]
- [[Environment Variables]]
- [[Policy Reference Index]]
- [[gatewayctl Reference]]

## Troubleshooting

- [[Debug OAuth and mTLS]]
- [[Debug Policy Failure]]
- [[Debug Local Agent Pairing]]
- [[Debug Lab Isolation and Egress]]

## Packages and Decisions

- Packages: [[pki]], [[gateway-core]], [[management-api]], [[gatewayctl]], and [[shared]].
- Decisions: [[ADR-005 Signed OAuth Tokens]] and
  [[ADR-006 Envoy and Managed Client PKI]], plus
  [[ADR-010 Remembered Loopback Browser Clients]] and
  [[ADR-009 Logical Lab Workspace Isolation]].
