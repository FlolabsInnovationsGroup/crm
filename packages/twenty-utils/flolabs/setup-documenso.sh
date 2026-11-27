#!/usr/bin/env bash
# Runs Documenso, the signing engine for CRM agreements, at
# https://sign.flolabsinnovations.com beside the CRM, served by the CRM's Caddy.
# Safe to run again. See docs/flolabs/documenso.md.
#
#   sudo bash setup-documenso.sh          install or update
#   sudo bash setup-documenso.sh --lock   close sign-up once the admin account exists
set -euo pipefail

DOMAIN="${DOCUMENSO_DOMAIN:-sign.flolabsinnovations.com}"
DIR=/opt/flolabs-sign
CRM_NETWORK="${CRM_NETWORK:-flolabs-crm_default}"
IMAGE=documenso/documenso:v2.21.0

fail() {
  echo "!! $*" >&2
  exit 1
}

[ "$(id -u)" = 0 ] || fail "Run as root (sudo)."
docker network inspect "$CRM_NETWORK" >/dev/null 2>&1 || fail "The CRM network $CRM_NETWORK does not exist."

CADDY=$(docker ps --format '{{.Names}}' | grep -i caddy | head -1 || true)
[ -n "$CADDY" ] || fail "No running Caddy container found."
CADDYFILE=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/etc/caddy/Caddyfile"}}{{.Source}}{{end}}{{end}}' "$CADDY")
[ -n "$CADDYFILE" ] && [ -f "$CADDYFILE" ] || fail "Could not find the Caddyfile mounted into $CADDY."

SERVER_IP=$(curl -fsS --max-time 10 https://api.ipify.org || true)
DNS_IP=$(getent ahostsv4 "$DOMAIN" | awk 'NR==1 {print $1}' || true)
if [ -z "$DNS_IP" ] || { [ -n "$SERVER_IP" ] && [ "$DNS_IP" != "$SERVER_IP" ]; }; then
  fail "$DOMAIN must point to this server ($SERVER_IP) first; it points to '${DNS_IP:-nothing}'. Add an A record at the DNS provider and wait a few minutes."
fi

mkdir -p "$DIR"
cd "$DIR"
umask 077

if [ "${1:-}" = "--lock" ]; then
  grep -q '^DISABLE_SIGNUP=' .env || fail "Run the install first."
  sed -i 's/^DISABLE_SIGNUP=.*/DISABLE_SIGNUP=true/' .env
  docker compose up -d documenso
  echo "Sign-up is closed. Only the accounts that exist now can sign in."
  exit 0
fi

if [ ! -f .env ]; then
  CERT_PASS=$(openssl rand -hex 16)
  cat > .env <<ENV
POSTGRES_PASSWORD=$(openssl rand -hex 24)
NEXTAUTH_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
ENCRYPTION_SECONDARY_KEY=$(openssl rand -hex 32)
CERT_PASS=$CERT_PASS
DISABLE_SIGNUP=false
ENV

  # Self-signed signing certificate, valid 10 years. Replace cert.p12 with one
  # from a certificate authority when John wants signatures trusted by Adobe.
  openssl req -new -x509 -newkey rsa:3072 -nodes -days 3650 \
    -keyout private.key -out certificate.crt \
    -subj "/C=US/O=FloLabs Innovations Group/CN=FloLabs Signing" 2>/dev/null
  CERT_PASS=$CERT_PASS openssl pkcs12 -export -out cert.p12 \
    -inkey private.key -in certificate.crt -password env:CERT_PASS
  rm -f private.key certificate.crt
  # The app runs as uid 1001 inside its container.
  chown 1001:1001 cert.p12
  chmod 400 cert.p12
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
    # "db" on the CRM network is the CRM's own Postgres.
    networks:
      sign:
        aliases: [documenso-db]

  # The CRM sends the signing links itself, so Documenso's own emails (account
  # checks only) are caught here and read through an SSH tunnel.
  mailpit:
    image: axllent/mailpit:v1.33.0
    restart: unless-stopped
    mem_limit: 128m
    ports:
      - 127.0.0.1:8026:8025
    networks: [sign]

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
      NEXT_PRIVATE_SMTP_TRANSPORT: smtp-auth
      NEXT_PRIVATE_SMTP_HOST: mailpit
      NEXT_PRIVATE_SMTP_PORT: 1025
      NEXT_PRIVATE_SMTP_SECURE: "false"
      NEXT_PRIVATE_SMTP_UNSAFE_IGNORE_TLS: "true"
      NEXT_PRIVATE_SMTP_FROM_NAME: FloLabs Signing
      NEXT_PRIVATE_SMTP_FROM_ADDRESS: no-reply@$DOMAIN
      NEXT_PRIVATE_SIGNING_LOCAL_FILE_PATH: /opt/documenso/cert.p12
      NEXT_PRIVATE_SIGNING_PASSPHRASE: \${CERT_PASS}
    volumes:
      - ./cert.p12:/opt/documenso/cert.p12:ro
    networks:
      sign:
      crm:
        aliases: [documenso]

networks:
  sign:
  crm:
    external: true
    name: $CRM_NETWORK

volumes:
  database:
YAML

echo "==> Starting Documenso (the first start downloads about 1 GB)"
docker compose up -d

echo "==> Waiting for Documenso to answer inside Docker"
CODE=000
for _ in $(seq 1 60); do
  CODE=$(docker exec "$CADDY" wget -q -S -O /dev/null http://documenso:3000/signin 2>&1 | awk '/HTTP\//{print $2}' | tail -1 || true)
  [ "$CODE" = 200 ] && break
  sleep 5
done
[ "$CODE" = 200 ] || fail "Documenso did not answer (last code ${CODE:-none}). Logs: cd $DIR && docker compose logs --tail 80 documenso"

if ! grep -q "^$DOMAIN {" "$CADDYFILE"; then
  echo "==> Adding $DOMAIN to Caddy"
  cp "$CADDYFILE" "$CADDYFILE.before-documenso"
  cat >> "$CADDYFILE" <<CADDY

$DOMAIN {
	encode gzip
	reverse_proxy documenso:3000
}
CADDY
  if ! docker exec "$CADDY" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 \
    || ! docker exec "$CADDY" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile; then
    cp "$CADDYFILE.before-documenso" "$CADDYFILE"
    docker exec "$CADDY" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile || true
    fail "Caddy rejected the new site; the old Caddyfile is back. The CRM is unaffected."
  fi
fi

echo "==> Checking https://$DOMAIN (Caddy fetches the certificate on the first call)"
PUBLIC=000
for _ in $(seq 1 24); do
  PUBLIC=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "https://$DOMAIN/signin" || true)
  [ "$PUBLIC" = 200 ] && break
  sleep 5
done

echo "==> CRM still healthy: $(docker inspect -f '{{.State.Health.Status}}' flolabs-crm-server-1 2>/dev/null || echo unknown)"
free -h | head -2

if [ "$PUBLIC" = 200 ]; then
  cat <<DONE

Documenso is live at https://$DOMAIN

Next:
1. Open https://$DOMAIN/signup and create the admin account with hr@flolabsinnovations.com.
2. The confirmation email is caught on this server. On your computer run
     ssh -N -L 8026:127.0.0.1:8026 root@$SERVER_IP
   open http://localhost:8026 and click the link.
3. Then close sign-up:  sudo bash $0 --lock
DONE
else
  fail "https://$DOMAIN did not answer yet (last code $PUBLIC). Wait a minute and open it; if it still fails, send me: docker logs --tail 50 $CADDY"
fi
