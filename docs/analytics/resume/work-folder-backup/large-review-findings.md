# Large review findings

From the quick large review on 2026-11-08. Confirm each in the current code first, since the reviewers did not run anything and other fix passes may have already handled it.

## L1 [major] PAGE
File: `packages/twenty-front/src/modules/crm-analytics/utils/buildStageTotalsChartRows.ts` line 33

**Problem:** The 'Within limit' segment is computed as count minus pastLimitCount, but pastLimitCount leaves out inactive people. Inactive imported people who have been in the stage longer than the limit therefore show as 'Within limit', which confuses inactive with on time.

**Scenario:** 500 imported people sit unmoved in a stage with a 14-day limit, 30 days after tracking start, and 3 tracked people are stuck. The stage returns count 503 and pastLimitCount 3. The bar and tooltip show 'Within limit 500, Past limit 3', although those 500 have no known time within the limit and are well past it by tracking time. After launch most of the pipeline is imported, so most bars would read as healthy.

**Evidence:** Server crm-analytics-metrics.service.ts:487 has STUCK_CONDITION_SQL = 'NOT a.is_inactive AND a.days_in_stage > a.limit_days'. readStageClockTotals (about line 1595) feeds only that stuck count into pastLimitCount at about line 1518. inactive_count is summed into one overall figure and is not returned per stage. Contract line 474 treats Inactive as separate from Stuck. The front end at buildStageTotalsChartRows.ts:32-33 then labels the remainder 'Within limit'.

**Suggested fix:** Return an inactive count per stage in stageTotals and show it as a third muted 'Inactive' segment and tooltip row, with withinLimit = count - pastLimit - inactive. A smaller alternative is to relabel the segment 'Not past limit' and say that inactive imported people are included.

## L2 [major] PAGE
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsFilterBar.tsx` line 270

**Problem:** The status chip stays on the Trends tab, but Trends strips status before querying, so the chip claims a filter that is not applied.

**Scenario:** On Overview, pick Status = Left, then open Trends. The chip 'Status: Left' still shows, while every chart and table counts all statuses. A reader takes the unfiltered trend numbers as figures for people who left.

**Evidence:** AnalyticsContent.tsx passes isStatusEnabled={activeTabId !== 'funnel'}, which is true on Trends. FilterBar line 270 passes isStatusApplied: isStatusEnabled. AnalyticsTrendsTab.tsx:181 sends { ...filter, status: 'ALL' } for all its queries and charts. The chip comment in getAnalyticsFilterChips.ts says a chip must not claim an unapplied filter. The status control itself is correctly hidden, via isStatusShown.

**Suggested fix:** In AnalyticsFilterBar.tsx, pass isStatusApplied: isStatusShown to getAnalyticsFilterChips, so the chip appears only where the status control does (Overview and Tracks & sources).

## L3 [major] PAGE
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsFilterBar.tsx` line 270

**Problem:** The Trends tab shows a status chip for a filter it does not apply. The chip uses isStatusEnabled, which is true on Trends, but AnalyticsTrendsTab forces status to ALL.

**Scenario:** Pick Status = Left on Overview, then open Trends. The chip row still reads 'Status: Left', and 'Clear all' stays visible. Every Trends chart and table shows all statuses, so a reader takes the whole-pipeline numbers to be people who left. Funnel hides this chip for the same reason.

**Evidence:** AnalyticsContent.tsx:191 passes isStatusEnabled={activeTabId !== 'funnel'}. AnalyticsFilterBar.tsx:265 hides the control with isStatusShown, but line 270 builds chips with isStatusApplied: isStatusEnabled. AnalyticsTrendsTab.tsx:181 sets status: 'ALL'. getAnalyticsFilterChips.ts:63 says a chip must not claim a filter that is not applied. A test in AnalyticsFilterBar.test.tsx expects the chip so it can be removed, so a fix must keep a way to clear it.

**Suggested fix:** Do not show it as an applied filter on Trends. Either pass isStatusApplied: isStatusShown, or keep a removable chip worded as not applied here, such as 'Status: Left (not applied on this tab)'.

