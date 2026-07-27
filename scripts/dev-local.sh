#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SECRETS_DIR="$ROOT_DIR/.local-secrets"
COMPOSE_ENV="$SECRETS_DIR/compose.env"

for command in docker openssl node; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Required command not found: $command" >&2
    exit 1
  fi
done

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running." >&2
  exit 1
fi

mkdir -p "$SECRETS_DIR"
mkdir -p "$SECRETS_DIR/ingress" "$SECRETS_DIR/keycloak" "$SECRETS_DIR/oauth" "$SECRETS_DIR/pki"

KEYCLOAK_USERS_ENV="$SECRETS_DIR/keycloak/users.env"
if [[ ! -f "$KEYCLOAK_USERS_ENV" ]]; then
  umask 077
  printf '%s\n' \
    "KEYCLOAK_ADMIN_PASSWORD=$(openssl rand -hex 16)" \
    "PLATFORM_ADMIN_PASSWORD=$(openssl rand -hex 16)" \
    "ORGANIZATION_ADMIN_PASSWORD=$(openssl rand -hex 16)" \
    "VIEWER_PASSWORD=$(openssl rand -hex 16)" \
    > "$KEYCLOAK_USERS_ENV"
fi
# shellcheck disable=SC1090
source "$KEYCLOAK_USERS_ENV"

cat > "$SECRETS_DIR/keycloak/realm.json" <<EOF
{
  "realm": "api-gateway",
  "enabled": true,
  "sslRequired": "none",
  "registrationAllowed": false,
  "loginWithEmailAllowed": true,
  "clients": [
    {
      "clientId": "admin-panel",
      "name": "API Gateway Admin Panel",
      "enabled": true,
      "publicClient": true,
      "standardFlowEnabled": true,
      "directAccessGrantsEnabled": false,
      "redirectUris": ["http://localhost:8080/api/auth/callback"],
      "webOrigins": ["http://localhost:8080"],
      "protocolMappers": [
        {
          "name": "management-api-audience",
          "protocol": "openid-connect",
          "protocolMapper": "oidc-audience-mapper",
          "consentRequired": false,
          "config": {
            "included.client.audience": "management-api",
            "id.token.claim": "false",
            "access.token.claim": "true"
          }
        }
      ]
    },
    {
      "clientId": "management-api",
      "name": "API Gateway Management API",
      "enabled": true,
      "bearerOnly": true
    },
    {
      "clientId": "platform-e2e",
      "name": "Local Platform End-to-End Tests",
      "enabled": true,
      "publicClient": true,
      "standardFlowEnabled": false,
      "directAccessGrantsEnabled": true,
      "protocolMappers": [
        {
          "name": "management-api-audience",
          "protocol": "openid-connect",
          "protocolMapper": "oidc-audience-mapper",
          "consentRequired": false,
          "config": {
            "included.client.audience": "management-api",
            "id.token.claim": "false",
            "access.token.claim": "true"
          }
        }
      ]
    }
  ],
  "users": [
    {
      "id": "local-platform-admin",
      "username": "platform-admin",
      "email": "platform-admin@local.test",
      "firstName": "Platform",
      "lastName": "Administrator",
      "enabled": true,
      "emailVerified": true,
      "credentials": [{"type": "password", "value": "$PLATFORM_ADMIN_PASSWORD", "temporary": false}]
    },
    {
      "id": "local-organization-admin",
      "username": "organization-admin",
      "email": "organization-admin@local.test",
      "firstName": "Organization",
      "lastName": "Administrator",
      "enabled": true,
      "emailVerified": true,
      "credentials": [{"type": "password", "value": "$ORGANIZATION_ADMIN_PASSWORD", "temporary": false}]
    },
    {
      "id": "local-viewer",
      "username": "viewer",
      "email": "viewer@local.test",
      "firstName": "Read Only",
      "lastName": "Viewer",
      "enabled": true,
      "emailVerified": true,
      "credentials": [{"type": "password", "value": "$VIEWER_PASSWORD", "temporary": false}]
    }
  ]
}
EOF

if [[ -f "$SECRETS_DIR/gateway-signing-private.pem" && ! -f "$SECRETS_DIR/oauth/gateway-signing-private.pem" ]]; then
  mv "$SECRETS_DIR/gateway-signing-private.pem" "$SECRETS_DIR/oauth/gateway-signing-private.pem"
fi
if [[ ! -f "$SECRETS_DIR/oauth/gateway-signing-private.pem" ]]; then
  openssl genpkey \
    -algorithm RSA \
    -pkeyopt rsa_keygen_bits:2048 \
    -out "$SECRETS_DIR/oauth/gateway-signing-private.pem" >/dev/null 2>&1
