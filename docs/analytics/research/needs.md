# Analytics tool: needs

## 1. Users and decisions
All roles are assumptions; only "a few team members" recruiting interns is fact (`FLOLABS.md:3`).
- **Recruiting lead:** which sources and tracks deserve effort; where the pipeline is losing people.
- **Recruiters:** who to chase today.
- **Management:** whether recruiting works, from weekly and monthly reports.

## 2. Requirements
Data: Per = Person fields, Hist = stage history, Map = mapping, App = Applications, Sub = form submissions, Snap = snapshots, Log = sync log. Where: Ov, Cat, Fun, Tre = page tabs; Job = worker; Rep = reports.

|ID|Requirement|Section|Priority|Acceptance check|Data|Where|
|---|---|---|---|---|---|---|
|R1|Current counts by pipeline, track, program, stage|1, 5A|Must|Matches independent SQL|Per, Map, App|Ov, Cat|
|R2|Record stage changes, keep corrections|1, 4|Must|Backward move appends; nothing overwritten|Hist|Job|
|R3|Stage and overall conversion, same cohort|1, 5B, 5C|Must|Matches hand-calculated sample|Hist, Map|Fun|
|R4|Drop-off with observation window|1, 5D|Must|Person inside window not dropped|Hist|Fun|
|R5|Stage duration, stuck and inactive list|1, 5E|Must|Known dates give known median|Hist|Fun, Rep|
|R6|Update when CRM changes|1, 7|Must|Visible within one sync interval|Hist|Job|
|R7|Webhooks, signatures, API credential, connector|3, 7, 9|Superseded|Replaced by scheduled timeline read through in-process facade|Hist|Job|
|R8|Separate application, FastAPI, Next.js|3, 8, 12|Superseded|Replaced by `twenty-server` module and `twenty-front` page|None|All|
|R9|Analytics database|3, 4|Superseded|Replaced by `analytics` schema, same database; no CRM table altered|All|Job|
|R10|Daily reconciliation|1, 7|Must|Removed row restored and logged|Hist, Log|Job|
|R11|Weekly report items|1, 7|Should|Equals page for same period|Hist, Snap|Rep|
|R12|Monthly report items|1, 7|Should|Equals page for same period|Hist, Snap|Rep|
|R13|Report scheduler|3|Should|Failed run detected, rerun works|Log|Job|
|R14|Metrics processor, shared by page and reports|3, 7|Must|One query source|All|Job|
|R15|Daily snapshots, preserved metrics|1, 4|Must|Same-day rerun adds nothing|Snap|Tre|
|R16|Applications dataset|4|Must|Fields filled or marked unknown|App, Sub|Cat|
|R17|Current state dataset|4|Later|Rebuild matches CRM|Per|Job|
|R18|Metric summaries|4|Later|Frozen report results only|Snap|Rep|
|R19|Sync logs, monitoring|3, 4|Must|Stopped job shows stale warning|Log|Header|
|R20|Stable IDs; contacts and applications separate|4|Must|Two applications: one person, two applications|Per, App|All|
|R21|UTC with reporting timezone|4|Must|Late-night change lands on correct local day|Hist|All|
|R22|Consistent identifiers; reminders under primary stage|4|Must|Stage totals equal People total|Map|Ov, Fun|
|R23|Filters: date, track, program, source, status, period|5A, 6|Must|Filtered counts match SQL|Per, Map|All|
|R24|Daily, weekly, monthly trends, comparisons, application cohorts|5F, 6|Must|Immature cohort marked, never 0%|Snap, Hist|Tre|
|R25|Four sections with required charts|3, 6|Must|Each tab renders all items|All|All|
|R26|Last successful sync shown|6|Must|Equals latest good Log row|Log|Header|
|R27|Read-only; no emails or workflow control|1, 9|Must|Facade has no write calls|Per|Job|
|R28|Data minimization|9|Must|No names, emails or answers stored|All|Job|
|R29|Idempotency, retries, failure logging|3, 9|Must|Replay adds no rows|Hist, Log|Job|
|R30|Consistency checks|9|Must|Mismatch flagged|Log|Job|
|R31|Access control|9|Must|Unauthorized member refused by page and API|None|All|
|R32|Retention, deletion, backup policy|9|Should|Written before production|Hist|None|
|R33|Phases 1 to 4, with their criteria|11|Must|Each criterion passes before next phase|All|All|

## 3. First 60 seconds
1. How many interns signed this period, versus last?
2. How many new applications, from which tracks and sources?
3. Where is the biggest drop?
4. Who is stuck, and how many?
5. Which tracks and programs convert best and worst?