## L4 [major] SERVER
File: `packages/twenty-server/src/modules/analytics/services/crm-analytics-metrics.service.ts` line 2315

**Problem:** The NEW_APPLICATIONS reader nulls only buckets before the period containing tracking start. A previous period that starts before tracking but straddles it therefore returns a partial count as previousValue, which breaks the settled rule.

**Scenario:** Tracking start is 2026-10-27, period is MONTH, filter is 2026-11-01 to 2026-11-30. The one bucket's previous bucket is 2026-10-01. firstTrackedBucketStart is also 2026-10-01, so the check `bucketStart < firstTrackedBucketStart` is false and previousValue is October's partial count, for example 4 from late-October submissions, against a full November of 120. The comparison shows a huge rise when it should show no comparison. The same happens at WEEK when the previous bucket is 2026-10-26, which starts one day before tracking.

**Evidence:** Contract 'Decisions from testing' says: "a previous value is null, never 0, when the previous period starts before tracking start". hasRangeStartedBeforeTracking (line 894) applies that rule to the figures, using the tracking local date. buildTrendSeries (line 689) reads previous values through the same closure, whose cut-off is the period start of the tracking date. The spec at line 1525 only covers buckets that end before tracking.

**Suggested fix:** Keep the straddling bucket's own value, which the spec expects, but null previousValue for NEW_APPLICATIONS when previousBucketStart is earlier than computeCrmAnalyticsLocalDate(trackingStart, timeZone). For example, give the reader a separate previous-value check. Add a spec for a straddling previous bucket.

## L5 [major] SERVER
File: `packages/twenty-server/src/modules/analytics/services/crm-analytics-metrics.service.ts` line 2309

**Problem:** New applications trend nulls only buckets wholly before tracking start, so a previous bucket that starts before tracking but contains it returns a partial count as a known previous value.

**Scenario:** Tracking start is 2026-10-27. On Trends, period By month, filter Nov 1 to Nov 30, viewed in December. The November point's previousValue is October's count, which covers only Oct 27 to 31 of the month. The table shows it plus a large positive change. The week filter Nov 2 to Nov 8 does the same: previous week 10-26 misses Monday.

**Evidence:** firstTrackedBucketStart = computeCrmAnalyticsPeriodStart(local date of trackingStart, period), and the value is null only when bucketStart < firstTrackedBucketStart. buildTrendSeries calls the same readValue for previousBucketStart. Contract 'Decisions from testing' says a previous value is null when the previous period starts before tracking start. AnalyticsTrendTable.tsx:78-93 and AnalyticsTrendSmallChart/AnalyticsOverviewCharts use previousValue raw; only the takeaway and summary apply isAnalyticsPeriodFullyTracked.

**Suggested fix:** In buildTrendSeries or the NEW_APPLICATIONS branch, return previousValue null when previousBucketStart is earlier than the first full tracked local date, the same rule as isAnalyticsPeriodFullyTracked. Keep the current point's own value.

