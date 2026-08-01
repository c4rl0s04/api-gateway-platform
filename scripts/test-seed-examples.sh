#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_ENV="$ROOT_DIR/.local-secrets/compose.env"
CA_CERTIFICATE="$ROOT_DIR/.local-secrets/pki/authorities/local-development/ca.crt"

if [[ ! -f "$COMPOSE_ENV" || ! -f "$CA_CERTIFICATE" ]]; then
  echo "Local platform material is missing. Run npm run dev:local:detached first." >&2
  exit 1
fi

cd "$ROOT_DIR"

database_value() {
  docker compose --env-file "$COMPOSE_ENV" exec -T postgres \
    psql -U postgres -d apigw -At -c "$1"
}

gateway_status() {
  local origin="$1"
  local path="$2"
  shift 2
  curl --silent --show-error --cacert "$CA_CERTIFICATE" \
    "$@" --output /dev/null --write-out '%{http_code}' "$origin$path"
}

known_proxies="'proxy-platform-oauth','proxy-es-banking','proxy-us-banking','proxy-uk-logistics','proxy-fr-ecommerce','proxy-es-ecommerce','proxy-de-healthcare','proxy-us-identity','proxy-jp-iot','proxy-br-streaming','proxy-kr-gaming'"

[[ "$(database_value "SELECT count(*) FROM \"ApiProxyRevision\" WHERE \"proxyId\" IN ($known_proxies);")" == "16" ]]
[[ "$(database_value "SELECT count(*) FROM \"ProxyDeployment\" WHERE \"proxyId\" IN ($known_proxies);")" == "48" ]]
[[ "$(database_value "SELECT count(*) FROM \"ProxyDeployment\" d JOIN \"ApiProxyRevision\" r ON r.id=d.\"revisionId\" WHERE d.\"proxyId\"='proxy-es-banking' AND r.\"revisionNumber\"=2 AND d.status='active';")" == "2" ]]
[[ "$(database_value "SELECT count(*) FROM \"ProxyDeployment\" d JOIN \"ApiProxyRevision\" r ON r.id=d.\"revisionId\" WHERE d.\"proxyId\"='proxy-es-banking' AND r.\"revisionNumber\"=3;")" == "0" ]]
[[ "$(database_value "SELECT count(*) FROM \"ProxyDeployment\" WHERE \"proxyId\"='proxy-uk-logistics' AND status='active';")" == "3" ]]
[[ "$(database_value "SELECT count(*) FROM \"ProxyDeployment\" d JOIN \"ApiProxyRevision\" r ON r.id=d.\"revisionId\" WHERE d.\"proxyId\"='proxy-fr-ecommerce' AND d.status='active' AND r.\"revisionNumber\"=1;")" == "1" ]]
[[ "$(database_value "SELECT count(*) FROM \"ProxyDeployment\" WHERE \"proxyId\"='proxy-fr-ecommerce';")" == "3" ]]

qual_es='https://qual-es.gateway.localhost:8443'
pprod_es='https://pprod-es.gateway.localhost:8443'
qual_us='https://qual-us.gateway.localhost:8443'
prod_uk='https://prod-uk.gateway.localhost:8443'
qual_fr='https://qual-fr.gateway.localhost:8443'
qual_jp='https://qual-jp.gateway.localhost:8443'
qual_br='https://qual-br.gateway.localhost:8443'
qual_kr='https://qual-kr.gateway.localhost:8443'

[[ "$(gateway_status "$qual_es" '/es/banking/v1/status')" == "200" ]]
[[ "$(gateway_status "$qual_es" '/es/banking/v1/accounts')" == "401" ]]
[[ "$(gateway_status "$qual_es" '/es/banking/v1/accounts' -H 'x-api-key: dev-bank-key-abc123')" == "200" ]]
[[ "$(gateway_status "$pprod_es" '/es/banking/v1/accounts' -H 'x-api-key: dev-bank-key-abc123')" == "200" ]]
[[ "$(gateway_status "$qual_es" '/es/banking/v2/accounts')" == "404" ]]

[[ "$(gateway_status "$qual_us" '/us/banking/v2/cards' -H 'x-api-key: dev-bank-key-abc123')" == "401" ]]
[[ "$(gateway_status "$qual_us" '/us/banking/v2/cards' -H 'x-partner-key: dev-bank-key-abc123')" == "200" ]]
[[ "$(gateway_status "$prod_uk" '/uk/logistics/v1/shipments' -H 'x-api-key: dev-logistics-key-001')" == "200" ]]
[[ "$(gateway_status "$qual_fr" '/fr/ecommerce/v1/products' -H 'x-api-key: dev-commerce-key-001')" == "200" ]]
[[ "$(gateway_status "$qual_br" '/br/streaming/v1/catalog')" == "200" ]]
[[ "$(gateway_status "$qual_br" '/br/streaming/v1/catalog/mov1')" == "200" ]]
[[ "$(gateway_status "$qual_kr" '/kr/gaming/v1/leaderboards' -H 'x-api-key: dev-gaming-key-001')" == "200" ]]

iot_token_response="$(curl --silent --show-error --fail --cacert "$CA_CERTIFICATE" \
  --user 'dev-iot-key-001:dev-iot-secret-001-0123456789abcdef' \
  --header 'content-type: application/x-www-form-urlencoded' \
  --data 'grant_type=client_credentials&scope=iot%3Aread' \
  "$qual_jp/oauth/token")"
iot_token="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).access_token)' "$iot_token_response")"
[[ "$(gateway_status "$qual_jp" '/jp/iot/v1/devices' -H "authorization: Bearer $iot_token")" == "200" ]]

before="$(database_value "SELECT (SELECT count(*) FROM \"ApiProxyRevision\" WHERE \"proxyId\" IN ($known_proxies)) || ':' || (SELECT count(*) FROM \"ProxyDeployment\" WHERE \"proxyId\" IN ($known_proxies));")"
docker compose --env-file "$COMPOSE_ENV" run --rm --no-deps database-setup \
  npm run db:seed:policies --workspace=packages/database >/dev/null
after="$(database_value "SELECT (SELECT count(*) FROM \"ApiProxyRevision\" WHERE \"proxyId\" IN ($known_proxies)) || ':' || (SELECT count(*) FROM \"ProxyDeployment\" WHERE \"proxyId\" IN ($known_proxies));")"
[[ "$before" == "16:48" && "$after" == "$before" ]]

echo "Seed revision and policy examples passed"