**Lead number: people signed this period, with previous-period change.** It is the outcome, and works from the first sync. Overall conversion is what the user highlighted, so it sits second and the funnel is the main chart. It cannot lead: it depends on application cohorts, so it stays empty for weeks after go-live, and section 10 forbids deriving it from current counts.

## 4. Spec versus CRM storage
- **Stage on Person, not application.** Key history by person; applications count volume only (decision 6). Label it: the spec's "applications" formulas become people.
- **Applications stops growing.** The form code writes no Applications record (`packages/twenty-server/src/modules/public-form/services/`). Volume = imported Applications before go-live, Internship Application submissions after.
- **Unknown application date.** Applications fields are not in the repo. Use the HubSpot date if it exists, then submission date. Never imported `createdAt`.
- **No track field.** Tracks exist only in draft forms, unmapped (`packages/twenty-utils/flolabs/forms/skills-experience.json:88`). Derive from position through Map.
- **Inconsistent programs** (`packages/twenty-utils/flolabs/forms/internship-application.json:301`, `packages/twenty-utils/flolabs/forms/general-questions.json:53`, `packages/twenty-utils/flolabs/forms/skills-experience.json:784`). Use only `positionsAppliedFor`.
- **Several positions.** Multi-select (`packages/twenty-utils/flolabs/forms/internship-application.json:152`). Count a person once in each position; never sum rows; show distinct totals. Progress is credited to all their positions: label it.
- **Resubmission overwrites positions** (`packages/twenty-server/src/modules/public-form/services/public-form.service.ts:94-97`). Report current positions; do not claim per-application history.
- **Forms reset stage.** Three follow-up forms set `INTERESTED` (`packages/twenty-utils/flolabs/forms/websites-presentations.json:943`, `packages/twenty-utils/flolabs/forms/meeting-recordings.json:384`, `packages/twenty-utils/flolabs/forms/general-masterclass.json:555`), which is absent from the pipeline in `packages/twenty-server/src/engine/metadata-modules/ai/ai-chat/constants/chat-system-prompts.const.ts:9`. Funnel uses furthest stage ever reached, not current stage.
- **Merged timeline rows** (`packages/twenty-server/src/modules/timeline/repositories/timeline-activity.repository.ts:357`). A to B to C can read A to C, and rows change in place. Read by `updatedAt`; count skipped stages as reached.
- **Unknown entry date for imported people.** Show "at least N days since go-live"; exclude from medians.
- **Exits are not steps.** No answer, Not Interested, Rejected are drop-offs, separate from timed-out.
- **Sources:** 21 options (`FLOLABS.md:57`), 18 in form (`packages/twenty-utils/flolabs/forms/internship-application.json:354`). Read live options; show unknown values as "Unmapped".
- **People includes non-applicants** (`FLOLABS.md:55`). Pipeline entry must be defined.
- **Not verified:** whether form-driven stage updates reach the timeline.

## 5. Needed from user or recruiting
1. "Export the Person `Stage` options with value, label and order. Mark each main stage, reminder (of which stage), or exit."
2. "Send the Applications object's field list (Settings, Data model) and whether it links to Person and holds an application date."
3. "Run read-only on production and send the result, without personal data: `SELECT \"createdAt\", \"updatedAt\", properties->'diff'->'stage' FROM workspace_<id>.\"timelineActivity\" WHERE name = 'person.updated' AND properties->'diff' ? 'stage' ORDER BY \"createdAt\" DESC LIMIT 20;`" Column names not verified.
4. "Run: `SELECT stage, count(*) FROM workspace_<id>.person GROUP BY 1;`"
5. "Assign each of the 39 positions to one of the 5 tracks."
6. "Should follow-up forms move someone at Contacted or Attended back to `INTERESTED`? Where does it sit in the order?"
7. "Confirm: success stage (Signed Paid and Signed Non paid?), entry stage, reporting timezone, drop-off window, and stuck days per stage."
8. "Who may view analytics? Who receives reports, and how?"
9. "Send one hand-counted sample period for checking results."

## 6. Can wait
- **Report delivery and a separate monthly layout:** same generator; show frozen reports on the page first.
- **Metric summaries, current-state table:** both recompute from history and Person, which answers the duplicate-storage note.
- **Daily conversion:** daily samples are too small. Daily counts only.
- **Per-program funnels:** 39 small groups; table only.
- **Average duration:** median is enough.
- **One-minute sync:** recruiting acts daily; 15 minutes is enough.
- **Separate monitoring component:** sync log plus stale warning.