fi

if [[ -f "$SECRETS_DIR/client-assertion-private.pem" && ! -f "$SECRETS_DIR/oauth/client-assertion-private.pem" ]]; then
  mv "$SECRETS_DIR/client-assertion-private.pem" "$SECRETS_DIR/oauth/client-assertion-private.pem"
fi
if [[ ! -f "$SECRETS_DIR/oauth/client-assertion-private.pem" ]]; then
  openssl genpkey \
    -algorithm RSA \
    -pkeyopt rsa_keygen_bits:2048 \
    -out "$SECRETS_DIR/oauth/client-assertion-private.pem" >/dev/null 2>&1
fi
openssl pkey \
  -in "$SECRETS_DIR/oauth/client-assertion-private.pem" \
  -pubout \
  -out "$SECRETS_DIR/oauth/client-assertion-public.pem" >/dev/null 2>&1
rm -f "$SECRETS_DIR/client-assertion-public.pem"

cd "$ROOT_DIR"
npm run build --workspace=packages/pki >/dev/null
node scripts/bootstrap-local-pki.mjs "$SECRETS_DIR"
touch \
  "$ROOT_DIR/infra/envoy/sds/server-certificate.yaml" \
  "$ROOT_DIR/infra/envoy/sds/client-validation.yaml"

GATEWAY_KEY_BASE64="$(
  openssl base64 -A -in "$SECRETS_DIR/oauth/gateway-signing-private.pem"
)"
CLIENT_PUBLIC_JWK="$(
  node -e "
    const fs = require('node:fs');
    const crypto = require('node:crypto');
    const key = crypto.createPublicKey(
      fs.readFileSync(process.argv[1], 'utf8'),
    );
    process.stdout.write(JSON.stringify(key.export({ format: 'jwk' })));
  " "$SECRETS_DIR/oauth/client-assertion-public.pem"
)"
MTLS_FINGERPRINT="$(
  tr -d '\n' < "$SECRETS_DIR/clients/cred-bank-001/fingerprint.sha256"
)"
MTLS_FINGERPRINT_SECOND="$(
  tr -d '\n' < "$SECRETS_DIR/clients/cred-bank-002/fingerprint.sha256"
)"
MTLS_CA_CERTIFICATE_BASE64="$(
  openssl base64 -A -in "$SECRETS_DIR/pki/authorities/local-development/ca.crt"
)"
MTLS_CRL_BASE64="$(
  openssl base64 -A -in "$SECRETS_DIR/pki/crl-bundle.pem"
)"
MTLS_CLIENT_CERTIFICATE_BASE64="$(
  openssl base64 -A -in "$SECRETS_DIR/clients/cred-bank-001/client.crt"
)"
MTLS_CLIENT_CERTIFICATE_SECOND_BASE64="$(
  openssl base64 -A -in "$SECRETS_DIR/clients/cred-bank-002/client.crt"
)"

printf '%s\n' \
  "OAUTH_SIGNING_PRIVATE_KEY_BASE64=$GATEWAY_KEY_BASE64" \
  "DEV_CLIENT_PUBLIC_JWK=$CLIENT_PUBLIC_JWK" \
  "DEV_MTLS_CERT_FINGERPRINT=$MTLS_FINGERPRINT" \
  "DEV_MTLS_CERT_FINGERPRINT_SECOND=$MTLS_FINGERPRINT_SECOND" \
  "DEV_MTLS_CA_CERTIFICATE_BASE64=$MTLS_CA_CERTIFICATE_BASE64" \
  "DEV_MTLS_CRL_BASE64=$MTLS_CRL_BASE64" \
  "DEV_MTLS_CLIENT_CERTIFICATE_BASE64=$MTLS_CLIENT_CERTIFICATE_BASE64" \
  "DEV_MTLS_CLIENT_CERTIFICATE_SECOND_BASE64=$MTLS_CLIENT_CERTIFICATE_SECOND_BASE64" \
  "KEYCLOAK_ADMIN_PASSWORD=$KEYCLOAK_ADMIN_PASSWORD" \
  > "$COMPOSE_ENV"

printf '%s\n' \
  "Local OIDC users:" \
  "  platform-admin / $PLATFORM_ADMIN_PASSWORD" \
  "  organization-admin / $ORGANIZATION_ADMIN_PASSWORD" \
  "  viewer / $VIEWER_PASSWORD"

cd "$ROOT_DIR"
exec docker compose --env-file "$COMPOSE_ENV" up --build --force-recreate "$@"
