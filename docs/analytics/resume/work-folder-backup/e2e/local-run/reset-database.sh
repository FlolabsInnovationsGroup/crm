#!/usr/bin/env bash
# Resets the LOCAL CRM database and seeds the demo workspaces, without Nx. Local Docker only.
# A fresh database has no FORM_SUBMISSIONS widget type: only the 2-48 add-person-forms-tab
# upgrade command adds it, and a fresh seed needs it. So this adds it the same way.
cd "D:/Coding/Flolabs/crm/.claude/worktrees/analytics_tool/packages/twenty-server" || exit 1
grep -E "^PG_DATABASE_URL" .env | grep -q "@localhost:5432/default" || { echo "REFUSED: database is not local"; exit 1; }
LOG="${1:-reset-database.log}"
: > "$LOG"
step() {
  echo "== $*" | tee -a "$LOG"
  "$@" >> "$LOG" 2>&1
  echo "exit $? at $(date +%H:%M:%S)"
}
step node dist/database/scripts/truncate-db.js
step node dist/database/scripts/setup-db.js
step node dist/command/command.js run-instance-commands --force --include-slow
step docker exec twenty-dev-db-1 psql -U postgres -d default -c "ALTER TYPE \"core\".\"pageLayoutWidget_type_enum\" ADD VALUE IF NOT EXISTS 'FORM_SUBMISSIONS'"
step node dist/command/command.js cache:flush
step node "D:/Coding/Flolabs/crm/.claude/worktrees/analytics-work/e2e/local-run/crm.cjs" command workspace:seed:dev --light
sed 's/\x1b\[[0-9;]*m//g' "$LOG" | grep -nE "ERROR \[DataSeed|failed: \[" | cut -c1-400 | tail -3
docker exec twenty-dev-db-1 psql -U postgres -d default -Atc "select id, \"displayName\", \"activationStatus\" from core.workspace"
