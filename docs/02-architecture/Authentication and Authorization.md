---
title: "Authentication and Authorization"
type: architecture
doc_status: current
implementation_status: implemented
last_verified: "2026-07-29"
tags:
  - type/architecture
  - area/security
sources:
  - packages/database/prisma/schema.prisma
  - packages/gateway-core/src/auth/authorization.ts
  - packages/gateway-core/src/policies/oauth/oauth-token.policy.ts
  - packages/gateway-core/src/policies/oauth/oauth-access-token.policy.ts
  - packages/gateway-core/src/policies/auth/mtls.policy.ts
  - packages/management-api/src/services/applications.ts
  - infra/envoy/envoy.yaml
aliases:
  - Authentication Architecture
---

# Authentication and Authorization

> [!summary] At a glance
> Applications own credentials; credentials authenticate clients; approved product grants authorize proxies, environments, and scopes. OAuth exchanges supported client authentication for short-lived, environment-bound RS256 access tokens.

## Context

The gateway supports four client-facing methods:

- API key: `consumerKey` in a configurable header.
- OAuth Client Credentials: `consumerKey` and a one-time-issued secret.
- OAuth JWT Bearer Grant: a short-lived assertion signed by an application key.
- Direct mTLS: a certificate validated by a trusted ingress.

Authentication and authorization are separate. A valid credential does not
grant API access until it has an approved `CredentialProductGrant`.

## Components

```mermaid
erDiagram
  Organization ||--o{ DeveloperApp : owns
  DeveloperApp ||--o{ AppCredential : has
  AppCredential ||--o{ AppPublicKey : verifies_assertions
  AppCredential ||--o{ AppCertificate : identifies_mtls
  CertificateAuthority ||--o{ AppCertificate : issues
  AppCredential ||--o{ CredentialProductGrant : receives
  ApiProduct ||--o{ CredentialProductGrant : authorizes
  ApiProduct }o--o{ ApiProxy : bundles
  ApiProduct }o--o{ Environment : optionally_allows
  ApiProxy ||--o{ ProxyDeployment : deploys
```

`AppCredential` is the common identity anchor. Every credential has a generated
consumer key and a generated secret whose salted scrypt hash is the only stored
form. The selected endpoint policy determines how that credential is used:
API key resolves the consumer key, Client Credentials also verifies the secret,
JWT Bearer requires an active `AppPublicKey`, and mTLS requires an active
`AppCertificate`. Public JWKs and certificates are optional, independently
revocable records with validity windows.

Application registration creates the app, its initial credential, and approved
product grants in one transaction. The plaintext consumer secret appears only
in the creation response. A failed product or scope validation rolls back the
entire aggregate.

The system-managed `platform-oauth` proxy exposes local endpoints at
`POST /oauth/token` and `GET /oauth/.well-known/jwks.json` in every environment.
Local endpoints return from a terminal policy and never invoke an upstream.

## Data Flow

### API Key

```mermaid
sequenceDiagram
  Client->>Gateway: x-api-key: consumerKey
  Gateway->>PostgreSQL: credential + approved grants
  Gateway->>Gateway: check status, expiry, approved grant, proxy, environment
  Gateway->>Backend: forward authorized request
```

### Client Credentials

```mermaid
sequenceDiagram
  Client->>Token endpoint: Basic consumerKey:consumerSecret
  Token endpoint->>PostgreSQL: credential + approved grants
  Token endpoint->>Token endpoint: verify scrypt hash and scopes
  Token endpoint-->>Client: RS256 access token
```

### JWT Bearer Grant

```mermaid
sequenceDiagram
  Client->>Token endpoint: signed JWT assertion
  Token endpoint->>PostgreSQL: credential, JWK, approved grants
  Token endpoint->>Redis: SET replay key NX EX
  Token endpoint->>Token endpoint: verify RS256, kid, aud, iss, sub, iat, exp, jti
  Token endpoint-->>Client: RS256 access token
```

### Access Token

```mermaid
sequenceDiagram
  Client->>Gateway: Authorization: Bearer access_token
  Gateway->>Gateway: verify RS256 and claims in memory
  Gateway->>Gateway: check environment_id, proxy_ids, scopes
  Gateway->>Backend: forward authorized request
```

### Direct mTLS

```mermaid
sequenceDiagram
  Client->>Envoy: TLS client certificate
  Envoy->>Envoy: validate CA chain, dates, EKU and CRL
  Envoy->>Gateway: connection-derived SHA-256 fingerprint
  Gateway->>Gateway: validate immediate source CIDR
  Gateway->>PostgreSQL: certificate, credential, approved grants
  Gateway->>Backend: forward authorized request
```

## Failure Modes

| Failure | Behavior |
| --- | --- |
| PostgreSQL unavailable during API key, token issuance, or mTLS | Policy `failureMode`; security policies default closed |
| Redis unavailable during JWT assertion replay protection | Reject `invalid_grant`; always fail closed |
| Invalid signing key or trusted CIDR configuration | Gateway startup fails; readiness is never reached |
| Invalid access-token signature or claims | `401` |
| Valid token for another environment, proxy, or missing scope | `403` |
| Credential, grant, JWK, or certificate revoked | New DB-backed authentication fails immediately |
| Access token revoked indirectly after issuance | Remains valid until `exp` |

## Constraints

- RS256 only.
- Access tokens default to 900 seconds and cannot exceed 3600 seconds.
- JWT assertions cannot span more than 120 seconds and are single-use.
- No refresh tokens or individual access-token persistence/revocation.
- One authentication policy per business endpoint.
- Envoy removes client-supplied identity headers and writes the fingerprint
  derived from the live TLS connection.
- Client private keys never enter the platform; managed issuance accepts CSRs.
- Authorization code, password, implicit, `private_key_jwt`, and direct external
  JWT validation are not supported.

## Sources

- [[Data Model]]
- [[Runtime Request Flow]]
- [[OAuth 2.0]]
- [[ADR-005 Signed OAuth Tokens]]
- [[Multi-Client PKI]]
