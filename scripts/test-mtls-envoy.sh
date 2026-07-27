#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SECRETS_DIR="$ROOT_DIR/.local-secrets"
SDS_FILE="$ROOT_DIR/infra/envoy/sds/client-validation.yaml"
CRL_FILE="$SECRETS_DIR/pki/crl-bundle.pem"
CA_CERTIFICATE="$SECRETS_DIR/pki/authorities/local-development/ca.crt"
FIRST_CLIENT="$SECRETS_DIR/clients/cred-bank-001"
SECOND_CLIENT="$SECRETS_DIR/clients/cred-bank-002"
WORK_DIR="$(mktemp -d)"

trigger_sds_reload() {
  cp "$SDS_FILE" "$SDS_FILE.next"
  mv "$SDS_FILE.next" "$SDS_FILE"
}

restore_crl() {
  : > "$WORK_DIR/index.txt"
  printf '1000\n' > "$WORK_DIR/crlnumber"
  openssl ca -gencrl -config "$WORK_DIR/openssl.cnf" \
    -out "$CRL_FILE.next" -batch >/dev/null 2>&1
  mv "$CRL_FILE.next" "$CRL_FILE"
  trigger_sds_reload
  rm -rf "$WORK_DIR"
}
trap restore_crl EXIT

cat > "$WORK_DIR/openssl.cnf" <<EOF
[ ca ]
default_ca = local_ca
[ local_ca ]
database = $WORK_DIR/index.txt
certificate = $CA_CERTIFICATE
private_key = $WORK_DIR/ca.key
default_crl_days = 7
default_md = sha256
unique_subject = no
EOF
: > "$WORK_DIR/index.txt"
printf '1000\n' > "$WORK_DIR/crlnumber"
node --input-type=module - "$SECRETS_DIR" > "$WORK_DIR/ca.key" <<'EOF'
import {
  EncryptedFileKeyStore,
  loadOrCreateMasterKey,
} from './packages/pki/dist/index.js';
import path from 'node:path';
const root = process.argv[2];
const master = await loadOrCreateMasterKey(path.join(root, 'pki/master.key'));
const store = new EncryptedFileKeyStore(path.join(root, 'pki/keystore'), master);
process.stdout.write(await store.get('authorities/local-development'));
EOF
chmod 600 "$WORK_DIR/ca.key"

request() {
  local certificate="$1"
  local key="$2"
  curl --silent --show-error \
    --cacert "$CA_CERTIFICATE" \
    --cert "$certificate" \
    --key "$key" \
    -o /dev/null \
    -w '%{http_code}' \
    https://localhost:8443/es/banking/v1/health
}

[[ "$(request "$FIRST_CLIENT/client.crt" "$FIRST_CLIENT/client.key")" == "200" ]]
[[ "$(request "$SECOND_CLIENT/client.crt" "$SECOND_CLIENT/client.key")" == "200" ]]

spoof_status="$(
  curl --silent --show-error \
    --cacert "$CA_CERTIFICATE" \
    -H "x-gateway-client-cert-sha256: $(cat "$FIRST_CLIENT/fingerprint.sha256")" \
    -o /dev/null \
    -w '%{http_code}' \
    https://localhost:8443/es/banking/v1/health
)"
[[ "$spoof_status" == "401" ]]

openssl ca -config "$WORK_DIR/openssl.cnf" \
  -revoke "$FIRST_CLIENT/client.crt" \
  -crl_reason keyCompromise \
  -batch >/dev/null 2>&1
openssl ca -gencrl -config "$WORK_DIR/openssl.cnf" \
  -out "$CRL_FILE.next" -batch >/dev/null 2>&1
mv "$CRL_FILE.next" "$CRL_FILE"
trigger_sds_reload
sleep 2

if request "$FIRST_CLIENT/client.crt" "$FIRST_CLIENT/client.key" >/dev/null 2>&1; then
  echo "Revoked client certificate was accepted" >&2
  exit 1
fi
[[ "$(request "$SECOND_CLIENT/client.crt" "$SECOND_CLIENT/client.key")" == "200" ]]

echo "mTLS Envoy integration checks passed"
