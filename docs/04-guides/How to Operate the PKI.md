---
title: "How to Operate the PKI"
type: guide
doc_status: current
implementation_status: implemented
last_verified: "2026-07-27"
tags:
  - type/guide
  - area/security
sources:
  - scripts/generate-client-csr.mjs
  - packages/management-api/src/routes/certificate-authorities.ts
  - packages/management-api/src/routes/certificates.ts
  - packages/management-api/src/services/certificate-authorities.ts
  - packages/management-api/src/services/certificates.ts
aliases:
  - Certificate Operations
---

# How to Operate the PKI

> [!summary] At a glance
> Generate client-owned keys and CSRs, manage organization trust, issue or register certificates, revoke and rotate safely, and preserve the keystore as one recoverable unit.

## Goal

Operate the implemented multi-client mTLS lifecycle through the Admin Panel or
the equivalent Management API routes without exposing private material.

## Prerequisites

- The platform is running with `npm run dev:local`.
- The administrator has `platformAdmin` for CA operations or
  `organizationAdmin` for certificate operations in the target organization.
- The target app has an `AppCredential` with `mtls` and an approved product
  grant.
- OpenSSL is available on the client machine.

## Steps

### Generate a client key and CSR

```bash
npm run pki:client -- <credential-id> [rsa|ec]
```

This creates `.local-secrets/clients/<credential-id>/client.key` with mode
`0600` and `client.csr`. It refuses to overwrite either file. Send only the CSR
to the platform.

### Create and activate a managed CA

1. Open `http://localhost:8080/authorities`.
2. Select the organization and create a managed authority.
3. Activate it. It becomes the default managed issuer for that organization.
4. Keep another active or retiring CA trusted while migrating existing clients.

Only `platformAdmin` can perform these steps.

### Import an external CA

Provide its PEM CA certificate, optional intermediate chain, and optional HTTPS
CRL distribution URL. Activate it after validating subject, fingerprint,
validity, ownership, and revocation process. External CA private keys remain
outside the platform.

### Issue or register a certificate

Open `http://localhost:8080/certificates`. For managed issuance, select the
mTLS credential, paste the CSR, and choose 1 to 365 validity days. For external
registration, provide the issuing authority, leaf certificate, and optional
chain. Downloaded material contains only public certificates.

### Revoke and rotate

Revoking a managed certificate records the reason, regenerates its CA CRL, and
reloads Envoy through SDS. Rotation creates an active replacement and moves the
previous managed authority to `retiring`. Issue replacement client certificates
before revoking the old authority.

External CRLs can be refreshed from their HTTPS distribution URL or uploaded
manually. Verify `thisUpdate`, `nextUpdate`, signature, and issuer before
publication.

### Backup and recovery

Back up these as one versioned, access-controlled set:

```text
PostgreSQL database
.local-secrets/pki/keystore/
.local-secrets/pki/master.key
```

The database contains each `keyRef`; encrypted key files are unusable without
the master key, and the master key alone contains no CA key. Restore all three
from the same backup point, start Management API, republish trust by activating
or refreshing an authority, then verify Envoy.

Do not treat `.local-secrets/` as a production backup format. Production should
replace the file keystore with KMS/HSM-backed storage and durable SDS.

## Verification

```bash
npm run test:integration:mtls
npm run test:platform
```

The first command verifies two clients, spoofing protection, and dynamic CRL
reload. The second verifies OIDC, managed issuance, live use, revocation,
rotation, and persistence after Management API restart.

## Troubleshooting or Rollback

- If a new CA breaks clients, leave the prior CA `retiring`, not `revoked`, and
  reactivate the intended issuer.
- If CRL publication fails, inspect Management API and Envoy logs before
  retrying refresh.
- If key files are lost but the CA remains trusted, stop issuing immediately
  and rotate to a recoverable CA.
- Never regenerate `master.key` over an existing keystore.

See [[Debug OAuth and mTLS]] and [[Multi-Client PKI]].
