-- CRM Analytics data audit (contract section 11, items 1 and 2).
-- Read-only: runs in a READ ONLY transaction and ends with ROLLBACK.
-- Returns counts, stage, position and source values, and field definitions.
-- It returns no names, emails, phone numbers or form answers.
--
-- Run on the production server:
--   docker exec -i flolabs-crm-db-1 psql -U postgres -d default < production-audit.sql > audit-result.txt
-- Change "default" if the database has another name (PG_DATABASE_NAME).

\pset pager off
\set ON_ERROR_ROLLBACK on
BEGIN TRANSACTION READ ONLY;

\echo == Workspace schemas (expect 1)
SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'workspace\_%' ORDER BY 1;

SELECT schema_name AS workspace_schema FROM information_schema.schemata WHERE schema_name LIKE 'workspace\_%' ORDER BY 1 LIMIT 1 \gset
SET LOCAL search_path TO :"workspace_schema", public;

\echo == 1. People per stage
SELECT stage, count(*) FROM person WHERE "deletedAt" IS NULL GROUP BY 1 ORDER BY 2 DESC;

\echo == 2. Stage changes on the timeline: latest 20 (the funnel depends on these)
SELECT "happensAt", "createdAt", "updatedAt",
       properties->'diff'->'stage' AS stage_diff,
       "workspaceMemberId" IS NOT NULL AS by_member,
       "linkedRecordId" IS NULL AS self_row,
       "timelineActivityTypeSnapshot"->>'name' AS type_name
FROM "timelineActivity"
WHERE "targetPersonId" IS NOT NULL AND properties->'diff' ? 'stage'
ORDER BY "createdAt" DESC LIMIT 20;

\echo == 3. Timeline size and date range
SELECT count(*) AS timeline_rows,
       count(*) FILTER (WHERE properties->'diff' ? 'stage') AS stage_change_rows,
       min("createdAt") AS first_row,
       max("createdAt") AS last_row,
       pg_size_pretty(pg_total_relation_size('"timelineActivity"')) AS table_size
FROM "timelineActivity";

\echo == 4. People created per day, latest 30 (shows the import date)
SELECT date_trunc('day', "createdAt")::date AS day, count(*) FROM person GROUP BY 1 ORDER BY 1 DESC LIMIT 30;

\echo == 5. Field definitions: is Stage recorded on the timeline?
SELECT f.name, f.type, f."isAuditLogged"
FROM core."fieldMetadata" f JOIN core."objectMetadata" o ON o.id = f."objectMetadataId"
WHERE o."nameSingular" = 'person' AND f.name IN ('stage', 'positionsAppliedFor', 'applicantSource')
ORDER BY 1;

\echo == 6. Stage and source options in order
SELECT f.name AS field, (option->>'position')::int AS position, option->>'value' AS value, option->>'label' AS label
FROM core."fieldMetadata" f
JOIN core."objectMetadata" o ON o.id = f."objectMetadataId"
CROSS JOIN LATERAL jsonb_array_elements(f.options::jsonb) AS option
WHERE o."nameSingular" = 'person' AND f.name IN ('stage', 'applicantSource')
ORDER BY 1, 2;

\echo == 7. People per position and per source
SELECT position_value, count(*) FROM person, unnest("positionsAppliedFor"::text[]) AS position_value
WHERE "deletedAt" IS NULL GROUP BY 1 ORDER BY 2 DESC;
SELECT "applicantSource"::text AS source, count(*) FROM person WHERE "deletedAt" IS NULL GROUP BY 1 ORDER BY 2 DESC;

\echo == 8. Applications object: name and fields
SELECT o."nameSingular", f.name, f.type
FROM core."fieldMetadata" f JOIN core."objectMetadata" o ON o.id = f."objectMetadataId"
WHERE o."nameSingular" ILIKE '%application%'
ORDER BY 1, 2;

\echo == 9. Form submissions per form
SELECT f.name, count(s.id) AS submissions, min(s."submittedAt") AS first_submission, max(s."submittedAt") AS last_submission
FROM "_crmForm" f LEFT JOIN "_formSubmission" s ON s."formId" = f.id
GROUP BY 1 ORDER BY 2 DESC;

ROLLBACK;
