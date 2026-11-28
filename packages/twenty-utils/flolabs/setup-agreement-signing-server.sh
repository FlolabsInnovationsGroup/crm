#!/usr/bin/env bash
# Gives the CRM its Documenso settings for Send agreement, restarts it, checks
# the token, and prints the webhook to add in Documenso. Run on the CRM server
# as root after setup-documenso.sh. Asks for the token without showing it.
# Safe to run again: it keeps the webhook secret (ROTATE_WEBHOOK_SECRET=1 makes
# a new one, which must then be pasted into Documenso again).
set -euo pipefail

cd /opt/flolabs-crm
SIGNING_FILE=docker-compose.flolabs-documenso.yml
WEBHOOK_URL=https://crm.flolabsinnovations.com/webhooks/flolabs-documenso

fail() {
  echo "!! $*" >&2
  exit 1
}

grep -q '^COMPOSE_FILE=' .env || fail "No COMPOSE_FILE line in .env."

read -rsp "Paste the Documenso API token (starts with api_): " TOKEN
echo
[[ "$TOKEN" =~ ^api_[A-Za-z0-9_-]+$ ]] || fail "That does not look like a Documenso API token."

# Checked through the running CRM before anything changes, so a wrong token
# leaves the server as it was. The token goes in on stdin, never as an argument.
echo "==> Checking the token with Documenso"
CODE=$(printf '%s' "$TOKEN" | docker compose exec -T server node -e "
let token = '';
process.stdin.on('data', (chunk) => (token += chunk)).on('end', () =>
  fetch((process.env.FLOLABS_DOCUMENSO_API_URL || 'http://documenso:3000') + '/api/v2/envelope?perPage=1', { headers: { authorization: token } })
    .then((response) => console.log(response.status))
    .catch(() => console.log('unreachable')));" 2>/dev/null || echo unreachable)
case "$CODE" in
  200) echo "  Documenso accepted the token." ;;
  401 | 403) fail "Documenso refused the token. Make a new one in Documenso and run this again." ;;
  429) fail "Documenso is rate limiting; wait a minute and run this again." ;;
  *) fail "The CRM could not reach Documenso (answer: $CODE). Check: cd /opt/flolabs-sign && docker compose ps" ;;
esac

read -rp "Email of the person who signs for FloLabs [john@flolabsinnovations.com]: " COUNTERSIGNER_EMAIL
COUNTERSIGNER_EMAIL=${COUNTERSIGNER_EMAIL:-john@flolabsinnovations.com}
EMAIL_PATTERN='^[^[:space:]"$@'"'"']+@[^[:space:]"$@'"'"']+\.[A-Za-z]+$'
[[ "$COUNTERSIGNER_EMAIL" =~ $EMAIL_PATTERN ]] || fail "That is not an email address."

read -rp "Their name as it should appear on the agreement [John Hazlewood]: " COUNTERSIGNER_NAME
COUNTERSIGNER_NAME=${COUNTERSIGNER_NAME:-John Hazlewood}
# Compose reads $ as a variable even inside quotes.
NAME_PATTERN='^[^"$'"'"']+$'
[[ "$COUNTERSIGNER_NAME" =~ $NAME_PATTERN ]] || fail "The name cannot contain quotes or \$."

# Documenso keeps the secret it was given, so a new one is only safe together
# with pasting it into Documenso's webhook again.
SECRET=""
if [ "${ROTATE_WEBHOOK_SECRET:-0}" != 1 ] && [ -f "$SIGNING_FILE" ]; then
  SECRET=$(sed -n "s/^ *FLOLABS_DOCUMENSO_WEBHOOK_SECRET: '\([0-9a-f]*\)'$/\1/p" "$SIGNING_FILE" | head -1)
fi
NEW_SECRET=false
if [ -z "$SECRET" ]; then
  SECRET=$(openssl rand -hex 32)
  NEW_SECRET=true
