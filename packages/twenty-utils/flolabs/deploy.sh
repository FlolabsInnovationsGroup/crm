#!/usr/bin/env bash
# Deploys one FloLabs CRM image on the production server, called by the
# "Deploy FloLabs CRM" GitHub workflow through a key restricted to this script:
#   ssh root@server <40-char commit sha>
# Backs up the database first and rolls back if the server is not healthy.
set -euo pipefail

SHA="${SSH_ORIGINAL_COMMAND:-${1:-}}"
APP_DIR="${FLOLABS_APP_DIR:-/opt/flolabs-crm}"
IMAGE_REPO=ghcr.io/flolabsinnovationsgroup/crm
PUBLIC_URL=https://crm.flolabsinnovations.com

if [[ ! "$SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Usage: deploy.sh <40-character commit sha>" >&2
  exit 2
fi

cd "$APP_DIR"
exec 9>"$APP_DIR/.deploy.lock"
flock -n 9 || { echo "Another deploy is running" >&2; exit 3; }

IMAGE="$IMAGE_REPO:$SHA"
echo "==> Pulling $IMAGE"
docker pull --quiet "$IMAGE"

if grep -q "$IMAGE" docker-compose.override.yml; then
  echo "==> $SHA is already deployed"
  exit 0
fi

mkdir -p backups
BACKUP="backups/pre-deploy-$(date +%Y%m%d-%H%M%S)-${SHA:0:8}.sql.gz"
echo "==> Backing up the database to $BACKUP"
docker exec flolabs-crm-db-1 pg_dumpall -U postgres | gzip > "$BACKUP"
gunzip -t "$BACKUP"

cp docker-compose.override.yml docker-compose.override.yml.previous
sed -i "s#$IMAGE_REPO:[0-9a-f]\{40\}#$IMAGE#g" docker-compose.override.yml

echo "==> Starting the new version"
docker compose up -d server worker

STATUS=unknown
for _ in $(seq 1 60); do
  STATUS=$(docker inspect -f '{{.State.Health.Status}}' flolabs-crm-server-1 2>/dev/null || echo unknown)
  [ "$STATUS" = healthy ] && break
  sleep 5
done

if [ "$STATUS" != healthy ] || ! curl -fsS --max-time 15 "$PUBLIC_URL/healthz" > /dev/null; then
  echo "!! The new version is not healthy ($STATUS), rolling back" >&2
  cp docker-compose.override.yml.previous docker-compose.override.yml
  docker compose up -d server worker
  echo "!! Rolled back. Database backup: $APP_DIR/$BACKUP" >&2
  exit 1
fi

# Keep the ten most recent pre-deploy backups.
ls -1t backups/pre-deploy-*.sql.gz | tail -n +11 | xargs -r rm --

echo "==> Deployed $SHA"
