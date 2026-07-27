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
mkdir -p "$SECRETS_DIR/ingress" "$SECRETS_DIR/keycloak" "$SECRETS_DIR/pki"

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
    }
  ],
  "users": [
    {
      "id": "local-platform-admin",
      "username": "platform-admin",
      "email": "platform-admin@local.test",
      "enabled": true,
      "emailVerified": true,
      "credentials": [{"type": "password", "value": "$PLATFORM_ADMIN_PASSWORD", "temporary": false}]
    },
    {
      "id": "local-organization-admin",
      "username": "organization-admin",
      "email": "organization-admin@local.test",
      "enabled": true,
      "emailVerified": true,
      "credentials": [{"type": "password", "value": "$ORGANIZATION_ADMIN_PASSWORD", "temporary": false}]
    },
    {
      "id": "local-viewer",
      "username": "viewer",
      "email": "viewer@local.test",
      "enabled": true,
      "emailVerified": true,
      "credentials": [{"type": "password", "value": "$VIEWER_PASSWORD", "temporary": false}]
    }
  ]
}
EOF

if [[ ! -f "$SECRETS_DIR/gateway-signing-private.pem" ]]; then
  openssl genpkey \
    -algorithm RSA \
    -pkeyopt rsa_keygen_bits:2048 \
    -out "$SECRETS_DIR/gateway-signing-private.pem" >/dev/null 2>&1
fi

if [[ ! -f "$SECRETS_DIR/client-assertion-private.pem" ]]; then
  openssl genpkey \
    -algorithm RSA \
    -pkeyopt rsa_keygen_bits:2048 \
    -out "$SECRETS_DIR/client-assertion-private.pem" >/dev/null 2>&1
fi
openssl pkey \
  -in "$SECRETS_DIR/client-assertion-private.pem" \
  -pubout \
  -out "$SECRETS_DIR/client-assertion-public.pem" >/dev/null 2>&1

if [[ ! -f "$SECRETS_DIR/mtls-ca.key" || ! -f "$SECRETS_DIR/mtls-ca.crt" ]]; then
  openssl req \
    -x509 \
    -newkey rsa:2048 \
    -nodes \
    -days 3650 \
    -subj "/CN=API Gateway Local CA" \
    -keyout "$SECRETS_DIR/mtls-ca.key" \
    -out "$SECRETS_DIR/mtls-ca.crt" >/dev/null 2>&1
fi

if [[ ! -f "$SECRETS_DIR/mtls-server.key" || ! -f "$SECRETS_DIR/mtls-server.crt" ]]; then
  openssl req \
    -newkey rsa:2048 \
    -nodes \
    -subj "/CN=localhost" \
    -keyout "$SECRETS_DIR/mtls-server.key" \
    -out "$SECRETS_DIR/mtls-server.csr" >/dev/null 2>&1
  printf 'subjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n' \
    > "$SECRETS_DIR/mtls-server.ext"
  openssl x509 \
    -req \
    -days 825 \
    -in "$SECRETS_DIR/mtls-server.csr" \
    -CA "$SECRETS_DIR/mtls-ca.crt" \
    -CAkey "$SECRETS_DIR/mtls-ca.key" \
    -CAcreateserial \
    -extfile "$SECRETS_DIR/mtls-server.ext" \
    -out "$SECRETS_DIR/mtls-server.crt" >/dev/null 2>&1
fi

if [[ ! -f "$SECRETS_DIR/mtls-client.key" || ! -f "$SECRETS_DIR/mtls-client.crt" ]]; then
  openssl req \
    -newkey rsa:2048 \
    -nodes \
    -subj "/CN=Bank Partner Development" \
    -keyout "$SECRETS_DIR/mtls-client.key" \
    -out "$SECRETS_DIR/mtls-client.csr" >/dev/null 2>&1
  printf 'extendedKeyUsage=clientAuth\n' > "$SECRETS_DIR/mtls-client.ext"
  openssl x509 \
    -req \
    -days 825 \
    -in "$SECRETS_DIR/mtls-client.csr" \
    -CA "$SECRETS_DIR/mtls-ca.crt" \
    -CAkey "$SECRETS_DIR/mtls-ca.key" \
    -CAcreateserial \
    -extfile "$SECRETS_DIR/mtls-client.ext" \
    -out "$SECRETS_DIR/mtls-client.crt" >/dev/null 2>&1
fi