fi

STAMP=$(date +%Y%m%d-%H%M%S)
cp .env ".env.before-documenso-$STAMP"
[ -f "$SIGNING_FILE" ] && cp "$SIGNING_FILE" "$SIGNING_FILE.before-$STAMP"

umask 077
ENVIRONMENT="      FLOLABS_DOCUMENSO_API_TOKEN: '$TOKEN'
      FLOLABS_DOCUMENSO_WEBHOOK_SECRET: '$SECRET'
      FLOLABS_AGREEMENT_COUNTERSIGNER_EMAIL: '$COUNTERSIGNER_EMAIL'
      FLOLABS_AGREEMENT_COUNTERSIGNER_NAME: '$COUNTERSIGNER_NAME'"
cat > "$SIGNING_FILE" <<YAML
services:
  server:
    environment:
$ENVIRONMENT
  worker:
    environment:
$ENVIRONMENT
YAML
chmod 600 "$SIGNING_FILE"
unset TOKEN ENVIRONMENT

if ! grep -q '^COMPOSE_FILE=.*docker-compose\.flolabs-documenso\.yml' .env; then
  sed -i "s#^COMPOSE_FILE=\(.*\)#COMPOSE_FILE=\1:$SIGNING_FILE#" .env
fi

rollback() {
  echo "!! The CRM did not come back healthy, putting the old settings back" >&2
  cp ".env.before-documenso-$STAMP" .env
  if [ -f "$SIGNING_FILE.before-$STAMP" ]; then
    cp "$SIGNING_FILE.before-$STAMP" "$SIGNING_FILE"
  else
    rm -f "$SIGNING_FILE"
  fi
  docker compose up -d server worker
  exit 1
}

docker compose config -q >/dev/null || rollback

echo "==> Restarting the CRM"
docker compose up -d server worker || rollback

STATUS=unknown
for _ in $(seq 1 60); do
  STATUS=$(docker inspect -f '{{.State.Health.Status}}' flolabs-crm-server-1 2>/dev/null || echo unknown)
  [ "$STATUS" = healthy ] && break
  sleep 5
done
[ "$STATUS" = healthy ] || rollback
rm -f "$SIGNING_FILE".before-*

echo "==> Checking the settings reached the CRM (names only, no values)"
docker compose exec -T server sh -c '
missing=0
check() { if [ -n "$2" ]; then echo "  $1: set"; else echo "  $1: MISSING"; missing=1; fi; }
check "FLOLABS_WORKSPACE_ID or FLOLABS_PAYMENTS_WORKSPACE_ID" "${FLOLABS_WORKSPACE_ID:-${FLOLABS_PAYMENTS_WORKSPACE_ID:-}}"
check FLOLABS_DOCUMENSO_API_TOKEN "${FLOLABS_DOCUMENSO_API_TOKEN:-}"
check FLOLABS_DOCUMENSO_WEBHOOK_SECRET "${FLOLABS_DOCUMENSO_WEBHOOK_SECRET:-}"
check FLOLABS_AGREEMENT_COUNTERSIGNER_EMAIL "${FLOLABS_AGREEMENT_COUNTERSIGNER_EMAIL:-}"
check FLOLABS_AGREEMENT_COUNTERSIGNER_NAME "${FLOLABS_AGREEMENT_COUNTERSIGNER_NAME:-}"
exit $missing' || fail "Send agreement stays off until the missing settings are there."

if [ "$NEW_SECRET" = true ]; then
  cat <<DONE

Last step, in Documenso (signed in as hr@): Settings > Webhooks > Create webhook
  URL:     $WEBHOOK_URL
  Events:  document.recipient.completed, document.completed,
           document.rejected, document.cancelled
  Secret:  $SECRET
Copy the secret straight into that form. Do not send it in chat or email.
DONE
else
  echo
  echo "The webhook secret is unchanged; the webhook already in Documenso keeps working."
fi
