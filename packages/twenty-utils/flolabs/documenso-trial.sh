#!/usr/bin/env bash
# Starts a throwaway Documenso trial next to the CRM, reachable only through an
# SSH tunnel. It does not touch /opt/flolabs-crm. Remove it with
# documenso-trial-remove.sh.
set -euo pipefail

DIR=/opt/documenso-trial
APP_PORT=3010
MAIL_PORT=8025

for port in $APP_PORT $MAIL_PORT; do
  if ss -ltn | awk '{print $4}' | grep -q ":$port\$"; then
    echo "Port $port is already in use on this server. Stopping." >&2
    exit 1
  fi
done

echo "==> Memory before the trial"
free -h | head -2

mkdir -p "$DIR"
cd "$DIR"
umask 077

if [ ! -f .env ]; then
  CERT_PASS=$(openssl rand -hex 16)
  cat > .env <<ENV
POSTGRES_PASSWORD=$(openssl rand -hex 24)
NEXTAUTH_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
ENCRYPTION_SECONDARY_KEY=$(openssl rand -hex 32)
CERT_PASS=$CERT_PASS
ENV

  # Self-signed: fine for a trial, a real certificate comes later.
  openssl req -new -x509 -newkey rsa:2048 -nodes -days 30 \
    -keyout private.key -out certificate.crt \
    -subj "/C=US/O=FloLabs Innovations Group/CN=FloLabs Signing Trial" 2>/dev/null
  CERT_PASS=$CERT_PASS openssl pkcs12 -export -out cert.p12 \
    -inkey private.key -in certificate.crt -password env:CERT_PASS
  rm -f private.key certificate.crt
  # The app runs as uid 1001 inside its container.
  chown 1001:1001 cert.p12
  chmod 400 cert.p12
fi

cat > compose.yml <<'YAML'
name: documenso-trial

services:
  database:
    image: postgres:15
    restart: "no"
    mem_limit: 512m
    environment:
      POSTGRES_USER: documenso
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: documenso
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U documenso -d documenso']
      interval: 5s
      timeout: 5s
      retries: 20
    volumes:
      - database:/var/lib/postgresql/data

  # Catches every email Documenso sends; nothing leaves the server.
  mailpit:
    image: axllent/mailpit:v1.33.0
    restart: "no"
    mem_limit: 128m
    ports:
      - 127.0.0.1:8025:8025

  documenso:
    image: documenso/documenso:v2.21.0
    restart: "no"
    mem_limit: 1536m
    depends_on:
      database:
        condition: service_healthy
    environment:
      PORT: 3000
      NEXTAUTH_SECRET: ${NEXTAUTH_SECRET}
      NEXT_PRIVATE_ENCRYPTION_KEY: ${ENCRYPTION_KEY}
      NEXT_PRIVATE_ENCRYPTION_SECONDARY_KEY: ${ENCRYPTION_SECONDARY_KEY}
      NEXT_PUBLIC_WEBAPP_URL: http://localhost:3010
      NEXT_PRIVATE_INTERNAL_WEBAPP_URL: http://localhost:3000
      NEXT_PRIVATE_DATABASE_URL: postgres://documenso:${POSTGRES_PASSWORD}@database:5432/documenso
      NEXT_PRIVATE_DIRECT_DATABASE_URL: postgres://documenso:${POSTGRES_PASSWORD}@database:5432/documenso
      NEXT_PUBLIC_UPLOAD_TRANSPORT: database
      NEXT_PRIVATE_SMTP_TRANSPORT: smtp-auth
      NEXT_PRIVATE_SMTP_HOST: mailpit
      NEXT_PRIVATE_SMTP_PORT: 1025
      NEXT_PRIVATE_SMTP_SECURE: "false"
      NEXT_PRIVATE_SMTP_UNSAFE_IGNORE_TLS: "true"
      NEXT_PRIVATE_SMTP_FROM_NAME: FloLabs signing trial
      NEXT_PRIVATE_SMTP_FROM_ADDRESS: trial@documenso-trial.local
      NEXT_PRIVATE_SIGNING_LOCAL_FILE_PATH: /opt/documenso/cert.p12
      NEXT_PRIVATE_SIGNING_PASSPHRASE: ${CERT_PASS}
    ports:
      - 127.0.0.1:3010:3000
    volumes:
      - ./cert.p12:/opt/documenso/cert.p12:ro

volumes:
  database:
YAML

echo "==> Starting the trial (the first start downloads about 1 GB)"
docker compose up -d

echo "==> Waiting for Documenso to answer"
CODE=000
for _ in $(seq 1 60); do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:$APP_PORT/signin || true)
  [ "$CODE" = 200 ] && break
  sleep 5
done

docker compose ps --format 'table {{.Service}}\t{{.State}}\t{{.Status}}'
echo "==> Memory with the trial running"
free -h | head -2
echo "==> CRM still healthy: $(docker inspect -f '{{.State.Health.Status}}' flolabs-crm-server-1 2>/dev/null || echo unknown)"

if [ "$CODE" = 200 ]; then
  echo "Documenso is up. On your own computer run:"
  echo "  ssh -N -L 3010:127.0.0.1:3010 -L 8025:127.0.0.1:8025 root@$(hostname -I | awk '{print $1}')"
  echo "then open http://localhost:3010 (Documenso) and http://localhost:8025 (emails)."
else
  echo "Documenso did not answer (last code $CODE). Send me this output and:"
  echo "  cd $DIR && docker compose logs --tail 60 documenso"
fi
