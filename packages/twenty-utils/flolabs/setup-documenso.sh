#!/usr/bin/env bash
# Runs Documenso, the signing engine for CRM agreements, at
# https://sign.flolabsinnovations.com beside the CRM, served by the CRM's Caddy.
# Safe to run again. See docs/flolabs/documenso.md.
#
#   sudo bash setup-documenso.sh          install or update
#   sudo bash setup-documenso.sh --lock   close sign-up once the admin account exists
set -euo pipefail

DOMAIN="${DOCUMENSO_DOMAIN:-sign.flolabsinnovations.com}"
SIGNUP_DOMAIN=flolabsinnovations.com
DIR=/opt/flolabs-sign
CRM_NETWORK="${CRM_NETWORK:-flolabs-crm_default}"
IMAGE=documenso/documenso:v2.21.0
SELF=$(readlink -f "$0")

fail() {
  echo "!! $*" >&2
  exit 1
}

[ "$(id -u)" = 0 ] || fail "Run as root (sudo)."
[[ "$DOMAIN" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ ]] || fail "DOCUMENSO_DOMAIN '$DOMAIN' is not a host name."

health() {
  docker compose -f "$DIR/compose.yml" exec -T documenso node -e \
    "fetch('http://localhost:3000/api/health').then(r=>r.text()).then(t=>console.log(t)).catch(()=>console.log('{}'))" 2>/dev/null || echo '{}'
}

if [ "${1:-}" = "--lock" ]; then
  cd "$DIR" 2>/dev/null && grep -q '^DISABLE_SIGNUP=' .env || fail "Run the install first."
  echo "==> Accounts that exist now (delete any you do not know before going on):"
  docker compose exec -T database psql -U documenso -d documenso -c \
    'select email, "emailVerified" is not null as verified, "createdAt" from "User" order by "createdAt"'
  sed -i 's/^DISABLE_SIGNUP=.*/DISABLE_SIGNUP=true/' .env
  docker compose up -d documenso
  sleep 5
  [ "$(docker compose exec -T documenso printenv NEXT_PUBLIC_DISABLE_SIGNUP)" = true ] \
    || fail "Documenso did not pick up DISABLE_SIGNUP=true. Check: cd $DIR && docker compose logs --tail 80 documenso"
  echo "Sign-up is closed. Only the accounts listed above can sign in."
  exit 0
fi

docker network inspect "$CRM_NETWORK" >/dev/null 2>&1 || fail "The CRM network $CRM_NETWORK does not exist."

mapfile -t CADDIES < <(docker ps --filter label=com.docker.compose.service=caddy --filter network="$CRM_NETWORK" --format '{{.Names}}')
[ "${#CADDIES[@]}" = 1 ] || fail "Expected one Caddy container on $CRM_NETWORK, found ${#CADDIES[@]}: ${CADDIES[*]:-none}."
CADDY=${CADDIES[0]}
CADDY_MOUNT=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/etc/caddy/Caddyfile"}}{{.Source}}{{end}}{{end}}' "$CADDY")
if [ -z "$CADDY_MOUNT" ]; then
  CADDY_MOUNT=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/etc/caddy"}}{{.Source}}{{end}}{{end}}' "$CADDY")
  CADDYFILE="$CADDY_MOUNT/Caddyfile"
else
  CADDYFILE=$CADDY_MOUNT
fi
[ -n "$CADDY_MOUNT" ] && [ -f "$CADDYFILE" ] || fail "Could not find the Caddyfile mounted into $CADDY at /etc/caddy/Caddyfile."
CADDY_DIR=$(dirname "$CADDYFILE")

