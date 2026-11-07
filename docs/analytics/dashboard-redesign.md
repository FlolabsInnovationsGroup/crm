# CRM Analytics dashboard redesign

Decided 2026-11-07 after the user saw the first version running. **This replaces the chart rules in contract section 8 wherever they disagree.** Metric definitions in contract section 6 and "Decisions from testing" still hold.

## Why

The user expected a dashboard made of many graphs, each the best type for its question, showing conversion rates and trends across everything. They want to get answers easily rather than work out the page. The first version had one line chart and tables, because the research and the critic favored tables for precision. The requirements ask for charts ("Bar charts and tables", "funnels", "historical trends", "a charting library") and name Metabase and Zoho Analytics as references.

## Rules for the whole page

1. **Graph first.** Every view leads with a chart. Its table sits behind a "Show numbers" toggle on the card, closed by default.
2. **Answer first.** A tab opens with up to three short answer cards: a label, a big value, one plain line of detail. Chart titles are plain questions, such as "Where is everyone now?"
3. **No hunting.** Everything on a tab shows by scrolling. No dropdown decides which chart you get, except the period selector on Trends.
4. **Click to filter.** Clicking a track, program or source in a chart sets that filter for the whole page. Active filters show as removable chips with "Clear all".
5. **Plain words.** Use "Still in progress" for too recent, "Stalled" for timed out, "Left" for exited, "People who applied in June" for a cohort. Say "of 14 people", not "n=14". Do not show "eligible". Move long notes into an info icon beside the title.
6. **Honest numbers stay.** Unknown is never 0%. A blank or a dash means not enough data. A rate under the minimum sample draws lighter, and its tooltip gives the count. A rate still in progress draws lighter and says "so far".
7. **Every mark has a tooltip** with exact numbers. Lines get a crosshair.
8. **Layout:** a two-column grid of chart cards on wide screens, one column when narrow. The header and filters stay at the top. Calm and dense, matching the CRM, in light and dark.
9. **Color:** follow the dataviz skill. One accent for the main series, gray for previous period and context, one sequential hue for heatmaps, a validated categorical order only where tracks are compared as lines. Status colors only for status, with a label. Run the palette validator for both modes.

## Charts per tab

Tabs: **Overview, Funnel, Tracks & sources, Trends, Reports.**

### Overview: how is the pipeline right now?

| Card | Form | Data |
|---|---|---|
| Key figures: active people, new applications with change, overall conversion, past stage limit with inactive under it, total contacts | Stat tiles with a sparkline where a series exists | `overview.figures`, `funnel.overall`, series bundle |
| Where is everyone now? | Horizontal stacked bars by stage in pipeline order: within limit in the accent, past limit in a warning color. Exit and other stages after a divider, in gray. Reminders appear in the tooltip | `overview.stageTotals`, meta stages |
| Pipeline status | Donut with at most 4 slices: active, signed, left, not mapped or no stage. Total in the center | `overview.stageTotals`, stage kinds |
| New applications over time | Area line, with the previous period in gray | series bundle |
| People by track, Top sources | Ranked horizontal bars, click to filter | `categories` for each grouping |
| People to follow up | Table of the top 10, with "Show all" | `overview.stuck` |

### Funnel: where do we lose people?

| Card | Form | Data |
|---|---|---|
| Answers: overall conversion, biggest drop, slowest stage | Answer cards | `funnel` |
| From new to signed | Classic centered funnel with connectors between steps. Stage names on the left, counts in the bars, percent moving on between steps on the right, the lowest step marked | `funnel.rows` |
| Conversion at each step | Columns of the step rate, with the lowest highlighted | `funnel.rows` |
| What happened to people at each stage? | 100% stacked horizontal bars: moved on, stalled, left, still in progress | `funnel.rows` |
| How long do people stay? | Horizontal bars of median days, with a tick at the stage limit | `funnel.rows`, meta stages |
| Show numbers | The existing stage ledger table | `funnel` |

### Tracks & sources: which work best?

A segmented control switches between "Tracks and programs" and "Sources", and both use the same views.

| Card | Form | Data |
|---|---|---|
| Answers: largest, best converting, biggest drop | Answer cards | `categories` |
| How many people in each? | Ranked horizontal bars, active shown darker than the rest. Click to filter; a track expands to its programs | `categories.rows` |
| Which converts best? | Ranked horizontal bars of overall conversion, with small samples lighter | `categories.rows` |
| Conversion at every step | Heatmap: rows are groups, columns are steps, one hue, percent in each cell, count in the tooltip | `categories.rows[].stepRates` |
| Big but weak, or small but strong? | Scatter: people against overall conversion, labeled points, median lines, one hue | `categories.rows` |
| Show numbers | The existing category table | `categories` |