## L6 [minor] PAGE
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsReportView.tsx` line 269

**Problem:** The download failure message is not cleared when a different report is selected, so it appears under a report whose download was never attempted.

**Scenario:** PDF generation fails for the March report, showing 'The PDF could not be made'. The user then selects the February report. The error stays visible under February until they click Download again.

**Evidence:** AnalyticsReportDownload holds hasDownloadFailed in useState and sits at the same tree position in AnalyticsReportView. AnalyticsReportsTab renders AnalyticsReportView with no key, so selecting a report only changes props and the state survives. It is reset only inside handleDownload.

**Suggested fix:** Pass key={`${report.periodType}:${report.periodStart}`} to AnalyticsReportDownload at line 412 so the state resets for each report.

## L7 [minor] PAGE
File: `packages/twenty-front/src/modules/crm-analytics/utils/buildFunnelAnswerCards.ts` line 109

**Problem:** The Overall conversion answer card drops isLighter from buildOverallConversionAnswer, and AnalyticsAnswerCard has no way to draw a value lighter, so small-sample and so-far overall rates show at full strength.

**Scenario:** overall.eligible = 12, rate = 0.25: the Funnel tab card shows a full-weight "25%". With eligible = 0, soFarRate = 0.1 it shows a full-weight "10% so far". The Overview figure and the PDF draw the same value lighter.

**Evidence:** `const { value, detail } = buildOverallConversionAnswer(args);` ignores isLighter. charts/AnalyticsAnswerCards.tsx always renders StyledValue. AnalyticsFiguresRow.tsx:214 uses StyledLighterValue for the same answer. dashboard-redesign.md rule 6 says a rate under the minimum sample or still in progress draws lighter.

**Suggested fix:** Add an optional isLighter to AnalyticsAnswerCard, render a lighter value in AnalyticsAnswerCards, and pass isLighter through from buildFunnelAnswerCards.

## L8 [minor] PAGE
File: `packages/twenty-front/src/modules/crm-analytics/utils/formatAnalyticsRate.ts` line 19

**Problem:** A non-zero rate below 0.05% rounds to "0%", which reads as a measured zero. The top end is clamped to 99.9, but the bottom end has no matching clamp.

**Scenario:** 1 of 2,500 eligible people reach Signed, so rate = 0.0004. percent = 0.04, Math.round(0.4)/10 = 0, and the ledger, answer card and takeaway all show "0%" although one person converted.

**Evidence:** `if (rate > 0 && rate < ONE_PERCENT) { return `${percentToOneDecimal}%`; }` has no lower bound, while the upper branch uses Math.min(percentToOneDecimal, HIGHEST_PERCENT_BELOW_ALL). The function's comment says one decimal keeps a rate from reading as none.

**Suggested fix:** Use Math.max(percentToOneDecimal, 0.1) in the low branch.

## L9 [minor] PAGE
File: `packages/twenty-front/src/modules/crm-analytics/charts/AnalyticsHeatmap.tsx` line 157

**Problem:** The automatic color scale top takes the largest value of all cells, including small-sample and in-progress cells, so one tiny group can wash out the color of every reliable cell.

**Scenario:** Categories step heatmap with no maxValue: a group of 1 person at 100% and groups of 200 people at 40% and 20%. scaleTop becomes 1, so the large groups get ratios 0.4 and 0.2 and draw blue5 and blue4. The 100% cell is itself drawn lighter (blue7), so the top of the ramp is never used. Without the outlier, the 40% cell would be the darkest (blue9). A single person changes how every other group looks.

**Evidence:** Lines 157-164 collect every defined cell value with no filter on isSmallSample or isInProgress. getCellStyle (line 168) divides by that top. Callers AnalyticsCategoryCharts.tsx:370, AnalyticsTrendCohortHeatmap.tsx:47 and AnalyticsReportView.tsx:556 appear to pass no maxValue (grep of maxValue= found no heatmap use).

**Suggested fix:** Compute scaleTop from cells where isSmallSample and isInProgress are not true, falling back to all values when none qualify, and clamp the ratio (getAnalyticsSequentialColor already clamps), or pass maxValue={1} from the rate heatmaps.

## L10 [minor] PAGE
File: `packages/twenty-front/src/modules/crm-analytics/charts/getAnalyticsNiceTicks.ts` line 1

**Problem:** The 2.5 step multiple produces rate ticks such as 2.5% and 7.5%, but rate charts format ticks with formatAnalyticsRate, which rounds to whole percent, so axis labels misstate their gridline positions.

**Scenario:** The category scatter has a highest overall conversion of 0.09. roughStep is 0.0225, so the step is 0.025 and ticks are 0, 0.025, 0.05, 0.075, 0.1. The Y axis reads 0%, 3%, 5%, 8%, 10% with equal spacing. A point at 2.5% looks like it sits on the 3% line. Compact trend rate charts do the same when the highest rate is above 0.04 and up to 0.05: 0%, 3%, 5%.

**Evidence:** getAnalyticsNiceTicks.ts:1 has NICE_STEP_MULTIPLES [1, 2, 2.5, 5, 10]. AnalyticsCategoryCharts.tsx:390 uses formatAnalyticsRate for formatY. AnalyticsTrendSmallChart.tsx:163 reaches it through formatAnalyticsTrendValue. formatAnalyticsRate returns Math.round(percent) for rates from 1% to 99%.

**Suggested fix:** Let callers ask for ticks that survive whole-percent display, for example a flag that drops the 2.5 multiple when the step is below 0.1, while keeping 0.25 for the 0 to 1 axis. Alternatively, format axis ticks with one decimal.

## L11 [minor] PAGE
File: `packages/twenty-front/src/modules/crm-analytics/charts/AnalyticsDivergingBarChart.tsx` line 60

**Problem:** The left side has a negative end margin, so its box is wider than the right side, and bar widths are percentages of each side's own box. The same value draws a longer bar on the left, in a chart meant to compare the two sides.

**Scenario:** A row has entered = 20 and left = 20, and that is the largest value. With columns about 150px wide, the left bar's base is about 9px wider (8px margin plus the right side's 1px border). The left bar draws about 5% longer than the right, so it suggests more people left than entered.

**Evidence:** Line 60 sets margin-inline-end: calc(-1 * spacing[2]) on StyledLeftSide only. Line 123 computes width as calc((100% - 5ch) * ratio) for both sides, and lines 166 and 177 apply it to bars in those different-width parents.

**Suggested fix:** Keep both sides the same width and close the gap another way, such as column-gap 0 between the two side columns, or give the bars a shared pixel base.

## L12 [minor] PAGE
File: `packages/twenty-front/src/modules/crm-analytics/utils/getAnalyticsCategoryClickFilter.ts` line 24

**Problem:** Clicking a selected program to clear it sets the track filter to the program's parent, even if the user never chose a track.

**Scenario:** In the filter bar, pick a program with Track left on All, which AnalyticsFilterBar.tsx:273 allows. The tooltip says 'Click to clear this filter'. Clicking the row returns trackKey = parent and programKey = null, so the page narrows to the whole track instead of returning to no filter.

**Evidence:** Line 24 is `trackKey: row.parentKey` with `programKey: toggleKey(row.key, filter.programKey)`, and it does not check whether the toggle cleared the key. The hint comes from AnalyticsCategoryCharts.tsx:116-121.

**Suggested fix:** When row.key === filter.programKey, return { ...filter, programKey: null } and leave trackKey as it was. Set trackKey to the parent only when selecting a program.

## L13 [minor] PAGE
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsCategoryCharts.tsx` line 260

