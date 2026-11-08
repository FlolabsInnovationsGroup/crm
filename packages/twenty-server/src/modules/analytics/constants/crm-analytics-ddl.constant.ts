// Append only: ALTER TABLE analytics.x ADD COLUMN IF NOT EXISTS ... Never edit an
// old entry; destructive changes need the user's approval.
export const CRM_ANALYTICS_DDL_STATEMENTS: string[] = [
  `CREATE SCHEMA IF NOT EXISTS analytics;`,

  `CREATE TABLE IF NOT EXISTS analytics.stage_transition (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid,                    -- timelineActivity.id; null for reconcile rows
  workspace_id uuid NOT NULL,
  person_id uuid NOT NULL,
  from_stage text,                   -- raw value, never mapped
  to_stage text,
  happened_at timestamptz NOT NULL,
  source_updated_at timestamptz NOT NULL,
  origin text NOT NULL CHECK (origin IN ('timeline', 'reconcile'))
);`,

  `CREATE INDEX IF NOT EXISTS stage_transition_person_idx
  ON analytics.stage_transition (workspace_id, person_id, happened_at);`,

  `CREATE INDEX IF NOT EXISTS stage_transition_updated_idx
  ON analytics.stage_transition (workspace_id, source_updated_at);`,

  `CREATE UNIQUE INDEX IF NOT EXISTS stage_transition_source_version_idx
  ON analytics.stage_transition (workspace_id, source_id, source_updated_at);`,

  `CREATE TABLE IF NOT EXISTS analytics.daily_snapshot (
  workspace_id uuid NOT NULL,
  snapshot_date date NOT NULL,       -- local date in the reporting zone
  dimension text NOT NULL CHECK (dimension IN ('all', 'position', 'track', 'source')),
  dimension_key text NOT NULL,       -- '' for all; NONE for no position, track or source
  stage text NOT NULL,               -- raw value, '' for no stage
  person_count integer NOT NULL,
  PRIMARY KEY (workspace_id, snapshot_date, dimension, dimension_key, stage)
);`,

  `CREATE TABLE IF NOT EXISTS analytics.report (
  workspace_id uuid NOT NULL,
  period_type text NOT NULL CHECK (period_type IN ('WEEK', 'MONTH')),
  period_start date NOT NULL,
  period_end date NOT NULL,          -- exclusive
  generated_at timestamptz NOT NULL,
  payload jsonb NOT NULL,            -- AnalyticsReport, counts only, no names
  PRIMARY KEY (workspace_id, period_type, period_start)
);`,

  `CREATE TABLE IF NOT EXISTS analytics.sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  job_name text NOT NULL CHECK (job_name IN ('sync', 'daily')),
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  status text NOT NULL CHECK (status IN ('running', 'ok', 'failed', 'skipped')),
  processed_count integer NOT NULL DEFAULT 0,
  restored_count integer NOT NULL DEFAULT 0,
  details jsonb,                     -- per-step outcome and consistency check result
  error_message text                 -- first 500 characters
);`,

  `CREATE INDEX IF NOT EXISTS sync_log_workspace_started_idx
  ON analytics.sync_log (workspace_id, started_at DESC);`,
];