### Trends: what is changing?

The period selector (By day, By week, By month) lives on this tab only.

| Card | Form | Data |
|---|---|---|
| Six small charts, all visible: new applications, total contacts, active people, overall conversion, drop-off rate, median days. Each shows its latest value and change | Small multiple lines, with the previous period in gray | series bundle |
| New applications by track, Overall conversion by track | Multi-line with up to 5 tracks, a legend and direct labels | series bundle, `groupBy: 'TRACK'` |
| People in each stage over time | Stacked columns from snapshots, main stages in one ordered hue, exits gray | series bundle, `groupBy: 'STAGE'`, `STAGE_COUNT` |
| What moved this period? | Diverging bars per stage: entered to the right, left to the left | `trends.movement` |
| Are newer groups converting better? | Cohort heatmap: application period by step, plus overall. Still in progress is lighter and says "so far" | `trends.cohorts` |
| Show numbers | The existing trend, cohort and movement tables | as above |

Where a metric cannot be drawn, such as a rate by day, the card shows the plain reason instead of an empty chart. Overall conversion is cohort-based, so its line stops before recent periods and says so.

### Reports

The list stays on the left. A frozen report reuses the same charts from its stored payload: funnel, conversion by step, category bars, diverging movement, cohort heatmap, followed by the comparison table. A local error boundary stays around the view.

## Filters

Date range, track, program and source stay in one row at the top. Status shows only on Overview and Tracks & sources, and is hidden elsewhere rather than disabled. The period selector moves into Trends. Removable chips show what is active.

## Server additions

The page must not fire one heavy query per chart, so add one query that returns many series in one transaction. Add the types below to both API type files and to contract section 7, keeping them byte-identical.

```ts
export type AnalyticsSeriesGroupBy = 'NONE' | 'TRACK' | 'SOURCE' | 'STAGE';

export type AnalyticsSeriesRequest = {
  metric: AnalyticsTrendMetric;
  stageKey: string | null;
  groupBy: AnalyticsSeriesGroupBy;
};

export type AnalyticsSeries = {
  metric: AnalyticsTrendMetric;
  stageKey: string | null;
  groupKey: string | null;
  groupLabel: string | null;
  unavailableReason: AnalyticsTrends['unavailableReason'];
  points: AnalyticsTrendPoint[];
};

export type AnalyticsSeriesBundle = AnalyticsBase & {
  period: AnalyticsPeriod;
  series: AnalyticsSeries[];
};
```

- `getCrmAnalyticsSeries(filter, requests)`: same guards, read-only page transaction and payload DTO as the other queries. It reuses the existing series code and does not compute cohorts or movement. Reject more than 40 resulting series with `UserInputError`.
- `TRACK` returns one series per track, `SOURCE` the top 5 sources by people, `STAGE` one series per main stage plus exit stages.
- Page reads may wait up to about 10 seconds for a slot instead of 2, since one tab now sends several requests. Keep at most 2 running at once.

## Demo data

`seed/` stays as it is, because its numbers are tied to its tests. A new generator in `packages/twenty-utils/flolabs/analytics-tests/demo/` makes about 150 realistic applications for showing the tool: invented realistic names, example.com emails, a repeatable random seed, one constant for the size. It is local only and refuses any non-local database. The whole `analytics-tests/` folder already stays out of `main`.

It covers 26 weeks since tracking start, with more applications in recent weeks, so some people are old enough for the 90 day overall window and last week still shows a healthy count. Tracks, programs and sources get different conversion rates, so the charts have something to say. It also includes some exits, stalled and stuck people, a few reminders, a few imported people, and one or two unmapped values. Because snapshots normally only start at go-live, it backfills `analytics.daily_snapshot` from the generated history, matching the shape the real snapshot writes. Reports then come from the real daily job.

## Testing

The user decided the code review already done is enough for this read-only tool, so the test workflows do not run again. Keep each module's own unit tests passing, and update or remove tests for components that change. One review of the changed code follows the build, then one fix pass, then a type check, lint and a boot check. The browser tests in `analytics-tests/ui/` go out of date with this redesign and are not updated.