**Problem:** Under a track filter the people chart draws program rows, but its overlap note checks peopleInSeveralTracks, which is always 0 there.

**Scenario:** Filter to the AI track where 5 people hold two AI programs. The server keeps only that track's positions (metrics service 505-525), so peopleInSeveralTracks = 0 and peopleInSeveral = 5. The program bars add up to 5 more than the total, and the warning that bars can exceed the total is missing.

**Evidence:** Line 260 is `!isSourceView && peopleInSeveralTracks > 0`, while getAnalyticsCategoryChartRows returns program rows when a track or program is filtered. AnalyticsCategoryTable.tsx:192-195 already switches to peopleInSeveral when programs are shown.

**Suggested fix:** Use categories.peopleInSeveral when chartRows contains program rows (parentKey defined), and peopleInSeveralTracks otherwise.

## L14 [minor] PAGE
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsCategoryCharts.tsx` line 117

**Problem:** The click hint compares the row key against all three filter keys regardless of grouping, so the shared NONE key gives a false 'Click to clear this filter'.

**Scenario:** Set Source to 'No source' (sourceKey = NONE) and open Tracks and programs. The 'No position' row says 'Click to clear this filter', but clicking it adds trackKey = NONE and the source filter stays. The reverse happens in the Sources view with trackKey = NONE.

**Evidence:** Lines 116-120 test `row.key === filter.sourceKey || row.key === filter.trackKey || row.key === filter.programKey`. getAnalyticsCategoryClickFilter only toggles the key for the current groupBy.

**Suggested fix:** Compare only the current dimension: sourceKey in the Sources view, and trackKey or programKey (by parentKey) in the tracks view.

## L15 [minor] PAGE
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsTrendTable.tsx` line 82

