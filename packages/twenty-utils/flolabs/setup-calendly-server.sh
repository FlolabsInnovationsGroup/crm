#!/usr/bin/env bash
# Gives the CRM its Calendly settings for the meeting tracker, restarts it and
# registers the booking webhook in each Calendly account. Run on the CRM server
# as root. Asks for the tokens without showing them. Safe to run again: it
# keeps the webhook signing key (ROTATE_SIGNING_KEY=1 makes a new one) and
# re-registers the webhooks.
set -euo pipefail

cd /opt/flolabs-crm
CALENDLY_FILE=docker-compose.flolabs-calendly.yml
PUBLIC_HOST=crm.flolabsinnovations.com
WEBHOOK_URL="https://$PUBLIC_HOST/webhooks/flolabs-calendly"

TOKENS=()
while :; do
  read -rsp "Paste a Calendly personal access token (or just press Enter when done): " TOKEN
  echo
  [ -z "$TOKEN" ] && break
  case "$TOKEN" in *[[:space:],\']*)
    echo "That does not look like a token (it has spaces, commas or quotes). Stopping." >&2; exit 1;;
  esac
  TOKENS+=("$TOKEN")
done
unset TOKEN
[ "${#TOKENS[@]}" -gt 0 ] || { echo "No token given. Stopping." >&2; exit 1; }
echo "Got ${#TOKENS[@]} token(s)."

grep -q '^COMPOSE_FILE=' .env || { echo "No COMPOSE_FILE line in .env. Stopping." >&2; exit 1; }

JOINED_TOKENS=$(IFS=,; echo "${TOKENS[*]}")
unset TOKENS
# Calendly keeps signing with the key the subscription was made with, so a
# new key is only safe together with re-registering every subscription.
SIGNING_KEY=""
if [ "${ROTATE_SIGNING_KEY:-0}" != 1 ] && [ -f "$CALENDLY_FILE" ]; then
  SIGNING_KEY=$(sed -n "s/^ *FLOLABS_CALENDLY_SIGNING_KEY: '\([0-9a-f]*\)'$/\1/p" "$CALENDLY_FILE" | head -1)
fi
[ -n "$SIGNING_KEY" ] || SIGNING_KEY=$(openssl rand -hex 32)

STAMP=$(date +%Y%m%d-%H%M%S)
cp .env ".env.before-calendly-$STAMP"
[ -f "$CALENDLY_FILE" ] && cp "$CALENDLY_FILE" "$CALENDLY_FILE.before-$STAMP"

umask 077
cat > "$CALENDLY_FILE" <<YAML
services:
  server:
    environment:
      FLOLABS_CALENDLY_TOKENS: '$JOINED_TOKENS'
      FLOLABS_CALENDLY_SIGNING_KEY: '$SIGNING_KEY'
  worker:
    environment:
      FLOLABS_CALENDLY_TOKENS: '$JOINED_TOKENS'
      FLOLABS_CALENDLY_SIGNING_KEY: '$SIGNING_KEY'
YAML
chmod 600 "$CALENDLY_FILE"
unset JOINED_TOKENS SIGNING_KEY

if ! grep -q "$CALENDLY_FILE" .env; then
  sed -i "s#^COMPOSE_FILE=\(.*\)#COMPOSE_FILE=\1:$CALENDLY_FILE#" .env
fi
grep '^COMPOSE_FILE=' .env

rollback() {
  echo "!! The CRM did not come back healthy, putting the old settings back" >&2
  cp ".env.before-calendly-$STAMP" .env
  if [ -f "$CALENDLY_FILE.before-$STAMP" ]; then
    cp "$CALENDLY_FILE.before-$STAMP" "$CALENDLY_FILE"
  else
    rm -f "$CALENDLY_FILE"
  fi
  docker compose up -d server worker
  exit 1
}

echo "==> Restarting the CRM"
docker compose up -d server worker

STATUS=unknown
for _ in $(seq 1 60); do
  STATUS=$(docker inspect -f '{{.State.Health.Status}}' flolabs-crm-server-1 2>/dev/null || echo unknown)
  [ "$STATUS" = healthy ] && break
  sleep 5
done
[ "$STATUS" = healthy ] || rollback

echo "==> Checking the settings reached the CRM (names only, no values)"
docker compose exec -T server sh -c 'for name in FLOLABS_PAYMENTS_WORKSPACE_ID FLOLABS_CALENDLY_TOKENS FLOLABS_CALENDLY_SIGNING_KEY; do eval "v=\${$name:-}"; [ -n "$v" ] && echo "  $name: set" || echo "  $name: MISSING"; done'

echo "==> Registering the booking webhook in each Calendly account"
# Runs inside the server container so the tokens never appear on a command line.
if ! docker compose exec -T -e WEBHOOK_URL="$WEBHOOK_URL" server node --input-type=module - <<'JS'
const API = 'https://api.calendly.com';
const url = process.env.WEBHOOK_URL;
const signingKey = process.env.FLOLABS_CALENDLY_SIGNING_KEY;
const tokens = process.env.FLOLABS_CALENDLY_TOKENS.split(',').filter(Boolean);

const call = async (token, target, init = {}) => {
  if (!target.startsWith(`${API}/`)) throw new Error('Refusing a non-Calendly URL');
  const response = await fetch(target, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
};

for (const [index, token] of tokens.entries()) {
  const me = await call(token, `${API}/users/me`);
  if (me.status !== 200) {
    console.log(`  token ${index + 1}: Calendly answered ${me.status}; check the token and its scopes`);
    process.exitCode = 1;
    continue;
  }
  const { uri: user, current_organization: organization, email } = me.body.resource;

  // An old subscription keeps its old signing key, so it is replaced.
  const existing = await call(
    token,
    `${API}/webhook_subscriptions?${new URLSearchParams({ organization, user, scope: 'user', count: '100' })}`,
  );
  for (const subscription of existing.body?.collection ?? []) {
    if (subscription.callback_url === url) {
      const removed = await call(token, subscription.uri, { method: 'DELETE' });
      if (removed.status !== 204 && removed.status !== 200) {
        console.log(`  ${email}: could not remove the old webhook (${removed.status})`);
      }
    }
  }

  const created = await call(token, `${API}/webhook_subscriptions`, {
    method: 'POST',
    body: JSON.stringify({
      url,
      events: ['invitee.created', 'invitee.canceled'],
      organization,
      user,
      scope: 'user',
      signing_key: signingKey,
    }),
  });
  if (created.status === 201) {
    console.log(`  ${email}: webhook registered`);
  } else {
    console.log(`  ${email}: webhook NOT registered (${created.status}) ${JSON.stringify(created.body?.message ?? created.body)}`);
    process.exitCode = 1;
  }
}
JS
then
  echo "!! At least one Calendly account did not get the webhook. Bookings from it" >&2
  echo "!! will not reach the CRM. Fix the token or scopes and run this again." >&2
  exit 1
fi

# The backups hold old tokens; the CRM is healthy, so they are no longer needed.
rm -f "$CALENDLY_FILE".before-*

echo "==> Checking the webhook answers (expects 400 for an unsigned request)"
CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 \
  --resolve "$PUBLIC_HOST:443:127.0.0.1" -X POST \
  -H 'content-type: application/json' -d '{}' \
  "$WEBHOOK_URL")
echo "  webhook answered: $CODE"
[ "$CODE" = 400 ] && echo "All good." || echo "Unexpected answer; send me this output."