if [[ ! -f "$SECRETS_DIR/mtls-client-second.key" || ! -f "$SECRETS_DIR/mtls-client-second.crt" ]]; then
  openssl req \
    -newkey rsa:2048 \
    -nodes \
    -subj "/CN=Bank Partner Secondary" \
    -keyout "$SECRETS_DIR/mtls-client-second.key" \
    -out "$SECRETS_DIR/mtls-client-second.csr" >/dev/null 2>&1
  printf 'extendedKeyUsage=clientAuth\n' > "$SECRETS_DIR/mtls-client-second.ext"
  openssl x509 \
    -req \
    -days 825 \
    -in "$SECRETS_DIR/mtls-client-second.csr" \
    -CA "$SECRETS_DIR/mtls-ca.crt" \
    -CAkey "$SECRETS_DIR/mtls-ca.key" \
    -CAcreateserial \
    -extfile "$SECRETS_DIR/mtls-client-second.ext" \
    -out "$SECRETS_DIR/mtls-client-second.crt" >/dev/null 2>&1
fi

cp "$SECRETS_DIR/mtls-server.crt" "$SECRETS_DIR/ingress/server.crt"
cp "$SECRETS_DIR/mtls-server.key" "$SECRETS_DIR/ingress/server.key"
cp "$SECRETS_DIR/mtls-ca.crt" "$SECRETS_DIR/pki/trust-bundle.pem"

CRL_WORK_DIR="$SECRETS_DIR/pki/crl-work"
mkdir -p "$CRL_WORK_DIR"
touch "$CRL_WORK_DIR/index.txt"
printf '1000\n' > "$CRL_WORK_DIR/crlnumber"
cat > "$CRL_WORK_DIR/openssl.cnf" <<EOF
[ ca ]
default_ca = local_ca
[ local_ca ]
database = $CRL_WORK_DIR/index.txt
certificate = $SECRETS_DIR/mtls-ca.crt
private_key = $SECRETS_DIR/mtls-ca.key
default_crl_days = 7
default_md = sha256
EOF
openssl ca \
  -gencrl \
  -config "$CRL_WORK_DIR/openssl.cnf" \
  -out "$SECRETS_DIR/pki/crl-bundle.pem" \
  -batch >/dev/null 2>&1
rm -rf "$CRL_WORK_DIR"

GATEWAY_KEY_BASE64="$(
  openssl base64 -A -in "$SECRETS_DIR/gateway-signing-private.pem"
)"
CLIENT_PUBLIC_JWK="$(
  node -e "
    const fs = require('node:fs');
    const crypto = require('node:crypto');
    const key = crypto.createPublicKey(
      fs.readFileSync(process.argv[1], 'utf8'),
    );
    process.stdout.write(JSON.stringify(key.export({ format: 'jwk' })));
  " "$SECRETS_DIR/client-assertion-public.pem"
)"
MTLS_FINGERPRINT="$(
  openssl x509 \
    -in "$SECRETS_DIR/mtls-client.crt" \
    -noout \
    -fingerprint \
    -sha256 \
  | cut -d= -f2 \
  | tr -d ':' \
  | tr '[:upper:]' '[:lower:]'
)"
MTLS_FINGERPRINT_SECOND="$(
  openssl x509 \
    -in "$SECRETS_DIR/mtls-client-second.crt" \
    -noout \
    -fingerprint \
    -sha256 \
  | cut -d= -f2 \
  | tr -d ':' \
  | tr '[:upper:]' '[:lower:]'
)"
printf '%s\n' "$MTLS_FINGERPRINT" > "$SECRETS_DIR/mtls-client.sha256"
printf '%s\n' "$MTLS_FINGERPRINT_SECOND" > "$SECRETS_DIR/mtls-client-second.sha256"

printf '%s\n' \
  "OAUTH_SIGNING_PRIVATE_KEY_BASE64=$GATEWAY_KEY_BASE64" \
  "DEV_CLIENT_PUBLIC_JWK=$CLIENT_PUBLIC_JWK" \
  "DEV_MTLS_CERT_FINGERPRINT=$MTLS_FINGERPRINT" \
  "DEV_MTLS_CERT_FINGERPRINT_SECOND=$MTLS_FINGERPRINT_SECOND" \
  "KEYCLOAK_ADMIN_PASSWORD=$KEYCLOAK_ADMIN_PASSWORD" \
  > "$COMPOSE_ENV"

printf '%s\n' \
  "Local OIDC users:" \
  "  platform-admin / $PLATFORM_ADMIN_PASSWORD" \
  "  organization-admin / $ORGANIZATION_ADMIN_PASSWORD" \
  "  viewer / $VIEWER_PASSWORD"

cd "$ROOT_DIR"
exec docker compose --env-file "$COMPOSE_ENV" up --build "$@"