**Problem:** The Change column compares NEW_APPLICATIONS against a partly tracked previous period. The summary line above the same chart refuses that comparison.

**Scenario:** Tracking starts Tue 2026-10-27. Choose 2026-11-02 to 2026-11-08 By week once that week is complete. The previous bucket is the week of Oct 26, which is only partly tracked. The table shows a Change such as +15 from an undercounted or unknown-total base, with no caveat.

**Evidence:** getChange only checks point.isPartial. summarizeAnalyticsTrendSeries.ts:156 uses isAnalyticsPeriodFullyTracked for the same case. The server (crm-analytics-metrics.service.ts:2315-2319) nulls only buckets wholly before tracking start, so the partly tracked bucket arrives with a value.

**Suggested fix:** Return null from getChange for running-count metrics when the previous bucket (previous period start) is not fully tracked. This needs the tracking fields from base, or a previous bucket start on the point.

## L16 [minor] PAGE
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsTrendTable.tsx` line 88

**Problem:** For MEDIAN_DAYS the minimum-sample check on the previous value never fires, because the server sends previousSize null for every non-rate metric. A change from a tiny earlier sample is shown as real, and the earlier value is not muted.

**Scenario:** A week has a median of 6.0 from 40 completed stays. The bucket one window back has a median of 30.0 from 1 stay. The table shows Change -24.0 and an unmuted 30.0. If the sizes were reversed, the change would be hidden.

**Evidence:** crm-analytics-metrics.service.ts:696 sets `previousSize: isRateMetric ? previous.size : null`. isSmallSample(null, minimumSample) returns false.

**Suggested fix:** Have the server send previous.size for MEDIAN_DAYS as well, for example `previous.size` for all metrics, since counts already return size null.

## L17 [minor] PAGE
File: `packages/twenty-front/src/modules/crm-analytics/report-pdf/constants/AnalyticsPdfFont.ts` line 2

**Problem:** The PDF only uses the built-in Helvetica (WinAnsi) font, but dates, numbers and stage labels are formatted with the user's active locale, and no Unicode font is registered.

**Scenario:** A user whose CRM locale is ru-RU, zh-CN or ar-SA downloads a monthly report. The month name in the title, for example from i18n.date with month 'long', prints as garbage or blanks. A fr-FR user gets U+202F as the thousands separator from i18n.number, which is outside WinAnsi, so the separator in counts should misprint. English-locale users with Latin labels are not affected.

**Evidence:** ANALYTICS_PDF_FONT sets only Helvetica and Helvetica-Bold, and a grep for Font.register in crm-analytics finds nothing. formatAnalyticsPdfNumber uses i18n.number, and formatAnalyticsReportPeriod and AnalyticsReportPdfDocument use i18n.date, all with the active locale. This comes from reading the code and react-pdf's known standard-font limit; no PDF was rendered.

**Suggested fix:** Either register a Unicode font with Font.register for the PDF, or format PDF dates and numbers with a fixed Latin locale such as en. Non-Latin stage labels would still need the Unicode font.

## L18 [minor] PAGE
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsOverviewCategoryCard.tsx` line 33

**Problem:** Overview cards with their own queries show the previous filter's numbers under the new chips, with no refetching sign. The tab dims only for the overview query.

**Scenario:** Click a track on Overview. The overview query returns first and the dim clears. 'People by track', 'Top sources', the line chart, the sparklines and the Overall conversion figure keep the old filter's values until their slower queries finish, and page reads may take up to the 8 second timeout. Meanwhile the chips and other figures already show the new filter, for example Total contacts for one track beside a conversion rate for everyone.

**Evidence:** useCrmAnalyticsQuery.ts:32 returns data ?? previousData. AnalyticsOverviewCategoryCard.tsx:33-38 and AnalyticsOverviewCharts.tsx:58 and 66-71 do not read isRefetching. AnalyticsOverviewTab.tsx:112 dims from the overview query only. AnalyticsTrendsTab.tsx:265 likewise ignores AnalyticsTrendTrackCharts and AnalyticsTrendStageChart refetches.

**Suggested fix:** Add each child query's isRefetching to the dimming, or pass it to AnalyticsChartCard so each card dims itself.

