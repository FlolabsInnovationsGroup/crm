#!/usr/bin/env bash
# Removes the Documenso trial completely: containers, its database and files.
set -euo pipefail

DIR=/opt/documenso-trial
[ -f "$DIR/compose.yml" ] || { echo "No trial found in $DIR"; exit 0; }

cd "$DIR"
docker compose down -v
cd /
rm -rf "$DIR"
echo "Trial removed. CRM health: $(docker inspect -f '{{.State.Health.Status}}' flolabs-crm-server-1 2>/dev/null || echo unknown)"
