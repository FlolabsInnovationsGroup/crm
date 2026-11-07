# Presentation research

Evidence: full pages opened for Gem, Greenhouse's report docs, Ashby catalog, Workable, PeopleForce, Recruiterflow, Peltier. Search summaries only for Atlassian, Datawrapper, Metabase, Greenhouse's blog. Lever failed to load, so its dashboard is not verified. No production data was seen; data-shape points are inference.

## 1. What the research shows

Supports the brief: bars over funnel shapes (Peltier, Atlassian; Workable ships bars plus a table); dots and ranges over box plots (Datawrapper); cohort and activity views kept separate (Gem shows percentages only in its cohort view).

Contradicts the brief:
1. **Launch state is the main design case.** Funnel, cohort and duration views need transitions, history starts at go-live, and stage mapping is undecided. Workable gets an instant funnel by assuming the current stage implies all earlier ones; spec section 10 forbids this. Day one shows current-state views only.
2. **"Biggest drop highlighted" misleads.** The first step usually loses most, and Greenhouse treats a 92% pass rate as a weak filter, so low is not automatically bad. Highlight the lowest step rate with enough people, in neutral wording.
3. **Small funnels per track fail.** On one count scale, small tracks vanish. Use step rates in one table.
4. **Stacked stage areas: cut.** Only the bottom band reads accurately, and old imported stages would likely dwarf active ones.
5. **Stuck sorted by raw days fails.** Dormant imports and slow stages would fill the list. Sort by days over the stage's own limit (as in PeopleForce) and count dormant people separately. For the same reason, each stage gets its own limit tick, not one threshold line.
6. **Tracks and programs overlap.** `positionsAppliedFor` is multi-select, so shares must not sum to 100%.
7. **"Reached by now" favors old cohorts.** Use a fixed window per stage, as Amplitude does.
8. **Scope is ambiguous.** Each view prints its date basis. Spec 5B says applications, but `Stage` is on Person, so each title names its unit.
9. **Small samples.** 39 programs will produce noise. Print n and mute rates under a minimum (30 as a placeholder).

## 2. Page structure

Keep four tabs, synced to the URL. They match the spec's sections, and their time bases differ: now, cohort, category, event. Order: Overview, Funnel, Categories, Trends. Stuck moves to Overview, time in stage to Funnel, sources to Categories.

Lead with **active people, and how many are past their stage limit**, because that prompts action. Total contacts is a small plain figure with no trend. Stage totals and the stuck list follow.

Filter row: date range (application date, except event-based Trends views, which say so), track, program (narrowed by track), source, period. Period is disabled outside Trends, with a stated reason.

Cut: stacked areas, per-track and per-program funnels, daily conversion, standalone drop-off and time-in-stage charts (now ledger columns).

Takeaways are server-filled templates, not AI text.

## 3. Views

Every response also carries `asOf` (ts), `trackingStartedAt` (ts), `unit` ("people" or "applications"), `minimumSample` (c). Default filters are All dates unless stated. Types: c = count, % = percent, d = days, ts = timestamp UTC.