## L19 [minor] PAGE
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsTrendTrackCharts.tsx` line 113

**Problem:** While the period changes, old buckets are labelled with the new period. Charts use filter.period to format the labels, but the points still come from the previous response.

**Scenario:** On Trends, click 'By month' while viewing 'By week'. Until the refetch returns, up to 26 weekly points carry month labels, so one month appears many times, and the tooltip and number table use the same wrong labels. 'By day' does the reverse.

**Evidence:** AnalyticsTrendTrackCharts.tsx:103 and 113 pass filter.period with points from the retained bundle. AnalyticsTrendsTab.tsx:324 and 376 pass the current period the same way. The server returns the matching period in AnalyticsSeriesBundle.period and AnalyticsTrends.period (crm-analytics-metrics.service.ts computeSeriesBundle and computeTrends), but these charts do not use it.

**Suggested fix:** Format with the payload's own period (bundle.period or trends.period) instead of filter.period.

## L20 [minor] PAGE
File: `packages/twenty-front/src/modules/crm-analytics/utils/formatAnalyticsRate.ts` line 19

**Problem:** A non-zero rate below 0.05% prints as 0%. The low branch rounds to one decimal with no floor, unlike the 99.9 cap at the high end.

**Scenario:** rate = 1/2500 = 0.0004: percent is 0.04, Math.round(0.4)/10 gives 0, so the output is '0%', although one person moved. The same happens in cells, donut shares and tooltips.

**Evidence:** The comment says one decimal 'keeps a rate from reading as none or all'. The code returns `${percentToOneDecimal}%` with no minimum, while the high branch uses Math.min(percentToOneDecimal, 99.9).

**Suggested fix:** Use Math.max(percentToOneDecimal, 0.1) in the low branch, mirroring the high-end cap.

## L21 [minor] PAGE
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsTrendSmallChart.tsx` line 163

**Problem:** Rate line chart axis ticks use the whole-percent rate formatter, so 2.5% steps get wrong labels. The PDF already avoids this with formatLineRateTick. The same formatter is used in AnalyticsTrendTrackCharts.tsx:132 and in the report view through buildAnalyticsReportTrendCharts.

**Scenario:** A conversion series peaking at 9%: getAnalyticsNiceTicks returns 0, 0.025, 0.05, 0.075, 0.1. AnalyticsLineChart prints formatLineValue(tick) as 0%, 3%, 5%, 8%, 10%, so gridlines are unevenly labeled and values read against them are off.

**Evidence:** AnalyticsLineChart has one formatValue for ticks and values, and these callers pass formatAnalyticsTrendValue, which calls formatAnalyticsRate and rounds to whole percent. AnalyticsPdfTrendsSection.tsx:54 notes 'Axis steps can land on 2.5%, which the rate format would round to 3%'.

**Suggested fix:** Add a separate tick formatter prop to AnalyticsLineChart, keeping one decimal for rate ticks as formatLineRateTick does in the PDF.

## L22 [minor] SERVER
File: `packages/twenty-server/src/modules/analytics/services/crm-analytics-metrics.service.ts` line 899

**Problem:** hasRangeStartedBeforeTracking compares local dates only, so a previous period starting on the tracking-start day counts as fully tracked even when tracking began after midnight. Its comparison value is then a partial count, not null.

**Scenario:** CRM_ANALYTICS_TRACKING_START_AT is 2026-11-02T12:00:00Z (a Monday, zone UTC). The first WEEK report is 2026-11-09, with previous range 2026-11-02 to 2026-11-08. from equals the tracking local date, so the check returns false. newApplicationsPrevious and the ENTERED_* previous values show a number missing Monday morning, which can also skew isSignificant. The default midnight start is not affected.

**Evidence:** Lines 899-900 use `from < computeCrmAnalyticsLocalDate(context.trackingStart, context.timeZone)`. The decision 'Comparisons before tracking' says previous is null when the previous period starts before tracking start. computeFirstFullLocalDate in compute-crm-analytics-report-periods.util.ts:174-186 does treat a mid-day start day as not full.

