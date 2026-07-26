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
printf '%s\n' "$MTLS_FINGERPRINT" > "$SECRETS_DIR/mtls-client.sha256"

printf '%s\n' \
  "OAUTH_SIGNING_PRIVATE_KEY_BASE64=$GATEWAY_KEY_BASE64" \
  "DEV_CLIENT_PUBLIC_JWK=$CLIENT_PUBLIC_JWK" \
  "DEV_MTLS_CERT_FINGERPRINT=$MTLS_FINGERPRINT" \
  > "$COMPOSE_ENV"

cd "$ROOT_DIR"
exec docker compose --env-file "$COMPOSE_ENV" up --build "$@"