SERVER_IP=$(curl -fsS --max-time 10 https://api.ipify.org || true)
# This server's own DNS lookups sometimes time out (see deploy.sh).
DNS_IP=
for _ in 1 2 3; do
  DNS_IP=$(getent ahostsv4 "$DOMAIN" | awk 'NR==1 {print $1}' || true)
  [ -n "$DNS_IP" ] && break
  sleep 3
done
[ -n "$DNS_IP" ] || fail "$DOMAIN has no A record yet. Add one pointing to this server and wait a few minutes."
if [ -n "$SERVER_IP" ]; then
  [ "$DNS_IP" = "$SERVER_IP" ] || fail "$DOMAIN points to $DNS_IP, but this server is $SERVER_IP. Fix the A record first."
else
  ip -4 addr | grep -qw "$DNS_IP" || echo "?? Could not confirm $DOMAIN ($DNS_IP) is this server; going on."
fi
if getent ahostsv6 "$DOMAIN" | grep -qv '::ffff:'; then
  fail "$DOMAIN has an AAAA record; remove it, or Caddy may fail to get a certificate."
fi

mkdir -p "$DIR"
cd "$DIR"
umask 077

if [ ! -f .env ]; then
  cat > .env.new <<ENV
POSTGRES_PASSWORD=$(openssl rand -hex 24)
NEXTAUTH_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
ENCRYPTION_SECONDARY_KEY=$(openssl rand -hex 32)
CERT_PASS=$(openssl rand -hex 16)
DISABLE_SIGNUP=false
ENV
  mv .env.new .env
fi

# An earlier failed run can leave Docker's empty directory in its place.
[ -d cert.p12 ] && rmdir cert.p12
if [ ! -f cert.p12 ]; then
  CERT_PASS=$(grep '^CERT_PASS=' .env | cut -d= -f2-)
  [ -n "$CERT_PASS" ] || fail "CERT_PASS is missing from $DIR/.env."
  # Self-signed, valid 10 years. Replace with a certificate authority's when
  # John wants signatures trusted by Adobe.
  openssl req -new -x509 -newkey rsa:3072 -nodes -days 3650 \
    -keyout private.key -out certificate.crt \
    -subj "/C=US/O=FloLabs Innovations Group/CN=FloLabs Signing" 2>/dev/null
  CERT_PASS=$CERT_PASS openssl pkcs12 -export -out cert.p12.new \
    -inkey private.key -in certificate.crt -password env:CERT_PASS
  rm -f private.key certificate.crt
  # The app runs as uid 1001 inside its container.
  chown 1001:1001 cert.p12.new
  chmod 400 cert.p12.new
  mv cert.p12.new cert.p12
fi

cat > compose.yml <<YAML
name: flolabs-sign

services:
  database:
    image: postgres:15
    restart: unless-stopped
    mem_limit: 512m
    environment:
      POSTGRES_USER: documenso
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}
      POSTGRES_DB: documenso
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U documenso -d documenso']
      interval: 5s
      timeout: 5s
      retries: 20
    volumes:
      - database:/var/lib/postgresql/data
    networks:
      sign:
        aliases: [documenso-db]

  # The CRM sends the signing links itself; Documenso's own emails (account
  # checks only) are caught here and read through an SSH tunnel.
  mailpit:
    image: axllent/mailpit:v1.33.0
    restart: unless-stopped
    mem_limit: 128m
    ports:
      - 127.0.0.1:8026:8025
    networks:
      sign:
        aliases: [documenso-mailpit]

  documenso:
    image: $IMAGE
    restart: unless-stopped
    mem_limit: 1536m
    depends_on:
      database:
        condition: service_healthy
    environment:
      PORT: 3000
      NEXTAUTH_SECRET: \${NEXTAUTH_SECRET}
      NEXT_PRIVATE_ENCRYPTION_KEY: \${ENCRYPTION_KEY}
      NEXT_PRIVATE_ENCRYPTION_SECONDARY_KEY: \${ENCRYPTION_SECONDARY_KEY}
      NEXT_PUBLIC_WEBAPP_URL: https://$DOMAIN
      NEXT_PRIVATE_INTERNAL_WEBAPP_URL: http://localhost:3000
      NEXT_PRIVATE_DATABASE_URL: postgres://documenso:\${POSTGRES_PASSWORD}@documenso-db:5432/documenso
      NEXT_PRIVATE_DIRECT_DATABASE_URL: postgres://documenso:\${POSTGRES_PASSWORD}@documenso-db:5432/documenso
      NEXT_PUBLIC_UPLOAD_TRANSPORT: database
      NEXT_PUBLIC_DISABLE_SIGNUP: \${DISABLE_SIGNUP}
      NEXT_PRIVATE_ALLOWED_SIGNUP_DOMAINS: $SIGNUP_DOMAIN
      NEXT_PRIVATE_SMTP_TRANSPORT: smtp-auth
      NEXT_PRIVATE_SMTP_HOST: documenso-mailpit
      NEXT_PRIVATE_SMTP_PORT: 1025
      NEXT_PRIVATE_SMTP_SECURE: "false"
      NEXT_PRIVATE_SMTP_UNSAFE_IGNORE_TLS: "true"
      NEXT_PRIVATE_SMTP_FROM_NAME: FloLabs Signing
      NEXT_PRIVATE_SMTP_FROM_ADDRESS: no-reply@$DOMAIN
      NEXT_PRIVATE_SIGNING_LOCAL_FILE_PATH: /opt/documenso/cert.p12
      NEXT_PRIVATE_SIGNING_PASSPHRASE: \${CERT_PASS}
    volumes:
      - ./cert.p12:/opt/documenso/cert.p12:ro
    # On the CRM network only so Caddy can reach it, like Listmonk.
    networks: [sign, crm]