**Suggested fix:** Compare instants: return computeCrmAnalyticsLocalDayStart(from, context.timeZone) earlier than context.trackingStart, using Temporal.Instant.compare, so a mid-day start day counts as started before tracking.

## L23 [minor] SERVER
File: `packages/twenty-server/src/modules/analytics/utils/parse-crm-analytics-filter.util.ts` line 119

**Problem:** parseCrmAnalyticsLocalDate sets a minimum date but no maximum, so a far-future dateTo produces a previous-period start that Postgres cannot parse, and the query fails with a raw SQL error instead of a clean UserInputError.

**Scenario:** getCrmAnalyticsOverview with filter { dateTo: '9999-12-31' } and no dateFrom. from is the tracking start 2026-10-27, dayCount is about 2.9 million, and previous.from becomes about '-005947-...'. The Overview tab errors with an internal server error. Any dateTo past roughly year 4050 does the same. Found by reading the code; not run.

**Evidence:** resolveNewApplicationRanges (crm-analytics-metrics.service.ts:1367-1372) computes addCrmAnalyticsLocalDays(from, -dayCount). Temporal prints a negative year as an expanded string. The SQL at crm-analytics-metrics.service.ts:970 binds previousRange.from with ::date before hasRangeStartedBeforeTracking nulls the result at line 977, so the null check does not prevent the error.

**Suggested fix:** Add a MAXIMUM_LOCAL_DATE such as '2100-12-31' next to MINIMUM_LOCAL_DATE and reject values above it in parseCrmAnalyticsLocalDate.

## L24 [minor] SERVER
File: `packages/twenty-server/src/modules/analytics/services/crm-analytics-metrics.service.ts` line 823

**Problem:** With no date filter, getCategories gives New applications a default last-7-days range, while People and cohort rates in the same row are all-time. The payload does not return that range and the table does not show it.

**Scenario:** Open Categories with no dates. A track shows People 500 and New applications 12. The 12 covers only the last 7 days, but the column reads like the same all-time span as People, so a reader takes it as 12 applications in total for the track.

**Evidence:** Lines 816-825 pass dateRange (null, null) to peopleDateRange and cohortDateRange, but resolveNewApplicationRanges(context, filter).current to submissionRange. That function defaults to localToday-6 at line 1364. Overview returns newApplicationsFrom/To and shows them (AnalyticsFiguresRow.tsx:186). AnalyticsCategories has no such fields, and AnalyticsCategoryTable.tsx:222 is headed only 'New applications'.

**Suggested fix:** Return the range in the categories payload and show it in the column header or note, for example 'New applications (Nov 1 to Nov 7)', as Overview does. Do this also for the bar row tooltips in buildCategoryBarRows.ts:62.

## L25 [minor] SERVER
File: `packages/twenty-server/src/modules/analytics/services/crm-analytics-metrics.service.ts` line 475

**Problem:** An imported person whose only moves stay inside one stage key gets is_inactive false and stage_entered_at NULL, so they drop out of both the stuck and inactive counts. This is latent: the current config has no reminder raw values, so it starts once the first one is added.

**Scenario:** After a reminder raw value is added under CONTACTED, as the config comment describes: a person imported before tracking start in CONTACTED moves to the reminder value and sits for 60 days. moved_person contains them, so is_inactive is false. latest_entry skips them because from_key equals to_key, and created_at is before $2, so stage_entered_at and days_in_stage are NULL. They count in neither stuck_count nor inactive_count, and the stuck list drops them.

**Evidence:** Line 471: moved_person reads every transition, and the transition CTE filters only on raw from_stage differing from to_stage. Line 469: latest_entry requires from_key to differ from to_key. Line 475: the CASE yields NULL for created_at before $2. Line 488: the stuck condition is NULL when days_in_stage is NULL. Config comment at crm-analytics-config.constant.ts:36: 'A reminder or a renamed value is one more rawValues entry on its parent'. All current entries have isReminder false, and no active stage has two raw values.

**Suggested fix:** Build moved_person from transitions where from_key differs from to_key, so a within-stage move still counts as inactive. Alternatively, start the clock at the earliest within-stage move and mark it as a lower bound.