| View (spec) | Question | Form | Fields | Filters | Takeaway | Drill-down | Table view | Empty / too recent / unmapped |
|---|---|---|---|---|---|---|---|---|
| Sync line (6) | Can I trust this? | Text, status dot | `lastSuccessfulSyncAt` ts, `lastReconciliationAt` ts, `lastAttemptStatus` "ok"/"failed", `reportingTimeZone` string | None | "Last successful sync 12 minutes ago." | None | Is text | Never synced: numbers hidden. Stale or failed: warning, numbers kept |
| Controls (6) | What am I viewing? | One row of selects | `tracks`, `programs`, `sources`: `key` string, `label` string, `count` c | All | "People who applied Aug 1 to Oct 31, Robotics." | None | n/a | No match: reset link. "Unmapped" is an option |
| Stats (Overview) | Who needs action? | Hero plus 3 figures; sparkline on new applications only | `activePeople` c, `pastLimitPeople` c, `newApplications` c, `newApplicationsPrevious` c, `newApplicationsSeries` date/c, `totalContacts` c | Week | "{n} active, {m} past their limit." | CRM list | Figures are text | No limits: hide m. No previous: hide delta |
| Stage totals (Overview) | Where is everyone now? | Ledger: count bars, reminders nested | `stageKey`, `label`, `parentStageKey` strings, `isMapped` boolean, `currentCount` c, `pastLimitCount` c | Now | "Most active people are in {stage}." | Filters stuck list | Native table | Unmapped: 25 raw stages, flat, with notice. Partial: Unmapped row always shown |
| Stuck (5E) | Who do I chase? | Table, by days over limit | `personId` uuid, `displayName` string (read live), `stageKey`, `stageEnteredAt` ts or null, `daysInStage` d, `daysOverLimit` d, `isLowerBound` boolean, `dormantCount` c | Excludes dormant | "{n} past limit, most in {stage}." | Opens person | Native table | No limits: sort by days, with notice. Entered before tracking: "at least 40 d" |
| Funnel (5B, C, D, E) | Where do we lose people, and how slowly? | Ledger: reached bars, % to next, median and range, limit tick | `stageKey`, `entered` c, `reachedNext` c, `stepRate` % or null, `lost` c, `inWindow` c, `medianDays` d, `p25Days` d, `p75Days` d, `limitDays` d, `completedStays` c, `overallRate` %, `finalStageKey` string | Since tracking began | "{r}% of {n} reached {final}. Lowest step: {a} to {b}, {x}%." | Filters grid and CRM list | Native table | Unmapped: order needed, "{k} of 25 mapped". No final stage: hide overall. Too recent: `inWindow` counted apart, rate null |
| Cohort grid (5F) | Are newer cohorts better? | Months by steps, one hue, plus overall column | `cohortStart` date, `size` c, `stageKey`, `rate` %, `soFarRate` %, `windowDays` d, `denominator` c, `isMature` boolean | Months since tracking began | "{month} is best to {stage}, {x}%." | Cell opens CRM list | Numbers with n, no shading | Too recent: no fill, muted "12% so far", never 0%. Under minimum: muted |
| Categories (6) | Which tracks and programs convert? | Table: people bars, shaded step rates; tracks expand to programs | `groupKey`, `parentKey`, `label` strings, `people` c, `stepRates` %, `overallRate` %, `overlapPeople` c | Sort by people | "{track} is largest; {track} converts best, {x}%." | Sets filter | Native table | No track mapping: 39 programs flat. Note: "{n} count in several programs" |
| Sources (5A) | Which sources pay off? | Same table | `sourceKey`, `label` strings, `people` c, `overallRate` % | Sort by people | "{source} brings most; {source} converts best." | Sets filter | Native table | Unknown values in Unmapped; tail folded into Other |
| Volume (6) | Is intake on pace? | Line, previous in gray | `bucketStart` date, `value` c, `previousValue` c or null | Weekly | "{n} new, {delta} vs last {period}." | Sets date range | Bucket rows | No gray line in first period. Partial bucket marked |
| Rates (5F) | Is conversion changing? | Same line form, small multiples | `bucketStart` date, `overallRate` %, `dropOffRate` %, `medianDays` d, `size` c, `isMature` boolean | Weekly, cohort-based | "Latest mature cohort: {x}%, {delta} points." | Sets filter | Bucket rows | Line stops at last mature bucket, never dips to 0 |
| Movement (5F, 7) | What moved this period? | Table with delta, sparkline; no percentages | `stageKey`, `enteredInPeriod` c, `leftInPeriod` c, `countNow` c, `countPrevious` c, `series` date/c | Event date | "{stage} grew most, +{n}." | CRM list | Native table | Snapshots begin at go-live; notice until 2 periods exist |

Not verified: whether imported Applications hold the original application date (a shared import date creates a false spike), and whether `stageEnteredAt` is recoverable for people who never moved.

## 4. Component fit

