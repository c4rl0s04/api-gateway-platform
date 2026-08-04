#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SECRETS_DIR="${PLATFORM_SECRETS_DIR:-$ROOT_DIR/.local-secrets}"
SDS_DIR="${PLATFORM_SDS_DIR:-$ROOT_DIR/infra/envoy/sds}"
KEYCLOAK_PUBLIC_URL="${PLATFORM_KEYCLOAK_URL:-http://localhost:8081}"
ADMIN_PANEL_PUBLIC_URL="${PLATFORM_ADMIN_PANEL_URL:-http://localhost:8080}"
COMPOSE_ENV="$SECRETS_DIR/compose.env"

export PLATFORM_SECRETS_DIR="$SECRETS_DIR"
export PLATFORM_SDS_DIR="$SDS_DIR"
export PLATFORM_KEYCLOAK_URL="$KEYCLOAK_PUBLIC_URL"
export PLATFORM_ADMIN_PANEL_URL="$ADMIN_PANEL_PUBLIC_URL"

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
mkdir -p "$SDS_DIR"

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
      "redirectUris": ["$ADMIN_PANEL_PUBLIC_URL/api/auth/callback"],
      "webOrigins": ["$ADMIN_PANEL_PUBLIC_URL"],
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
npm run build --workspace=packages/shared >/dev/null
npm run build --workspace=packages/pki >/dev/null
node scripts/bootstrap-local-pki.mjs "$SECRETS_DIR"
for sds_file in server-certificate.yaml client-validation.yaml; do
  if [[ ! -f "$SDS_DIR/$sds_file" ]]; then
    cp "$ROOT_DIR/infra/envoy/sds/$sds_file" "$SDS_DIR/$sds_file"
  fi
done

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
  "Local OIDC credentials: $KEYCLOAK_USERS_ENV"

if [[ "${PLATFORM_BOOTSTRAP_ONLY:-0}" == "1" ]]; then
  exit 0
fi

cd "$ROOT_DIR"
compose_arguments=(compose)
if [[ -n "${PLATFORM_COMPOSE_PROJECT:-}" ]]; then
  compose_arguments+=(--project-name "$PLATFORM_COMPOSE_PROJECT")
fi
if [[ -n "${PLATFORM_COMPOSE_FILES:-}" ]]; then
  IFS=':' read -r -a compose_files <<< "$PLATFORM_COMPOSE_FILES"
  for compose_file in "${compose_files[@]}"; do
    compose_arguments+=(--file "$compose_file")
  done
fi
exec docker "${compose_arguments[@]}" \
  --env-file "$COMPOSE_ENV" \
  up --build --force-recreate "$@"