networks:
  sign:
  crm:
    external: true
    name: $CRM_NETWORK

volumes:
  database:
YAML

if [ -z "$(docker compose ps -q documenso 2>/dev/null)" ]; then
  AVAILABLE_MB=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)
  [ "$AVAILABLE_MB" -ge 2300 ] || fail "Only ${AVAILABLE_MB} MB of memory is free; Documenso needs about 2.2 GB. Remove the trial first (documenso-trial-remove.sh)."
fi

echo "==> Starting Documenso (the first start downloads about 1 GB)"
docker compose up -d

echo "==> Waiting for Documenso and its signing certificate"
STATUS='{}'
for _ in $(seq 1 60); do
  STATUS=$(health)
  echo "$STATUS" | grep -q '"status":"ok"' && break
  sleep 5
done
echo "$STATUS" | grep -q '"status":"ok"' \
  || fail "Documenso is not healthy: $STATUS. Logs: cd $DIR && docker compose logs --tail 80 documenso"
docker exec "$CADDY" wget -q --spider http://documenso:3000/api/health \
  || fail "Caddy cannot reach documenso:3000 on $CRM_NETWORK."

if ! grep -rqxF --include='Caddyfile*' --include='*.caddy' "$DOMAIN {" "$CADDY_DIR"; then
  echo "==> Adding $DOMAIN to Caddy"
  cp "$CADDYFILE" "$CADDYFILE.before-documenso"
  cat >> "$CADDYFILE" <<CADDY

$DOMAIN {
	encode gzip
	reverse_proxy documenso:3000
}
CADDY
  if ! docker exec "$CADDY" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile \
    || ! docker exec "$CADDY" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile; then
    cp "$CADDYFILE.before-documenso" "$CADDYFILE"
    docker exec "$CADDY" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile || true
    fail "Caddy rejected the new site; the old Caddyfile is back. The CRM is unaffected."
  fi
fi

echo "==> Checking https://$DOMAIN (Caddy fetches the certificate on the first call)"
PUBLIC=000
for _ in $(seq 1 24); do
  PUBLIC=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
    --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/signin" || true)
  [ "$PUBLIC" = 200 ] && break
  sleep 5
done

echo "==> CRM still healthy: $(docker inspect -f '{{.State.Health.Status}}' flolabs-crm-server-1 2>/dev/null || echo unknown)"
free -h | head -2

[ "$PUBLIC" = 200 ] || fail "https://$DOMAIN did not answer yet (last code $PUBLIC). Wait a minute and open it; if it still fails, send: docker logs --tail 50 $CADDY"

cat <<DONE

Documenso is live at https://$DOMAIN

Next:
1. Back up $DIR/.env somewhere safe. Without its keys the signed documents
   cannot be read.
2. Open https://$DOMAIN/signup and create the admin account with
   hr@$SIGNUP_DOMAIN (only @$SIGNUP_DOMAIN addresses can sign up).
3. The confirmation email is caught on this server. On your computer run
     ssh -N -L 8026:127.0.0.1:8026 root@${SERVER_IP:-<server ip>}
   open http://localhost:8026 and click only the email sent seconds after
   your sign-up.
4. Close sign-up:  sudo bash $SELF --lock
DONE