| Views | Fit |
|---|---|
| Stage totals, Funnel, Categories, Sources, Movement, Stuck | Custom HTML tables. `BarChart` has a `layout` prop (`packages/twenty-front/src/modules/page-layout/widgets/graph/graph-widget-bar-chart/components/BarChart.tsx:30`) but draws to canvas (`packages/twenty-front/src/modules/page-layout/widgets/graph/graph-widget-bar-chart/components/BarChartBaseLayer.tsx:21`), so bars cannot be focused or aligned with row columns. |
| Cohort grid | Custom table. No heatmap exists. |
| Volume, Rates | Line chart likely fits, reusing tooltip and legend. `animate` is on at `packages/twenty-front/src/modules/page-layout/widgets/graph/graph-widget-line-chart/components/GraphWidgetLineChart.tsx:318`, which conflicts with the no-entrance-animation rule; the scout should check this. |
| Stats | Custom. The aggregate chart is a poor match for hero hierarchy (fit only, details not checked). Sparkline is a small SVG. |
| Sync line, Controls | CRM selects and text. |

## 5. Signature element: the stage ledger

One table with stages as rows and aligned columns: name, reached bar with a hollow track showing the previous stage's width, % to next set on the hairline between rows, median and range on one shared days axis with a per-stage limit tick, and a past-limit count linking to people.

Exactly one row carries the accent. "Not yet known" looks the same everywhere: no fill, muted "so far" text.

It replaces three suggested charts and follows Greenhouse's one-row-per-stage report. As a real table, it brings keyboard access and the table view with it, matches the CRM's record tables, and works in reports. A "scale from second stage" toggle handles a dominant first stage, as Greenhouse's toggle does.

## 6. Reports

Both are frozen results from the same metric code, carrying `asOf`, sync status and the tracking-start caveat. Corrections appear in the next report. Both render as a report page from the same components; any email uses HTML tables and a link. Email carries counts per stage, not person names, to limit exposure.

- **Weekly:** three takeaways; new applications by track; Movement; Funnel on mature cohorts; stuck counts by stage; significant changes (over a set threshold, above minimum n), or "No significant changes".
- **Monthly:** Stats; Categories with programs; Funnel with drop-off; last six cohort rows; Volume and Rates; comparison naming both months.

## Sources

- [Gem: Funnel view vs Activity view](https://help.gem.com/external/funnel-view-vs-activity-view)
- [Greenhouse: Pipeline history and pass-through rates](https://support.greenhouse.io/hc/en-us/articles/204636795-Pipeline-History-and-Pass-through-Rates)
- [Greenhouse: Which report should I use](https://support.greenhouse.io/hc/en-us/articles/8837686136987-Which-report-should-I-use)
- [Greenhouse blog: recruiting data, 92% pass rate example](https://www.greenhouse.com/blog/whats-data-got-to-do-with-it-measuring-recruiting-performance-in-real-time)
- [Ashby: Report catalog, advanced](https://docs.ashbyhq.com/report-catalog-advanced)
- [Workable: Hiring funnel report](https://help.workable.com/hc/en-us/articles/115012920928)
- [Workable: Hiring velocity report](https://help.workable.com/hc/en-us/articles/115012751307)
- [Lever: Visual Insights Pipeline dashboard (not readable)](https://help.lever.co/hc/en-us/articles/20087349143581)
- [PeopleForce: Time in stage report](https://help.peopleforce.io/en/articles/16151124-time-in-stage-report)
- [Recruiterflow: Days in stage report](https://help.recruiterflow.com/en/articles/9010634-days-in-stage-report)
- [Amplitude: Funnel analysis FAQ](https://amplitude.com/docs/api/content/analytics/charts/funnel-analysis/faq)
- [Peltier Tech: Bad graphics, funnel chart](https://peltiertech.com/bad-graphics-funnel-chart/)
- [Atlassian: Complete guide to funnel charts (search summary)](https://www.atlassian.com/data/charts/funnel-chart-complete-guide)
- [Metabase: Funnel chart glossary (search summary)](https://www.metabase.com/glossary/funnel-chart)
- [Datawrapper: Dot and range plot examples (box plot note from search summary)](https://www.datawrapper.de/academy/examples-of-datawrapper-dot-charts)
