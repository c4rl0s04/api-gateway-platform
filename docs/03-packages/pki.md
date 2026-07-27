---
title: "pki"
type: package
doc_status: current
implementation_status: implemented
last_verified: "2026-07-27"
tags:
  - type/package
  - area/security
sources:
  - packages/pki/package.json
  - packages/pki/src
  - packages/pki/test
aliases:
  - "@api-gateway/pki"
---

# pki

> [!summary] At a glance
> `@api-gateway/pki` owns private-key storage abstractions, X.509 issuance and validation, CRL handling, trust-bundle construction, and local client CSR generation.

## Responsibility

Provide reusable cryptographic operations without coupling them to Fastify,
Prisma, Envoy, or a specific production keystore.

## Boundaries

- Does not authorize administrators or persist domain records.
- Does not receive or escrow client private keys.
- Accepts and returns PEM/material metadata; callers own lifecycle transactions.
- Uses OpenSSL for X.509 and CRL operations and Node cryptography for encrypted
  storage.

## Public Contracts

The package exports `KeyStore`, `EncryptedFileKeyStore`, managed CA and
certificate issuance, external certificate validation, CRL download and
validation, bundle generation, and `generateClientKeyAndCsr`.

## Runtime Flow

Management API loads the separate master key, resolves a CA `keyRef`, performs a
PKI operation, persists public results, then republishes public Envoy bundles.
The CLI uses only CSR generation and writes under
`.local-secrets/clients/<credential-id>/`.

## Configuration

Management API supplies `PKI_KEYSTORE_DIR` and `PKI_MASTER_KEY_FILE`. The local
CLI uses `.local-secrets` or `LOCAL_SECRETS_DIR`.

## Tests

```bash
npm run build --workspace=packages/pki
npm run test --workspace=packages/pki
```

Tests cover atomic encrypted storage, RSA/EC CSR profiles, CA/server/client
issuance, external chain checks, CRL signing/download, deterministic bundles,
and refusal to overwrite client private material.

## Limitations

- `EncryptedFileKeyStore` is a local implementation, not a managed KMS or HSM.
- OpenSSL must exist where PKI operations run.
- External CRL refresh is invoked through Management API; no scheduler exists.
