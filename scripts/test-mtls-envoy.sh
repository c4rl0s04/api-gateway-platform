#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SECRETS_DIR="$ROOT_DIR/.local-secrets"
SDS_FILE="$ROOT_DIR/infra/envoy/sds/client-validation.yaml"
CRL_FILE="$SECRETS_DIR/pki/crl-bundle.pem"
WORK_DIR="$(mktemp -d)"

restore_crl() {
  : > "$WORK_DIR/index.txt"
  printf '1000\n' > "$WORK_DIR/crlnumber"
  openssl ca -gencrl -config "$WORK_DIR/openssl.cnf" \
    -out "$CRL_FILE.next" -batch >/dev/null 2>&1
  mv "$CRL_FILE.next" "$CRL_FILE"
  touch "$SDS_FILE"
  rm -rf "$WORK_DIR"
}
trap restore_crl EXIT

cat > "$WORK_DIR/openssl.cnf" <<EOF
[ ca ]
default_ca = local_ca
[ local_ca ]
database = $WORK_DIR/index.txt
certificate = $SECRETS_DIR/mtls-ca.crt
private_key = $SECRETS_DIR/mtls-ca.key
default_crl_days = 7
default_md = sha256
unique_subject = no
EOF
: > "$WORK_DIR/index.txt"
printf '1000\n' > "$WORK_DIR/crlnumber"

request() {
  local certificate="$1"
  local key="$2"
  curl --silent --show-error \
    --cacert "$SECRETS_DIR/mtls-ca.crt" \
    --cert "$certificate" \
    --key "$key" \
    -o /dev/null \
    -w '%{http_code}' \
    https://localhost:8443/es/banking/v1/health
}

[[ "$(request "$SECRETS_DIR/mtls-client.crt" "$SECRETS_DIR/mtls-client.key")" == "200" ]]
[[ "$(request "$SECRETS_DIR/mtls-client-second.crt" "$SECRETS_DIR/mtls-client-second.key")" == "200" ]]

spoof_status="$(
  curl --silent --show-error \
    --cacert "$SECRETS_DIR/mtls-ca.crt" \
    -H "x-gateway-client-cert-sha256: $(cat "$SECRETS_DIR/mtls-client.sha256")" \
    -o /dev/null \
    -w '%{http_code}' \
    https://localhost:8443/es/banking/v1/health
)"
[[ "$spoof_status" == "401" ]]

openssl ca -config "$WORK_DIR/openssl.cnf" \
  -revoke "$SECRETS_DIR/mtls-client.crt" \
  -crl_reason keyCompromise \
  -batch >/dev/null 2>&1
openssl ca -gencrl -config "$WORK_DIR/openssl.cnf" \
  -out "$CRL_FILE.next" -batch >/dev/null 2>&1
mv "$CRL_FILE.next" "$CRL_FILE"
touch "$SDS_FILE"
sleep 2

if request "$SECRETS_DIR/mtls-client.crt" "$SECRETS_DIR/mtls-client.key" >/dev/null 2>&1; then
  echo "Revoked client certificate was accepted" >&2
  exit 1
fi
[[ "$(request "$SECRETS_DIR/mtls-client-second.crt" "$SECRETS_DIR/mtls-client-second.key")" == "200" ]]

echo "mTLS Envoy integration checks passed"
