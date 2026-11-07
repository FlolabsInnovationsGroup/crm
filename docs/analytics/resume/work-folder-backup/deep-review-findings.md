# Deep review findings

Collected 2026-11-08. confirmed: an independent agent checked it. unverified or plausible: not settled, so check it yourself first.

## D1 [major] SERVER (confirmed, from U08-overview)
File: `packages/twenty-server/src/modules/analytics/services/crm-analytics-metrics.service.ts` line 1367

**Problem:** A New applications range that runs past today is not cut at today, so the change compares a part-finished range with a full previous range of the same declared length.

**Scenario:** Viewing on 2027-02-08 with custom dates Feb 1 to Feb 28: to = Feb 28 and dayCount = 28, so previous = Jan 4 to Jan 31, fully tracked. With 60 submissions so far and 200 previous, the tile shows 'Feb 1 to Feb 28' and '-140 against the previous period', though only 8 of 28 days have happened. The reported smaller version does not count: the default and 'Last 7 days' ranges end today, and contract line 470 sets exactly that comparison.

**Evidence:** resolveNewApplicationRanges line 1367 has `dateTo ?? context.localToday` with no cap, and lines 1373-1379 size previous from it. computeCrmAnalyticsTrendBuckets (compute-crm-analytics-report-periods.util.ts:131) does cap at localToday. Nothing stops the date earlier: AnalyticsFilterBar.tsx:280-282 has no upper limit, the To input at lines 351-357 passes no latestDate, AnalyticsContent passes the filter unchanged, and parse-crm-analytics-filter.util.ts:121-125 only rejects dates after 2100-12-31. AnalyticsOverviewTab.tsx:30-42 checks tracking start only. Trends refuses this same comparison for running counts (summarizeAnalyticsTrendSeries.ts:160-161, AnalyticsTrendTable.tsx:112). Contract line 470 says 'equal-length span before' but does not address a range reaching past today. No test pins a future dateTo.

**Suggested fix:** Cap `to` at localToday when the range starts on or before today, compute dayCount from the capped range, and return the capped date in newApplicationsTo so the label matches. Take care with a range wholly in the future: `requestedFrom > to ? to : requestedFrom` would then move it to today and count today's applications, so keep its dates and give it no comparison. Leave ranges ending today as they are, because the spec at crm-analytics-metrics.service.spec.ts:810-833 pins them. Add a spec with a future dateTo.

## D2 [major] PDF (confirmed, from U18-pdf-funnel)
File: `packages/twenty-front/src/modules/crm-analytics/report-pdf/components/AnalyticsPdfFunnelSection.tsx` line 134

**Problem:** The PDF never reads funnel.cohortExcludedUnmapped. When every applicant is unmapped it prints 'No one has entered the funnel since tracking started.' When some are unmapped it prints 'People, all applications since tracking start' (line 180) and leaves them out without saying so. No other part of the PDF gives this count, so a stage value missing from the config is invisible to a PDF reader.

**Scenario:** The config's raw stage values are guesses (isProvisional true). Say production's entry value is 'NEW_LEAD', which is not in rawValues, and 200 people applied after tracking start. If none has moved, the excluded count is 200 and every rows[].entered is 0, so hasData is false and the PDF says no one has entered. The first page also keeps saying 'Too early to tell: people need 90 days to count', even after 90 days. If 50 of them moved to CONTACTED, those 50 enter through the transition's to_rank and 150 are excluded. New then shows 50 and, once their windows close, 100% moved on, under the 'all applications' note with no mention of the 150. The page's Funnel tab says '150 people left out because every stage they had is not mapped.'

**Evidence:** git grep in report-pdf finds cohortExcludedUnmapped only in __tests__/analyticsPdfFixtures.ts. crm-analytics-metrics.service.ts:1037 fills the field and 1720-1750 counts cohort people with current_key NULL and no mapped transition. build-crm-analytics-cte.util.ts:73-85 keeps them in cohort, but arrival needs a rank, so person_step omits them. crm-analytics-report.service.ts:277 freezes the same funnel, count included, using the report's cohort date range. AnalyticsFunnelCharts.tsx:71 and AnalyticsStageLedger.tsx:199 disclose it; for the frozen report, AnalyticsReportView.tsx:428 shows the ledger behind 'Show numbers'. buildAnalyticsPdfAnswers.ts:51 and 62 and buildAnalyticsPdfKeyFigures.ts:90 give the 'too early' lines. The first page's provisional notice gives no count. Contract line 419 defines the field, and nothing in the contract or dashboard-redesign.md exempts the PDF. It is not in large-review-findings.md.

**Suggested fix:** In AnalyticsPdfFunnelSection.tsx, use formatAnalyticsPdfPeople(funnel.cohortExcludedUnmapped). In the !hasData branch, when the count is above 0, print a line such as '200 people applied, but every stage they had is not mapped yet' instead of 'No one has entered'. When hasData is true and the count is above 0, append the page's sentence, '{people} left out because every stage they had is not mapped', to the note at line 180. Add a test using a fixture with a non-zero count: the weekly fixture already has 3, but no test reads it.

## D3 [major] CHARTS (unverified, from U06-bar-charts)
File: `packages/twenty-front/src/modules/crm-analytics/charts/AnalyticsColumnChart.tsx` line 203

**Problem:** The x-label stride built for dense time axes also applies to the stage columns, so every other stage name goes blank at common laptop widths. The 'Lowest step' column can end up with no name under it.

**Scenario:** Funnel tab or report, 'Conversion at each step', 8 funnel rows give 7 columns. The chart root is about 480px wide, for example a 1920x1080 laptop at 150% scaling (1280 CSS px) with the navigation open. Plot = 480 - 44 = 436, slot = 62.3, stride = ceil(64 / 62.3) = 2. Only New, Before meeting, Attended and Agreement sent are named. Contacted, Saturday meeting and Second meeting have blank labels. If Contacted is lowest, the column reads 'Lowest step 12%' with nothing beneath it, and only hovering reveals the stage. This happens whenever the plot is under 448px, which is the two-column grid on windows narrower than roughly 1300px (estimated, navigation width not measured).

**Evidence:** Line 203: xLabelStride = Math.ceil(X_LABEL_WIDTH_IN_PX / slotWidth). Line 303: index % xLabelStride === 0 ? column.label : ''. Callers AnalyticsFunnelCharts.tsx:90 and AnalyticsReportView.tsx:444 pass categorical stage columns, and buildFunnelCharts.ts:116-117 sets stage key and label. StyledXLabel already wraps to two lines, so these names would fit in a 60px slot. Found by reading the code and doing the width arithmetic; not rendered.

**Suggested fix:** Add a prop such as hasEveryLabel, or only apply the stride to time axes passed by AnalyticsTrendStageChart. Categorical columns keep every label and rely on the existing two-line wrap.

## D4 [major] CHARTS (unverified, from U06-bar-charts)
File: `packages/twenty-front/src/modules/crm-analytics/charts/AnalyticsColumnChart.tsx` line 146

**Problem:** The stride blanks neighbouring labels but the shown label does not get their room. Each label box stays one slot wide, so on dense axes the date breaks into letters and is clipped.

**Scenario:** Trends, 'People in each stage over time', By day: the default 30 buckets (maximum 60). Root about 500px, plot 456, slot 15.2, stride 5. Every fifth label is shown in a box 13.2px wide after padding. 'Nov 3' at xs size does not fit, so overflow-wrap: anywhere splits it per letter and line-clamp keeps two lines, drawing about 'N' over 'o'. The date axis cannot be read; only the tooltip gives the date. By week (12) and By month (12) mostly survive by wrapping; a wide custom week range does the same as By day.

**Evidence:** Line 146: flex: 1 1 0 with min-width: 0 (148) gives every label, including the empty ones, an equal share of the row. Lines 144, 149 and 150 clamp, clip and break anywhere. Line 303 only swaps text to ''. Counts come from DEFAULT_TREND_BUCKET_COUNTS in compute-crm-analytics-report-periods.util.ts:26-30. AnalyticsLineChart draws its labels in SVG, so it does not have this problem. Traced from CSS; not rendered.

**Suggested fix:** Give a shown label the width of its stride, for example flex-grow equal to the stride with skipped slots not rendered, or position it absolutely at its slot center with white-space: nowrap.

## D5 [major] PAGE (unverified, from U14-trend-cards)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsTrendStageChart.tsx` line 138

**Problem:** The stacked column's 'Total' and the number above each column cover only MAIN and EXIT stages. Interested, unmapped and no-stage people are left out with no segment or note, so the total is below Total contacts for the same day.

**Scenario:** The latest snapshot holds 77 people: 60 in mapped stages, 12 in INTERESTED and 5 on an unmapped raw value. The stage chart column reads 60 and its tooltip says 'Total 60', while the Total contacts card on the same tab says 77. In production the gap could be large: FLOLABS.md lists about 25 stage options, the config maps 12 stage keys, and every other raw value is unmapped. The note 'People in each stage' does not warn about this.

**Evidence:** Line 119 sums only the returned series, and the column chart prints that sum (AnalyticsColumnChart.tsx:279). CRM_ANALYTICS_SERIES_STAGES (crm-analytics-series-stages.constant.ts:3) keeps only kind MAIN or EXIT, and buildSeriesGroups 'STAGE' (crm-analytics-metrics.service.ts:2100) makes one line per entry. readSnapshotBuckets filters STAGE_COUNT with m.stage_key = stage, while TOTAL_CONTACTS has no stage condition and its LEFT JOIN keeps every raw stage. Overview stage totals do return OTHER, UNMAPPED and NO_STAGE rows (AnalyticsStageTotalRow.rowKind). This confirms the [config] shared note.

**Suggested fix:** Add a gray 'Other or unmapped' segment. For example, the server adds a series for everything outside MAIN and EXIT (total minus stage rows), so the stack sums to Total contacts. A smaller alternative is to label the row 'Total in these stages' and say in the note who is left out.

## D6 [major] PAGE (unverified, from path-react-lifecycle)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsOverviewCharts.tsx` line 128

**Problem:** When the funnel or series query fails after a filter change, the figures row still draws the previous filter's overall conversion and sparklines. useCrmAnalyticsQuery returns previousData as payload while error is set, and this component never checks the error before using the payload.

**Scenario:** Overview with no filter shows overall conversion 25%. Pick Track = Robotics. The overview query succeeds, but the funnel and series queries hit the busy or 8 second limit. The Overall conversion tile keeps showing 25% from the unfiltered funnel at full strength, with the note 'This figure could not load', next to Robotics figures. All sparklines keep the unfiltered lines with no error note, and hovering gives old numbers. There is no retry on the tile, so this stays until the next filter or tab change.

**Evidence:** useCrmAnalyticsQuery.ts:32 has currentData = data ?? previousData, so payload is the old filter's result when data is undefined and error is set. AnalyticsOverviewCharts.tsx:128 builds the answer from isDefined(funnel) only. Line 132 passes the error only as a flag. AnalyticsFiguresRow renders overallConversionValue and only swaps the note. readSparkline at line 86 reads seriesBundle with no seriesError check. Chart cards are safe because AnalyticsChartCard checks error first. The figures row is not a card. U01's shared note reports the hook behavior.

**Suggested fix:** Pass overallConversion as null when funnelError is defined, and empty sparklines when seriesError is defined. Alternatively make the hook return payload undefined when error is set and data is undefined, then recheck the callers that rely on the retained value.

## D7 [major] SERVER (unverified, from path-words-against-numbers)
File: `packages/twenty-server/src/modules/analytics/services/crm-analytics-metrics.service.ts` line 2450

**Problem:** Under a date filter, tiles and the charts with the same title count different populations, with no note saying so. Snapshot metrics use the dates only to pick buckets.

**Scenario:** 43,000 imported people, 40 created in the last 30 days, chip 'Last 30 days'. The Overview tile 'Active people' shows 12, and its sparkline tooltip right below it reads 'Week of Nov 2: Active people 40,312'. The Trends 'Active people' and 'Total contacts' cards also show about 40,000 under the same chip. A recruiter sees two values for one title and one filter.

**Evidence:** computeOverview passes scopeDateRange: dateRange into readStageCounts (lines 1391-1395), so tiles count only people created in range. readSnapshotBuckets reads dimension 'all' or one category and never touches created_at. AnalyticsOverviewCharts.tsx:79 sends the dates into the series. The notes at AnalyticsTrendsTab.tsx:94-98 say only 'from the last daily count in each period'. Contract section 6 'Date filter' says current-state views narrow by created date.

**Suggested fix:** On the page: hide the three snapshot sparklines on Overview while a date filter is active, and add to the Trends snapshot notes and AnalyticsTrendStageChart 'Everyone in the CRM on that day. Dates only choose the periods shown.'

## D8 [major] PDF (unverified, from path-words-against-numbers)
File: `packages/twenty-front/src/modules/crm-analytics/report-pdf/utils/buildAnalyticsPdfAnswers.ts` line 184

**Problem:** The PDF question 'Which step has the lowest conversion?' is answered with funnel.lowestStepStageKey, which skips the first step whenever a later step qualifies, so it can name a step that is not the lowest. The 'Lowest step' labels on charts, the ledger and the takeaway have the same problem.

**Scenario:** New to Contacted is 20% of 200, Contacted to Before meeting is 45% of 80, and all others are higher. The PDF answers 'Contacted to Before meeting: 45% moved on'. The PDF note says 'The lowest step is in color' and colors the 45% column beside a 20% one. On the Funnel tab the Biggest drop card says 80% from New to Contacted, while the column chart marks Contacted 'Lowest step'.

**Evidence:** computeLowestStepStageKey (metrics service 635-657) filters out rows[0] when laterRows exist. buildLowestStepAnswer reads that key. AnalyticsPdfFunnelSection.tsx:164 has the note. AnalyticsFunnelCharts.tsx:93-94 passes highlightLabel 'Lowest step', and buildFunnelTakeaway.ts:69 prints it. Only the funnel card note at AnalyticsFunnelCharts.tsx:70 discloses the exclusion. buildFunnelAnswerCards.ts:30 admits the difference in a comment.

**Suggested fix:** Keep the selection rule from the contract but change the words: 'Lowest step after the first' on the PDF question and note, the column highlight, the ledger and the takeaway. Or have the PDF answer pick the true lowest qualifying step, as the Biggest drop card does.

## D9 [major] PAGE (unverified, from path-states-and-failure)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsOverviewTab.tsx` line 96

**Problem:** The Overview empty test looks only at totalContacts, so a date filter that excludes imported people replaces the whole tab with 'No people match these filters'. This drops the required imported-excluded notice and hides real New applications figures that came back in the same payload.

**Scenario:** Launch week: all 5,000 people were imported before tracking start 2026-10-27, and 12 of them resubmit a form this week. The user picks Last 7 days. The server's scope adds p.created_at >= tracking start, so totalContacts = 0, while importedExcludedByDate = 5000 and newApplications = 12. The page says no people match, with only a Reset button, and shows neither the 5,000 nor the 12.

**Evidence:** crm-analytics-metrics.service.ts:327 adds 'p.created_at >= $2' for any date filter. computeOverview:1437 returns importedExcludedByDate. computeNewApplications:976 joins scope only when hasPersonFilter is true, so the date filter does not narrow submissions. AnalyticsOverviewTab.tsx:96 returns EMPTY before the notice built at lines 105-111. Contract section 8 state table: 'Date filter on | importedExcludedByDate > 0 | {n} imported people have no known application date and are not shown.' The Funnel tab's EMPTY_FUNNEL panel explains the imported case; this one does not.

**Suggested fix:** Use EMPTY only when totalContacts is 0, importedExcludedByDate is 0 and newApplications is 0 or null. Otherwise render the layout with the notice and figures, or at least pass the imported count and notice into the empty panel.

## D10 [major] PAGE (unverified, from path-states-and-failure)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsOverviewCharts.tsx` line 128

**Problem:** The figures band reads the funnel and series payloads without checking their errors. After a failed filter change, the hook still returns the previous filter's payload, so the Overall conversion tile shows the old filter's rate and the sparklines show the old filter's shape. The funnel error also has no retry.

**Scenario:** With all people showing, Overall conversion reads 25%. Click track AI. The overview query succeeds for AI, but the funnel query fails with a busy or statement-timeout error. The tile shows '25%' for everyone directly above 'This figure could not load', beside AI's other figures. If instead the series query fails, the four sparklines keep the unfiltered weekly shapes with no error mark on the band, and only the line chart card below shows an error. The funnel figure has no Retry button, so it stays that way until the filter or tab changes.

**Evidence:** useCrmAnalyticsQuery.ts:32 returns data ?? previousData. Apollo 4.2 ObservableQuery gives data undefined with an error on changed variables, and useQuery keeps previousData. Lines 128-130 build overallConversion whenever funnel is defined, and line 132 only adds a flag. AnalyticsFiguresRow.tsx renders overallConversionValue and swaps only the note when hasOverallConversionError is true. readSparkline at lines 86-93 uses seriesBundle with no seriesError check. Lines 61-65 do not read retry from the funnel query.

**Suggested fix:** Treat payloads as absent when their error is set: overallConversion is null when funnelError is defined, and sparklines are undefined when seriesError is defined. Pass the funnel retry to the figure, for example a small Retry link next to 'This figure could not load'.

## D11 [major] SERVER (unverified, from facade)
File: `packages/twenty-server/src/modules/analytics/facade/crm-analytics-facade.service.ts` line 296

**Problem:** The submission relation matches forms by the exact name 'Internship Application'. If no form has that name, it returns no rows while hasFormSubmissionObject stays true, so New applications shows a measured 0 instead of the documented 'Not available'.

**Scenario:** Production's form is named 'FloLabs Internship Application', or an admin renames the form in the builder. getCrmState still reports hasFormSubmissionObject true. f.name IN ('Internship Application') matches nothing. Overview shows New applications 0 and a change of 0, category rows show 0, and trend buckets read as empty, while real applications keep arriving. I could not confirm the production name, because I have no access to production data.

**Evidence:** forms/internship-application.json has title 'FloLabs Internship Application'. FLOLABS.md:172 lists 'Internship Application', but that table is not literal: it lists 'General Questions' for the title 'GENERAL QUESTIONS' and 'Self-Assessment' for 'SELF-ASSESSMENT'. FormBuilderEditor.tsx:202 saves name as name.trim() || title, so the name is freely editable. Seed data and the facade spec use the constant, so tests pass either way. isCustomObjectUsable only checks metadata and never looks at form rows. Readers at metrics service ~957, ~1868 and ~2386 fall back to null or unavailable only when the relation SQL is null. THINGS-TO-DO-BEFORE-MERGE.md has no item for this.

**Suggested fix:** Confirm the literal name from production-audit.sql (line 71 reads _crmForm) and add that to the before-merge checklist. Also make a missing form visible: in the new-application readers, check whether any matching crmForm row exists and return null ('Not available') when none does.

## D12 [major] SERVER (unverified, from facade)
File: `packages/twenty-server/src/modules/analytics/facade/crm-analytics-facade.service.ts` line 303

**Problem:** A deleted person's applications disappear only until the person is destroyed. Destroying them sets personId to NULL, and the 's."personId" IS NULL' branch then counts the submission again as an application with no person.

**Scenario:** A person submits the form on Nov 3 and is soft-deleted on Nov 5. New applications for that period drops by 1, as the contract says. Trash cleanup hard-deletes the person after the 14-day default, the foreign key sets _formSubmission.personId to NULL, and the submission row stays. The period's live count and trend bucket go back up by 1, and the same range now gives a different number with no CRM activity. Bulk-deleting 200 bad records brings back 200 applications two weeks later.

**Evidence:** generate-morph-or-relation-flat-field-metadata-pair.util.ts:36 sets MANY_TO_ONE onDelete to SET_NULL, and setup-forms.mjs passes no override. trash-cleanup.service.ts calls repository.delete on rows past trashRetentionDays (workspace.entity.ts:156, default 14). Contract line 827 says a deleted person's applications are gone from new applications. The 'Decisions from testing' rule covers soft delete and genuinely personless applications, not this purge. public-form.service.ts rejects submissions with no email, so a NULL person at submit time happens only when upsertPersonKeepingTheLead fails and returns null.

**Suggested fix:** Tell purged people apart from submit-time failures, or take a user decision. One option is to treat NULL personId as excluded and accept losing the rare upsert-failure rows. Another is to read analytics.stage_transition or the email in the submission name to spot a person who once existed. If neither is wanted, record the upward drift in the contract as a known limit.

## D13 [major] SERVER (unverified, from overview)
File: `packages/twenty-server/src/modules/analytics/services/crm-analytics-metrics.service.ts` line 1367

**Problem:** resolveNewApplicationRanges does not clamp a future dateTo to localToday, so a partly elapsed current range is compared with a whole previous span of the full future length, and the label shows dates that have not happened.

**Scenario:** Today is 2026-12-08. Custom dates are Dec 1 to Dec 31 (AnalyticsFilterBar isToDateAllowed has no upper limit and the input has no max). dayCount = 31, so previous = Oct 31 to Nov 30, which is after tracking start and therefore known. With 120 submissions in that span and 30 so far in December, the tile reads '30, Dec 1 to Dec 31, -90 against the previous period'. Only 8 days of December have elapsed, so the fall is mostly an artifact.

**Evidence:** Lines 1367-1380 use dateTo directly for dayCount. computeCrmAnalyticsTrendBuckets (compute-crm-analytics-report-periods.util.ts:131) clamps the same filter with `dateTo < localToday ? dateTo : localToday`. AnalyticsOverviewTab.getFiguresWithTrackedPrevious only checks tracking start. AnalyticsFiguresRow:160 subtracts the two values with no partial marker. Traced by hand, not run.

**Suggested fix:** Use an elapsed end of min(dateTo, localToday) for current.to and dayCount, so the previous span has the same elapsed length (Nov 23 to Nov 30 here). If the whole range is in the future, keep the count of 0 and return previous as null.

## D14 [major] SERVER (unverified, from overview)
File: `packages/twenty-server/src/modules/analytics/services/crm-analytics-metrics.service.ts` line 981

**Problem:** computeNewApplications returns a known 0 when no form matches the configured name. The figure, categories and trend then show zero applications instead of 'Not available'.

**Scenario:** Someone renames the form in the form builder to 'Internship Application 2027'. FormBuilderEditor.handleNameChange and save write the new crmForm.name, and hasFormSubmissionObject stays true. The facade's `f.name IN ('Internship Application')` now matches nothing, so every later period shows New applications 0, with a change such as -85 against the previous period, while submissions keep arriving. The page gives no warning.

**Evidence:** facade crm-analytics-facade.service.ts:302 matches the exact name. Line 964 of the metrics service returns null only when the object is missing, and toCount(undefined or 0) gives 0. CRM_ANALYTICS_CONFIG.applicationFormNames is a fixed constant. The [facade] review note flagged the same risk, and this traces it through the figure.

**Suggested fix:** Also read whether any crmForm row matches the configured names, for example `(SELECT count(*) FROM form WHERE name IN (...))` in the same statement, and return null with a clear reason when none does, so the tile reads 'Not available' and names the missing form.

## D15 [minor] PAGE (confirmed, from U09-number-tables)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsMovementTable.tsx` line 29

**Problem:** The column is always headed 'Now', but on a frozen report countNow is the stage count when the report was generated, not the current count.

**Scenario:** The March monthly report is generated on Apr 1, when Contacted holds 40 people. A reader opens it in June, when Contacted holds 12. 'Show numbers' still reads Now = 40, with no sign that this is an April 1 figure.

**Evidence:** AnalyticsReportView.tsx:511 passes report.movement to this table, and its note at line 509 covers only the moves. The payload is computed at build time (crm-analytics-report.service.ts:237, 282) and returned as stored (getReport, line 129). Contract line 503 says movement.countNow is 'Current state at generated_at'. Two other report cards say 'as of when this report was made' (AnalyticsReportView.tsx:462, 527), and the PDF note says 'In stage now is when this report was generated' (AnalyticsPdfTrendsSection.tsx:288). On Trends the label is correct because countNow is live, and contract line 901 names the column only for Trends. The report header's 'It stays as generated' softens this but does not correct the label, and that sentence is left out while isProvisional is true, which is the current config (AnalyticsReportView.tsx:404-406).

**Suggested fix:** Add an optional column label prop to AnalyticsMovementTable, defaulting to 'Now', and pass something like 'At report time' from AnalyticsReportView.tsx:511. Prefer this over only extending the note, which sits behind an info icon and leaves the header wrong.

## D16 [minor] PAGE (confirmed, from U09-number-tables)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsSeriesTable.tsx` line 88

**Problem:** The table never marks the current, unfinished period, so a partial count reads as a finished one.

**Scenario:** On Trends, By week, on a Tuesday, New applications by track has a top row of 'Week of Nov 2' with AI = 3, above a previous week of 40. The table reads as a collapse, while the chart tooltip for the same point says it is still in progress.

**Evidence:** Lines 43-47 keep only bucketStart, and getAnalyticsBucketDescription takes only the date and period. Every track and stage line goes through buildTrendSeries with isPartial set for the current bucket (crm-analytics-metrics.service.ts:699, compute-crm-analytics-report-periods.util.ts:161), and a window with no past end date always ends on that bucket. AnalyticsTrendTable.tsx:248 shows 'in progress' for the same case on the same tab. The chart tooltips say so too (AnalyticsLineChart.tsx:288 through buildAnalyticsSeriesBuckets.ts:51, and AnalyticsTrendStageChart.tsx:144). Both callers are affected: AnalyticsTrendTrackCharts.tsx:103 and AnalyticsTrendStageChart.tsx:164. The contract does not settle this.

**Suggested fix:** Carry isPartial with each bucket from columns[0].points and show the same 'in progress' mark after the period label in the cell at line 88, as AnalyticsTrendTable.tsx:248-250 does.

## D17 [minor] PAGE (confirmed, from U09-number-tables)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsStageTotalsTable.tsx` line 72

**Problem:** The numbers table behind 'Where is everyone now?' has no Inactive column, although the chart splits each stage into within limit, past limit and inactive, and the server sends inactiveCount per stage.

**Scenario:** A stage has 503 people: 500 inactive imports and 3 past limit. The chart shows the 500 as a muted Inactive segment. 'Show numbers' shows People 503 and Past limit 3, so a reader can take the other 500 to be on time, and the per-stage inactive number can only be read by hovering the bar.

**Evidence:** The table reads rowKey, label, rowKind, count and pastLimitCount, never inactiveCount. buildStageTotalsChartRows.ts:34-35 and 68-77 draw the Inactive segment, and the server fills the field per stage (crm-analytics-metrics.service.ts:1530). The field is in contract section 7's row type (line 625), and dashboard-redesign.md rule 1 makes this table the chart's numbers. L1 in the handled list changed only the bars and tooltip, so this is not already handled. Contract section 8 line 895 still lists 'label, bar, count, past limit', but it predates the per-stage count and section 8 is not among the definitions of right for this check. If it is treated as binding, this becomes a contract update as well as a code change.

**Suggested fix:** Add an Inactive numeric column after Past limit. Show formatNumber(row.inactiveCount) when the row has a limit or inactiveCount is above 0, otherwise blank, so NESTED, EXIT, Signed, UNMAPPED and NO_STAGE rows stay blank as they do under Past limit. An OTHER row such as Interested keeps its count, so the column adds up to the tile's inactive total.

## D18 [minor] PAGE (confirmed, from U09-number-tables)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsStuckTable.tsx` line 116

**Problem:** When a row is a lower bound, Days in stage says 'at least N', but Days over limit shows the number derived from it as exact.

**Scenario:** A person's move was lost and restored by reconcile, so the entry time is the reconcile time. With a 14 day limit, the row reads Days in stage 'at least 19' and Days over limit '5'. The real overrun could be larger, so the 5 is a floor presented as a measurement.

**Evidence:** readStuckRows computes days_over_limit as days_in_stage - limit_days from the same clock (crm-analytics-metrics.service.ts:1664). is_lower_bound is true when the entry's origin is 'reconcile' (line 477), and reconcile rows carry now() (crm-analytics-sync.service.ts:72). Such a row joins the list once days_in_stage passes the limit, so this reaches the table. Contract line 427 says reconcile rows are excluded from stage clock certainty. Line 112 applies the form to Days in stage only. Contract section 8 line 896 puts 'at least N' on days in stage and lists days over limit with no qualifier, but it does not say the derived number is exact, and section 8 is not among the definitions of right for this check. Because reconcile runs daily, the gap is usually about a day, and larger after a job outage or while the off switch was on.

**Suggested fix:** When row.isLowerBound is true and daysOverLimit is defined, render the same 'at least' form at line 116.

## D19 [minor] PDF (confirmed, from U09-number-tables)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsReportView.tsx` line 510

**Problem:** The movement card's empty check never fires, so a report period with no moves draws an all-zero chart instead of saying no one moved.

**Scenario:** A quiet weekly report has no stage changes. report.movement still holds one row per configured stage, all with entered and left at 0, so its length is above 0. The card shows the legend and stage labels with zeros and no bars. The Trends tab and the PDF both say no one moved in the same situation.

**Evidence:** computeMovement returns CRM_ANALYTICS_CONFIG.stages.map(...) (crm-analytics-metrics.service.ts:1220), and the report stores that array (crm-analytics-report.service.ts:237, 282), so the length is never 0 with the configured stages. AnalyticsDivergingBarChart returns no-data only for zero rows (line 109) and otherwise draws the legend, labels and 0 values (lines 126-180). AnalyticsTrendsTab.tsx:299-301 and 361-362 test for a non-zero entered or left count and say 'No one changed stage in this period.' AnalyticsPdfTrendsSection.tsx:252-255 and 322 do the same in the PDF. The zeros are true counts, so this is a display inconsistency, not a wrong number.

**Suggested fix:** Use isEmpty={!report.movement.some((row) => row.enteredInPeriod > 0 || row.leftInPeriod > 0)} and emptyMessage={t`No one changed stage in this period.`}, matching the Trends tab. As on Trends, AnalyticsChartCard then also hides 'Show numbers' for that card.

## D20 [minor] CHARTS (confirmed, from U07-funnel-heatmap-donut)
File: `packages/twenty-front/src/modules/crm-analytics/charts/AnalyticsDonutChart.tsx` line 156

**Problem:** The fixed 0.03 radian gap removes a very small non-zero slice. The ring draws no visible mark for it and it cannot be hovered, so it has no tooltip, although the legend lists it. No number is wrong or lost: the legend and center total still use the real values.

**Scenario:** Pipeline status with Active 4000, Signed 3, Left 1000. Signed is 0.06% of the ring. The legend shows 'Signed 3 · 0.1%', but the ring has no Signed mark and no tooltip. With 8 of 5008 (0.16%) it is a sliver about 0.2px wide. At the 43,000 people this tool was load-tested with, a slice under about 50 people has no mark, and one under about 140 people is a thin wedge.

**Evidence:** I ran the installed d3-shape pie and arc with this file's values (radii 62 and 84, pad 0.03). Value 3 gives 'M-80.587,-23.701L-59.481,-17.494Z', a zero-area line. StyledSlice sets a fill and no stroke, so nothing paints and the default SVG pointer-events has nothing to hit. Value 8 gives an outer arc from (-80.661,-23.447) to (-80.6,-23.657), 0.22px long. node_modules/d3-shape/src/arc.js:134-139 collapses an edge when the pad leaves it no angle. Computed thresholds for 2 to 4 slices: the inner edge collapses below about 0.33% share and the outer below about 0.12%. buildPipelineStatusSlices.ts:62 keeps any value above 0, and AnalyticsDonutChart.tsx:204-216 lists it in the legend. formatAnalyticsRate gives 0.1% for 3 of 5003. dashboard-redesign.md rule 7 says every mark has a tooltip with exact numbers, and neither it nor the contract covers tiny slices.

**Suggested fix:** Cap the gap per slice on the arc generator: .padAngle((sliceArc) => Math.min(sliceArc.padAngle, (sliceArc.endAngle - sliceArc.startAngle) / 2)). I ran this: value 3 becomes a real wedge about 1px wide at the outer edge, and the 4000 and 1000 paths do not change. If a larger hover target is wanted, give non-zero slices a minimum angle instead. Keep the legend and center total on the real values.

## D21 [minor] CHARTS (confirmed, from U07-funnel-heatmap-donut)
File: `packages/twenty-front/src/modules/crm-analytics/charts/AnalyticsDonutChart.tsx` line 163

**Problem:** role="img" is on the root that also holds the center total and the legend list, so assistive technology treats that text as presentational. The donut's counts and shares are its only text, and screen reader users cannot reach them there.

**Scenario:** A screen reader user reaches Pipeline status on Overview and hears only 'People who are active, signed, left, or not mapped'. The total and the Active, Signed and Left counts are not exposed, the slices are aria-hidden, and the card has no 'Show numbers' table. Per-stage counts exist in the numbers table of 'Where is everyone now?', but the Left total would have to be added up by hand.

**Evidence:** AnalyticsDonutChart.tsx:163 sets role="img" on StyledRoot. StyledCenter (line 197) and StyledLabels (line 204) are inside it, and the svg is aria-hidden at line 169. WAI-ARIA gives the img role presentational children. AnalyticsOverviewCharts.tsx:163-175 passes no numbers prop. AnalyticsLineChart.tsx:356-361 scopes role="img" to the svg and keeps its legend outside. Contract section 8 Conventions has marks aria-hidden beside numeric text, so numeric text is meant to stay exposed, and brief.md:85 asks for a table view on every chart. Found by reading the code; not run with a screen reader.

**Suggested fix:** Move role="img" and aria-label from StyledRoot to the svg, replacing its aria-hidden, as AnalyticsLineChart does. The legend list and center total then stay real text. Moving them to StyledRing, as first suggested, would still hide the total. The existing test using getByRole('img', { name: 'Pipeline status' }) in AnalyticsChartsEmptyData.test.tsx should keep passing.

## D22 [minor] PAGE (confirmed, from U07-funnel-heatmap-donut)
File: `packages/twenty-front/src/modules/crm-analytics/utils/buildAnalyticsCohortHeatmap.ts` line 69

**Problem:** Every cell in a report cohort row shares the same tooltip title, which names only the group. So-far and not-enough-data tooltips therefore never say which step or column they describe. Only the measured path names it, through rateLabel.

**Scenario:** In a monthly report, hover the striped 'Contacted to Before Meeting' cell for November. The tooltip reads 'People who applied in Nov 2026 / So far 12% / Out of 40 people' plus the still-in-progress note. The neighbouring cell and the Overall cell read the same apart from their numbers. A dash cell reads only 'People who applied in Nov 2026 / Not enough data'. Striped cells are common here, because the newest months in a frozen monthly report are still inside their windows.

**Evidence:** Lines 69-72 build one title for the row and lines 84-106 pass it to every cell. In buildAnalyticsRateHeatmapCell.ts, rateLabel is used only at line 53, while the so-far path at lines 67-74 and the unknown path at line 81 show only title. AnalyticsChartTooltip.tsx:89 renders the title as given. AnalyticsReportView.tsx:384 and 562-567 use this builder for the report heatmap. Every other heatmap path names the column: AnalyticsTrendCohortHeatmap.tsx:77 and :92, AnalyticsCategoryCharts.tsx:306, and the default title at AnalyticsHeatmap.tsx:202. The contract does not settle tooltip wording. buildAnalyticsReportCharts.test.ts:136-138 pins the current title, but only as a side effect of checking the row label.

**Suggested fix:** Build each cell's title with its column, as AnalyticsTrendCohortHeatmap does: t`${title}, ${columnLabel}` using getStepColumnLabel for steps, and overallLabel for the Overall column. Also pass rateLabel t`Moved on` and t`Overall conversion` as that file does, or the measured path names the step twice. Update the assertion at buildAnalyticsReportCharts.test.ts:136-138.

## D23 [minor] PAGE (confirmed, from U10-funnel)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsFunnelCharts.tsx` line 101

**Problem:** The outcome chart's note misdescribes the segments. Still in progress is entered minus eligible, so it also holds people who already moved on or left while their window is open. The note defines Moved on as 'reached a later stage within the window' and Left as 'went to an exit stage', and those people meet both definitions but are not counted there.

**Scenario:** In the first 14 days after go-live, 100 people entered New, 60 moved to Contacted on day 3, and 10 went to Rejected by us on day 2. All windows are still open, so eligible = 0, reachedNext = 0, exited = 0 and inWindow = 100. The New bar is 100% Still in progress, and its tooltip prints Moved on 0 (0%) and Left 0 (0%). The funnel on the same tab shows Contacted 60 and '60% so far'. A person already rejected is counted as still in progress. The open-window share of any later stage behaves the same way.

**Evidence:** crm-analytics-metrics.service.ts:388-390 count eligible, reached_next and exited only where window_end <= now(), and line 624 sets inWindow = step.entered - eligible. buildFunnelCharts.ts:158-160 labels that value Still in progress. AnalyticsHorizontalBarChart.tsx:197-207 prints the tooltip counts and shares. Contract section 6 (reachedNext and exited both require Eligible, inWindow = entered - eligible) and its hand-calculated sample (person E, created 5 days ago, Contacted 1 day ago, is too recent) settle the count. dashboard-redesign.md rule 5 settles the label. Neither settles the note text, so only the note is wrong. getLedgerNote at AnalyticsFunnelCharts.tsx:35 and 40 words the same idea correctly. No test pins the note text.

**Suggested fix:** Keep the numbers and the label, and reword the note at line 101, for example: 'Moved on, Stalled and Left count only people whose window has ended. Moved on means they reached a later stage within it. Stalled means they did not move or leave within it. Left means they went to an exit stage within it. Still in progress means their window has not ended yet, so it can include people who have already moved on or left.'

## D24 [minor] PAGE (confirmed, from U10-funnel)
File: `packages/twenty-front/src/modules/crm-analytics/utils/buildFunnelCharts.ts` line 133

**Problem:** buildStageOutcomeRows never sets isSmallSample, so the 100% stacked bar for a tiny stage draws at full strength. It is the only rate chart on the Funnel tab that does this, and the PDF's version of the same chart draws these bars lighter.

**Scenario:** Agreement sent has entered = 3, below the minimum sample of 30: 1 moved on and 2 stalled. On the Funnel tab its bar fills the full width at full strength, split one third and two thirds, exactly like a stage with 200 people. Only the small 3 at the row end and the tooltip, 1 (33%) and 2 (67%), show the size. The bar itself prints no percentages. The PDF of the same data draws the bar lighter.

**Evidence:** buildFunnelCharts.ts:130-165 returns no isSmallSample, unlike buildStageDurationRows (line 201) and buildStepConversionColumns (line 122) in the same file. AnalyticsHorizontalBarChart.tsx:255 applies SMALL_SAMPLE_OPACITY only when row.isSmallSample is true, and lines 224-225 make every percent-mode bar full width. report-pdf/components/AnalyticsPdfFunnelSection.tsx:53 sets isLighter: row.entered < minimumSample for the same chart, and report-pdf/charts/AnalyticsPdfStackedBars.tsx:112 draws it lighter. dashboard-redesign.md rule 6 applies to the whole page and says a rate under the minimum sample draws lighter. The contract's chart table does not exempt this chart. The sibling notes at AnalyticsFunnelCharts.tsx:86 and 111 already tell readers that lighter means a small group. Neither this issue nor the note issue appears in large-review-findings.md.

**Suggested fix:** Destructure minimumSample in buildStageOutcomeRows, as `({ rows, minimumSample }: AnalyticsFunnel)`, since AnalyticsFunnel gets it from AnalyticsBase. Add `isSmallSample: row.entered < minimumSample` to each row, matching the PDF. Existing test fixtures use entered = 120 and minimumSample = 30, so they are unaffected; add one case for a small stage. Add 'Lighter bars are groups of fewer than ${minimumSample} people.' to the note at AnalyticsFunnelCharts.tsx:101, using the value formatted at line 58, in the same edit as the rewording of that note.

## D25 [minor] PAGE (confirmed, from U08-overview)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsOverviewCharts.tsx` line 138

**Problem:** Under a date filter, the Active people and Total contacts sparklines show the whole pipeline, while the tile above shows only people created in the range. Lowered from major: both figures are correct for what they count, and only two small secondary marks are affected.

**Scenario:** Filter Oct 27 to Dec 15 with 43,000 imported people and 12 created in range. The Total contacts tile reads 12, 'People matching these filters'. Hovering its sparkline reads 'Week of Dec 7, Total contacts 43,012'. Active people behaves the same. 'Last 30 days' and 'Last 90 days' trigger it in one click; 'Last 7 days' has too few finished weeks to draw a line.

**Evidence:** Figures use readStageCounts with scopeDateRange (metrics service lines 1391-1395), and buildCurrentStateDateConditions (lines 321-330) adds p.created_at >= $2 and the range. readSnapshotBuckets (lines 2450-2517) uses the dates only to pick buckets and has no created-at or imported condition. AnalyticsOverviewCharts.tsx:86-93 and 137-148 pass those points to buildAnalyticsSparkline with no date check. The contract defines each source separately (line 428 for current-state views, line 492 for the trend line, and redesign line 29) and never addresses a tile and its sparkline counting different people.

**Suggested fix:** When dateFrom or dateTo is set, give activePeople and totalContacts an empty sparkline ({ values: [], marks: [] }). It draws nothing, needs no type change, and StyledSparkline holds the tile's height. Snapshots cannot be narrowed by created date. Leave the New applications and Overall conversion sparklines alone.

## D26 [minor] PAGE (confirmed, from U08-overview)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsOverviewTab.tsx` line 96

**Problem:** When a date filter leaves zero people, the tab returns the plain empty panel before it reaches the imported notice, and it also hides a non-zero New applications figure.

**Scenario:** Soon after launch nearly everyone is imported. Pick 'Last 7 days' when no new Person was created in that week but 5 imported people resubmitted the form. The payload has totalContacts 0, importedExcludedByDate 42,000 and newApplications 5. The page shows only 'No people match these filters', with no sign that 42,000 people were excluded by the date filter. A date filter combined with a small program reaches the same state more easily.

**Evidence:** The return at lines 96-98 comes before the notices at lines 105-111. AnalyticsStatePanel.tsx:52-53 and 103-108 give EMPTY no description, unlike EMPTY_FUNNEL. importedExcludedByDate is computed with no date condition (metrics service lines 1437-1439, 1704-1718), so it can be large when scope is empty. computeNewApplications builds its statement without a scope date range (lines 968-976), so applications can be non-zero with zero people. Contract line 921 shows the notice when importedExcludedByDate > 0 with no exception. Contract line 920 does put zero rows on the Empty state, so keeping the panel follows the contract; the missing notice does not. The existing test uses importedExcludedByDate 0, so it does not pin this.

**Suggested fix:** Add an optional description to the EMPTY panel and pass the same imported sentence when importedExcludedByDate > 0. Optionally mention a non-zero newApplications there too. Replacing the panel with the full tab when applications are non-zero would go beyond contract line 920, so that is a choice for the user.

## D27 [minor] PAGE (confirmed, from U08-overview)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsOverviewCharts.tsx` line 127

**Problem:** After a failed funnel or series query, the Overall conversion value and all sparklines keep showing the previous filter's data.

**Scenario:** Overall conversion shows 12% for all tracks. Click the AI track and the funnel query times out or gets a busy error. The tile still shows 12% with the note 'This figure could not load', next to tiles for AI only. If the series query fails, the line chart card shows its error, but the four tile sparklines keep the old filter's lines with no error sign and no dimming, because isRefetching is false after the failure.

**Evidence:** useCrmAnalyticsQuery.ts:32 returns data ?? previousData, and lines 40-42 keep payload and clear isRefetching once loading ends. In the installed Apollo 4.2, an error on changed variables leaves data undefined (core/ObservableQuery.js:1281-1291) and previousData keeps the old filter's result (react/hooks/useQuery.js:192). AnalyticsOverviewCharts.tsx:127-131 builds overallConversion whenever funnel is defined, line 132 only flags the error, and lines 86-93 and 137-148 use seriesBundle regardless of seriesError. AnalyticsFiguresRow.tsx:152-155 replaces only the note. AnalyticsChartCard.tsx:174 shows the error for the line chart, so only the tiles stay stale. The large-review item L18 covers the refetch period, not this failure path.

**Suggested fix:** In AnalyticsOverviewCharts, pass overallConversion null when funnelError is set, so the tile shows the unknown dash with the existing note. Pass sparklines undefined when seriesError is set; AnalyticsFiguresRow already accepts that.

## D28 [minor] PAGE (confirmed, from U08-overview)
File: `packages/twenty-front/src/modules/crm-analytics/utils/buildStageTotalsChartRows.ts` line 53

**Problem:** A stage with no limit still draws its whole bar as the 'Within limit' segment, so the legend misdescribes it.

**Scenario:** 40 people are Signed, whose limitDays is null. Its bar is drawn in the accent color, and the legend entry for that color reads 'Within limit', while its tooltip reads 'People 40'. The legend shows this whenever another segment or an 'Outside the main steps' row exists. If all limits are removed, every main bar reads 'Within limit' while the tile says 'No limits set'.

**Evidence:** SIGNED is kind MAIN with limitDays null (crm-analytics-config.constant.ts:122-128), so buildStageTotals sends pastLimitCount null (metrics service lines 1527-1529). buildMainRow always adds the withinLimit segment (lines 52-57), while lines 82-96 already use a plain 'People' tooltip row for this case, with the comment 'has nothing to split'. AnalyticsHorizontalBarChart.tsx:170-186 and 288 build the legend from segment keys and labels across all rows. The redesign's 'within limit in the accent' does not address a stage with no limit.

**Suggested fix:** When row.pastLimitCount is null, use a segment with key 'people' and label 'People' instead of withinLimit, in ANALYTICS_CHART_COLOR.accentStrong, the color the donut already uses for Signed.

## D29 [minor] PAGE (confirmed, from U08-overview)
File: `packages/twenty-front/src/modules/crm-analytics/utils/buildStageTotalsChartRows.ts` line 104

**Problem:** The inactive count on an OTHER stage is dropped from the chart, so the tile's inactive total cannot be reconciled with the stage bars.

**Scenario:** 20 imported people are unmoved in New and 100 in Interested. The tile says '120 inactive'. The New bar shows Inactive 20, and the Interested row's tooltip shows only 'People 100'. Summing the Inactive segments gives 20. The 'Show numbers' table has no inactive column either, so the 100 appear nowhere by stage.

**Evidence:** INTERESTED is kind OTHER, and buildActiveConditionSql includes OTHER (metrics service lines 239-244), matching contract lines 469 and 474. stage_clock marks those people inactive (lines 473-482), and readStageClockTotals adds them to inactivePeople and inactiveByStage (lines 1605-1636). buildStageTotals returns the count on the row (line 1530). buildOtherRow (lines 104-119) ignores inactiveCount, while buildMainRow adds an Inactive tooltip row. AnalyticsFiguresRow.tsx:256 shows the full total. L1's fix added the per-stage count for main rows only.

**Suggested fix:** Add an Inactive tooltip row in buildOtherRow when inactiveCount > 0. An Inactive column in AnalyticsStageTotalsTable is optional, because contract line 895 lists only label, bar, count and past limit; if added, it should cover main rows too.

## D30 [minor] SERVER (confirmed, from U08-overview)
File: `packages/twenty-server/src/modules/analytics/facade/crm-analytics-facade.service.ts` line 291

**Problem:** When no form has the configured name, New applications reads as a known 0 instead of unavailable.

**Scenario:** The form is renamed 'Internship Application 2027' in the form builder while the formSubmission object still exists. The relation returns no rows for any date. The tile shows 0 with its date range, the line chart draws a flat 0 including past weeks, and 'This workspace has no application forms' never appears, so a reader concludes applications stopped. The reported negative change cannot happen: the earlier span drops to 0 as well, so the tile reads '0 against the previous period' or shows no change. Weekly and monthly reports built meanwhile freeze the 0.

**Evidence:** Line 291 returns null only when !hasFormSubmissionObject, which getCrmState derives from metadata (lines 237-247), and line 302 filters `f.name IN (...)` on the current name. computeNewApplications (metrics service lines 964-976) and readNewApplicationBuckets with `counts.get(bucketStart) ?? 0` (lines 2348-2354) turn zero rows into counts of 0. computeTrendSeries sets NO_SUBMISSION_OBJECT only on the same flag (line 2255), and AnalyticsFiguresRow.tsx:195-207 and AnalyticsOverviewCharts.tsx:183-186 depend on those. FormBuilderEditor.tsx:202 and 249-250 let users rename a form. FLOLABS.md:172 shows the live form has the configured name today, so this takes a later rename. crm-analytics-report.service.ts:231 uses the same method. Contract lines 292 and 470 define null for absent objects and do not address a missing form row.

**Suggested fix:** Add a facade read that checks a form with a configured name exists. In buildQueryContext, which page reads and report builds share, treat none as hasFormSubmissionObject false, so the tile, line chart, categories and reports reach their existing unavailable states.

## D31 [minor] CHARTS (confirmed, from U05-line-sparkline)
File: `packages/twenty-front/src/modules/crm-analytics/charts/AnalyticsLineChart.tsx` line 234

**Problem:** Hover state outlives the data. hoveredIndex and the tooltip content are rebuilt only when the pointer changes bucket, and nothing clears them when buckets or series change. A response that lands under a still pointer keeps old numbers in the tooltip and can draw the crosshair outside the chart.

**Scenario:** No date filter is needed. On Trends, click 'By month' from 'By week' and rest the pointer on Overall conversion while the query runs. That chart goes from 26 to 12 buckets. Hover index 20 then draws at left + 20/11 * plotWidth, over the neighbouring card. 'By day' to 'By week' does the same on New applications (30 to 12), and a short date range can go from 12 to 3 as reported. One pointer move into another bucket corrects it. When the count stays the same (12 weeks to 12 months, or any filter change), the crosshair stays in range but the tooltip still says 'Week of ...' with the old value, and moving inside that bucket only repositions it. Legend click on a track chart: once the pointer is back on the plot during the refetch, the tooltip keeps five track rows while one line is drawn.

**Evidence:** Checked in the current code. Line 153 holds hoveredIndex. Lines 234-238 call only moveTooltip when nextIndex === hoveredIndex. useAnalyticsChartTooltip.tsx:72-86 stores a content snapshot that only showTooltip replaces. useCrmAnalyticsQuery.ts:32 returns data ?? previousData, and Apollo 4.2 keeps previousData on a variables change (useQuery.js:191-193). AnalyticsChartCard.tsx:32 only dims while refetching, with no pointer-events rule, and keeps its children mounted, so hover works during the refetch. No caller puts a key on the chart. Lines 499-507 draw from hoveredIndex with no bounds check, and line 204 uses it against the new bucket count. StyledSvg has overflow: visible (line 87), and no ancestor clips it before the page body (AnalyticsContent.tsx:50). The bucket counts come from compute-crm-analytics-report-periods.util.ts:26-43. AnalyticsSparkline.tsx:103-107 has the same stale tooltip, but its svg has no overflow: visible, so its crosshair does not show past the svg. Redesign rule 7 asks for exact numbers in every tooltip. L18 and L19 in the handled list cover dimming and bucket labels, not this.

**Suggested fix:** Build the tooltip content during render from hoveredIndex and the current props, keeping only the pointer position in state. House rules prefer this over a useEffect that clears hover when the bucket keys or series change. Ignore a hoveredIndex beyond lastBucketIndex. Apply the same content change to AnalyticsSparkline.

## D32 [minor] CHARTS (confirmed, from U05-line-sparkline)
File: `packages/twenty-front/src/modules/crm-analytics/charts/AnalyticsSparkline.tsx` line 96

**Problem:** The sparkline hit test maps the pointer across the full svg width, but points are drawn inside a 4px edge room, so the hovered index is off near both ends.

**Scenario:** Overall conversion tile, about 200px wide, 25 values (26 weekly buckets minus the partial current week). Points sit at x = 4 + 8i. Pointer at x=5, on the first point: 5/200*24 = 0.6 rounds to 1, so the tooltip and crosshair show the second week at x=12. x=5 to 8 are all wrong this way. At the other end, x=193 and x=195 give 23.16 and 23.4, which round to 23, so hovering the left half of the end dot (x=196, radius 3) shows the week before. The error shrinks to zero at the centre and matters less with fewer points. The 11-value tiles are off by up to about 3.6px on a 19px spacing.

**Evidence:** toSvgX at lines 75-78 uses EDGE_ROOM_IN_PX + (index / (n - 1)) * drawableWidth. handlePointerMove at lines 95-101 uses (clientX - box.left) / box.width on a rect spanning 0 to width (lines 191-196). I recomputed these values and they match the report. OVERALL_CONVERSION_WEEK_BUCKET_COUNT is 26, and buildAnalyticsSparkline.ts:30 drops partial points. AnalyticsFiguresRow.tsx:111 is the only caller and passes these values and marks. AnalyticsLineChart avoids this because its rect matches the plot exactly (lines 525-530). Nothing in the contract covers it.

**Suggested fix:** Correction to the reported fix: base the position on the measured box, not on drawableWidth from state. Use const hitWidth = box.width - EDGE_ROOM_IN_PX * 2 and position = hitWidth > 0 ? (event.clientX - box.left - EDGE_ROOM_IN_PX) / hitWidth : 0, and let the existing clamp handle the edges. The reported form breaks the test at charts/__tests__/AnalyticsLineChart.test.tsx:206-224: it mocks a 100px box while width stays at the 480 fallback in jsdom, so the index becomes 0 instead of 2. The single-value case still gives index 0.

## D33 [minor] PDF (confirmed, from U05-line-sparkline)
File: `packages/twenty-front/src/modules/crm-analytics/report-pdf/charts/AnalyticsPdfLine.tsx` line 182

**Problem:** A lone previous-period value is invisible in the PDF. The path builder emits only a move for a one-point run, and the PDF draws isolated dots for the current and firm series but not the previous one. The web report chart does draw it.

**Scenario:** With the default tracking start 2026-10-27, take the WEEK report for the week of 2027-01-25. NEW_APPLICATIONS has 12 buckets whose previous buckets run from 2026-08-17 to 2026-11-02. Only the last starts on or after tracking start, so previousValues is [null x 11, v]. hasPreviousLine is true, so the legend shows a dashed 'The 12 weeks before' and the note says 'Dashed is the window before', but buildAnalyticsLinePath returns 'Mx,y' and nothing is stroked. v still raises the Y scale. The report is frozen, so that PDF stays this way. Each trend metric hits this once (one weekly report at about 12 weeks, one monthly at about 12 months). Correction: the reported '[3, null, 5, null, ...] from missing snapshots' cannot happen here, because the PDF draws only NEW_APPLICATIONS, OVERALL_CONVERSION and DROP_OFF, none of them snapshot metrics. Alternating gaps can still occur in the two rate lines, from weeks with no applicants.

**Evidence:** Lines 182-191 render only Path d={buildAnalyticsLinePath(previousPoints)}, with no line cap. A PDF single-point open subpath paints nothing. Lines 211-230 call getAnalyticsIsolatedPoints on currentPoints and firmPoints only. AnalyticsPdfTrendsSection.tsx:92 passes previousValue through. Lines 174-176, 185-187 and 201-211 there add the legend key and note. crm-analytics-report.service.ts:44-50 and computeReportSeries use dateFrom null, so the default 12 buckets apply. crm-analytics-metrics.service.ts:2301-2305 nulls previous values before the first full tracked date, and lines 720-722 return null for a rate bucket with no group. AnalyticsLineChart.tsx:407-417 draws these dots for previousValues on the web, including the report view (AnalyticsReportView.tsx:590). buildAnalyticsLinePath.ts:77 states a lone value needs a dot to be seen at all. The contract does not cover it.

**Suggested fix:** Add getAnalyticsIsolatedPoints(previousPoints) as neutral Circle marks with fill ANALYTICS_PDF_COLOR.neutral and r ISOLATED_DOT_RADIUS, drawn right after the previous Path.

## D34 [minor] PAGE (confirmed, from U05-line-sparkline)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsOverviewCharts.tsx` line 178

**Problem:** The Overview 'New applications over time' chart widens a date filter to whole weeks with no note, while the New applications tile above it uses the exact dates. The two disagree with no explanation. Trends has a note for this, worded 'on this tab', which implies other tabs do not widen.

**Scenario:** Filter Nov 4 to Nov 5, 2026, a Wednesday and Thursday. The tile reads 3 for 'Nov 4 to Nov 5'. The chart has one bucket, week of Nov 2, labelled 20, counting Monday to Sunday (while that week is still running it also draws lighter as 'so far'). Presets trigger it too: 'Last 7 days' on a Wednesday spans two weeks, and the first bucket counts days before the range, so the chart adds up to more than the tile. The axis label and tooltip do say the week, and the note says 'by the week they were submitted', but nothing says the chosen dates were widened.

**Evidence:** Line 79 sends the filter with period WEEK. compute-crm-analytics-report-periods.util.ts:116-139 widens to period starts on purpose, and the service specs rely on whole buckets. crm-analytics-metrics.service.ts:2284-2287 sets the range from firstBucket.previousBucketStart to the last bucket's last day. readNewApplicationBuckets (lines 2425-2436) filters only on that range, since createBaseStatement gets no date range there. resolveNewApplicationRanges (lines 1359-1382) uses the exact dates for the tile, shown at AnalyticsFiguresRow.tsx:198. getDateWideningNote exists only in AnalyticsTrendsTab.tsx:108 and is rendered only in the Trends toolbar. Contract section 6 (lines 470 and 492) sets the tile's basis and says the trend window is the date filter. It does not settle whether the widening is disclosed, and neither the redesign doc nor 'Decisions from testing' does either.

**Suggested fix:** Keep the whole-week buckets, which are deliberate, and disclose them. When dateFrom or dateTo is set, say 'Dates widen to whole weeks here.' on this card, reusing the Trends wording. AnalyticsChartCard puts note behind the info icon, so prefer visible text (AnalyticsNote in the card body), as Trends does. The minimum is adding the sentence to the note at line 178. The tile sparklines share this series, so their tooltips show the same wider weeks.

## D35 [minor] PAGE (confirmed, from U01-shell-data)
File: `packages/twenty-front/src/modules/crm-analytics/hooks/useCrmAnalyticsQuery.ts` line 32

**Problem:** After a read fails on changed variables, the hook returns the previous filter's payload together with the error. The Overview's Overall conversion figure and its four sparklines use that payload without checking the error, so they show old-filter values beside new-filter figures.

**Scenario:** On Overview with no filter, Overall conversion reads 25%. Click a track, which sends 5 reads: overview, funnel, series and two categories. Overview succeeds, but funnel and series fail, for example with CRM_ANALYTICS_BUSY (2 reads at once, waiters give up after 10 s) or the 8 s statement limit. Total contacts now shows the track. Overall conversion still prints the whole pipeline's 25% at full weight, with 'This figure could not load' under it and no retry control. All four sparklines keep the unfiltered line and old tooltip values, with no note and no dimming. This lasts until the next filter change, or for the series until a retry on the New applications chart.

**Evidence:** Checked with a scratch script against the installed Apollo 4.2.0, using the hook's own expression and no product code (C:\Users\Ahsan\AppData\Local\Temp\claude\fc8394a8824fa13e\80ecf43a-baa7-43f2-95f1-efcb443943ff\scratchpad\apollo-previous-data-check.cjs). After a filter change and a GraphQL error, data is undefined, previousData is the old result, error is set and loading is false, so the payload is old while isFirstLoad and isRefetching are false. Code path: ObservableQuery.js:1300-1302 gives the new variables an empty loading result, :1282-1290 spreads it on error, and useQuery.js:191-193 and :137 keep previousData. AnalyticsOverviewCharts.tsx:127-131 builds overallConversion whenever funnel is defined and :86-93 builds sparklines from seriesBundle, with no error check. AnalyticsFiguresRow.tsx:153-155 swaps only the note. Other callers check error first, or AnalyticsChartCard renders its error before the body. L18 only added dimming while reads run, and after a failure loading is false, so L18 does not cover this. The contract does not settle it: section 8's Error state asks for an error with retry, 'numbers kept' applies only to sync.isStale, and redesign rule 6 says honest numbers stay. Severity lowered from major to minor: it needs a failed read, the contract's timing note puts Overview and the conversion trend under a second at 43,000 people, the one large number carries the error note, and L18, the same picture while loading, was rated minor. U08-overview reports the same defect at AnalyticsFiguresRow.tsx:152.

**Suggested fix:** At line 32 use `const currentData = data ?? (isDefined(error) ? undefined : previousData);`, importing isDefined from twenty-shared/utils. The scratch script confirms a failed refetch on the same variables keeps its data, so AnalyticsContent's retained meta still works, and that this expression returns nothing after the failed filter change. Callers stay safe: Overview, Funnel, Categories and Reports check error first, and the Trends cards go through AnalyticsChartCard. The figure then shows the unknown mark plus the error note, and the sparklines go empty. During a retry the error clears, so the old payload shows dimmed, as on any filter change. Add a test to AnalyticsOverviewTab.test.tsx for a filter change where funnel and series fail.

## D36 [minor] PAGE (confirmed, from U01-shell-data)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsSyncLine.tsx` line 37

**Problem:** The relative sync time is computed only at render and nothing re-renders it while the page is idle, so the header keeps stating an age that is no longer true. The stale banner and warning color cannot appear either, because isStale comes from the last meta response.

**Scenario:** Open Analytics at 09:00: the header reads 'Last updated 3 minutes ago.' with no banner. Leave the tab open and come back at 15:00, or after the worker has stopped. It still reads 'Last updated 3 minutes ago.' with no stale warning, above the 09:00 numbers, until the first filter or tab click. Filter clicks within 5 minutes of the last meta read also leave the text unchanged.

**Evidence:** AnalyticsSyncLine.tsx:37 calls beautifyPastDateRelativeToNow at render, and a grep of crm-analytics finds no setInterval, focus or visibility listener, or pollInterval. AnalyticsPage.tsx holds no state beyond useCrmAnalyticsMeta; filter state and the active tab are read in AnalyticsContent. refreshOldMeta (AnalyticsContent.tsx:107-111) runs only from handleFilterChange and onChangeTab, and only when meta is over 5 minutes old, though its comment says a page left open should not keep showing old values. The server fixes isStale at read time (crm-analytics-meta.service.ts:193-196). P11 in review-findings-fix-pass.md led to that click refresh, which does not cover an idle page. Contract: 'No polling' in section 8 and 'polling' under Later in section 1 settle that the numbers do not refresh themselves, so an idle page with old numbers is accepted. They do not cover a text that misstates its own age: needs.md R26 wants the last successful sync shown, R19 wants a stopped job to show a stale warning, and a focus refresh is not polling.

**Suggested fix:** Add a small effect component rendered after AnalyticsContent's guards, like RecordSharingRefreshEffect.tsx, that calls refreshOldMeta on window focus and on visibilitychange when the document is visible. It must sit after the guards because refreshOldMeta is defined below the early returns. Both useCrmAnalyticsMeta observers read the same cache entry, so the refetch re-renders AnalyticsPage, which recomputes the text and banner. Keep the 5 minute guard, so the text is at most about 5 minutes behind after a return. An absolute time would also stay true, but section 8 asks for relative text, so that is the user's call.

## D37 [minor] PAGE (confirmed, from U01-shell-data)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsOverviewTab.tsx` line 96

**Problem:** The EMPTY return comes before the notices, so the imported-people notice the contract requires for a date filter disappears when the filter leaves nobody. The page says no people match although imported people were excluded by the date rule.

**Scenario:** The CRM has 5,000 imported people and tracking started 2026-10-27. Choose Custom dates 2026-10-01 to 2026-10-20, which the filter bar and server both accept. Every person fails p.created_at >= trackingStart, so totalContacts is 0 while importedExcludedByDate is 5000. The page shows 'No people match these filters' and never says '5,000 imported people have no known application date and are not shown.' A reader concludes nobody applied in that period, though the tool has no dates for them. The same happens with 'Last 7 days' in any week with no new contacts.

**Evidence:** crm-analytics-metrics.service.ts:321-330 adds p.created_at >= $2 to the date-scoped counts. computeOverview:1437 with countImportedPeople:1704-1718 counts imported people with no date scope, so the payload holds the number. AnalyticsOverviewTab.tsx:96-98 returns before the notices at :105-111. Contract section 8 States lists 'Date filter on | importedExcludedByDate > 0' with that sentence, section 6 says the count is reported, and nothing makes Empty override it. AnalyticsFilterBar.tsx:272-282 checks only the year and order of the dates, and parseCrmAnalyticsFilter accepts them. EMPTY_FUNNEL explains imported people in AnalyticsStatePanel.tsx:104-108, but EMPTY does not. AnalyticsOverviewTab.test.tsx covers the notice and the empty panel only separately. U08-overview reports the same line, adding that the early return also hides a non-zero New applications figure.

**Suggested fix:** Move the formatNumber line above the check, give AnalyticsStatePanel an optional description rendered in EmptyState.Description, and pass the same sentence when importedExcludedByDate > 0. Keep the Reset filters button. Add a test with totalContacts 0 and importedExcludedByDate above 0.

## D38 [minor] PDF (confirmed, from U02-number-rules)
File: `packages/twenty-front/src/modules/crm-analytics/utils/buildAnalyticsReportAnswers.ts` line 73

**Problem:** The Reports tab's Overall conversion answer card never sets isLighter, so a small-sample or so-far rate draws at full strength. It is the same defect as L7, in a builder the L7 fix did not touch.

**Scenario:** A frozen report has funnel.overall eligible 12, rate 0.25, isUnderMinimum true. The card shows a full-strength '25%'. A report from the first 90 days after tracking start has eligible 0 and rate null; with soFarRate 0.1 it shows a full-strength '10% so far'. Both are the normal state of early reports. The detail line under the value still says 'Small sample, of 12 people' or 'Still in progress', so the words are honest and only the weight of the value is wrong, which is why this stays minor.

**Evidence:** Lines 73-83 take only `.label` from describeAnalyticsRate and return { key, label, value, detail }. AnalyticsReportView.tsx:371 and :422 pass these cards straight to AnalyticsAnswerCards, and AnalyticsAnswerCards.tsx:72 renders isLighter={card.isLighter === true}, so a missing flag means font.color.primary. The server sets isUnderMinimum and soFarRate on the report's funnel (crm-analytics-metrics.service.ts:1047-1050, reached through crm-analytics-report.service.ts:277). Commit 405c185e changed AnalyticsAnswerCards.tsx and buildFunnelAnswerCards.ts for L7 but not this file, and the file is unchanged in the working tree. The same values draw lighter at buildFunnelAnswerCards.ts:108-111, AnalyticsFiguresRow.tsx:226 and buildAnalyticsPdfKeyFigures.ts:91 and :104. dashboard-redesign.md rule 6 and the AnalyticsRateCell rule in contract section 8 both require it.

**Suggested fix:** Keep the describeAnalyticsRate result in a variable and add isLighter: rate.isSmallSample || rate.isInProgress to the overall-conversion card. A null value then gets isLighter false, the same as buildOverallConversionAnswer.

## D39 [minor] PAGE (confirmed, from U02-number-rules)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsTrendTable.tsx` line 132

**Problem:** A rate change is rounded to whole points, while formatAnalyticsRate shows one decimal within 1% of either end, so two visibly different rates can sit beside '0 points'. summarizeAnalyticsTrendSeries.ts:104 rounds the same way.

**Scenario:** Trends tab, Overall conversion, By week or By month. A bucket with 1 of 150 (0.7%) compared with 1 of 400 (0.3%) has change 0.00417, and Math.round(0.417) = 0, so the row reads 0.7%, 0.3%, '0 points', 150. 2 of 450 (0.4%) against 3 of 380 (0.8%) does the same. 0 of 200 (0%) against 1 of 200 (0.5%) also prints '0 points' because Math.round(-0.5) is -0, while the opposite rise prints '+1 points'. The summary line above the chart says '0 points against the week before' in the same way for neighbouring buckets. Both samples pass the minimum of 30. A non-zero rate in the one-decimal band needs a bucket of more than 100 people, so this is a production-volume case; dashboard-redesign.md sizes the demo data at about 150 applications over 26 weeks, so it is unlikely to show there. The Change column also needs a finished bucket one whole window back (26 weeks by default for weekly Overall conversion), so the summary line shows it first. Correction to the original scenario: 'DROP_OFF for a late stage' is not reachable on the page. DROP_OFF is only requested with stageKey null (AnalyticsTrendsTab.tsx:42-44), which the server resolves to the entry stage (crm-analytics-metrics.service.ts:2208-2209), so drop-off is affected only if entry-stage drop-off is above 99% or below 1%.

**Evidence:** AnalyticsTrendTable.tsx:130-136 calls formatAnalyticsSignedNumber(Math.round(change * 100), formatNumber), and the only guards before it for a rate are the null checks and the sample-size check at lines 121-126. previousSize reaches the table for rates (crm-analytics-metrics.service.ts:698). AnalyticsTrendValue (lines 165-172) prints both rates through AnalyticsRateCell and formatAnalyticsRate. formatAnalyticsRate.ts:19-25 keeps one decimal under 1% and over 99%, and its comment on line 8 says this keeps a rate from reading as none or all. formatAnalyticsSignedNumber.ts:6 prints 0 and -0 as '0'. I ran these formulas in node and got the outputs above. Contract sections 6 to 8, 'Decisions from testing' and dashboard-redesign.md set no precision for a rate change. The test at AnalyticsTrendTable.test.tsx:233 only covers the sign for 30% against 30%. Earlier item P15 ('-0 points') fixed only the sign, and large-review-findings.md does not list this bug.

**Suggested fix:** Subtract the rates as displayed instead of rounding the raw difference. Add a helper beside formatAnalyticsRate that returns the displayed percent, have formatAnalyticsRate use it, and compute points = Math.round((displayed(value) - displayed(previous)) * 10) / 10 in both getChange and formatDelta. Pass decimals: 1 only when points is not whole, so '+10 points' stays as it is; the mock formatNumber in summarizeAnalyticsTrendSeries.test.ts uses toFixed and would otherwise print '+5.0'. This also closes the same mismatch in the whole-percent range, which the originally suggested band-only fix leaves open: 50.6% against 50.4% reads 51%, 50%, '0 points', and 50.4% against 49.6% reads 50%, 50%, '+1 points'. Those same two lines also print '+1 points' with no plural, so use plural there as formatDelta already does for days.

## D40 [minor] SERVER (confirmed, from U03-filters)
File: `packages/twenty-server/src/modules/analytics/services/crm-analytics-metrics.service.ts` line 751

**Problem:** A raw position under the Unmapped track counts as two snapshot dimensions, so filtering to it makes stored daily-count trends unavailable. resolveSnapshotDimension only treats a program as implying its track when the position is in the config map. The click filter itself is correct, so the defect is on the server, not at getAnalyticsCategoryClickFilter.ts:24.

**Scenario:** On Tracks & sources, click the Unmapped row, then the raw position FOO. The filter becomes { trackKey: 'UNMAPPED', programKey: 'FOO' }. On Trends, Total contacts, Active people and People in each stage over time show 'Stored daily counts use one category at a time. Keep only one of Track, Program or Source.' The Overview sparklines for Active people and Total contacts go empty. The user chose one category. A mapped program in the same flow works, and FOO alone works because snapshots store position FOO. Picking FOO in the Program select after clicking Unmapped reaches the same state.

**Evidence:** getAnalyticsCategoryClickFilter.ts:24 sets trackKey to row.parentKey and programKey to row.key. crm-analytics-metrics.service.ts:749-751 compares TRACK_KEY_BY_POSITION.get(programKey) === trackKey, which is undefined !== 'UNMAPPED', so dimensions has two entries, line 765 returns null, and line 2266 returns SNAPSHOT_FILTER_COMBINATION. buildCategoryMemberCtes gives raw positions parent UNMAPPED (lines 506, 528). crm-analytics-snapshot.service.ts:46 stores a 'position' row for raw values, and contract line 373 says position uses the raw value. crm-analytics-meta.service.ts:264-270 lists unmapped options under the same track key. The spec at crm-analytics-metrics.service.spec.ts:1774-1777 covers only a mapped program. The contract's one-dimension rule does not settle this, because FOO already implies Unmapped.

**Suggested fix:** In resolveSnapshotDimension, compare (TRACK_KEY_BY_POSITION.get(filter.programKey) ?? UNMAPPED_CATEGORY_KEY) === filter.trackKey, the same fallback resolveSeriesTrackKeys uses at line 2126. Add a spec case for { trackKey: 'UNMAPPED', programKey: raw } expecting dimension position.

## D41 [minor] PAGE (confirmed, from U03-filters)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsOverviewCharts.tsx` line 110

**Problem:** A track click on the Overview 'People by track' bars always clears the program, even when the program belongs to that track. With a program set the filter widens instead of narrowing, and this differs from the Track select. This applies to Overview only: the Trends half of the original finding cannot happen and is listed under refuted.

**Scenario:** Pick Program = Machine Learning with Track on All. 'People by track' shows only AI, with 12 people, the Machine Learning holders. Click AI, as the note 'Click a track to filter the page' invites. The result is { trackKey: AI, programKey: null }, so the Program chip disappears and every figure jumps to the whole track, for example 200. Choosing AI in the Track select from the same state keeps the program and the 12.

**Evidence:** AnalyticsOverviewCharts.tsx:106-111 sets programKey: null unconditionally. AnalyticsFilterBar.tsx:309-320 handleTrackChange keeps a program listed under the new track. buildCategoryMemberCtes (crm-analytics-metrics.service.ts:513-517) limits rows to the chosen program, and buildCategoryBarRows.ts:47-49 keeps only top-level rows, so the program's own track is the only named bar to click. AnalyticsOverviewTab.test.tsx:420-434 tests only the default filter with no program. A unit test at utils/__tests__/getAnalyticsCategoryChartRows.test.ts:86-93 does expect the Categories click filter to clear the program, using a different program, but that path is not reachable there because a program filter shows program rows. Neither the contract nor redesign rule 4 says what happens to the program.

**Suggested fix:** In the Overview handleTrackSelect, when selecting a track, keep filter.programKey if meta.programs lists it under that track, as handleTrackChange does. A shared helper can serve both. Clearing the track can still clear the program. Leave getAnalyticsCategoryClickFilter as it is, because its test expects the clear and it has no access to meta.programs.

## D42 [minor] PAGE (confirmed, from U03-filters)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsFilterBar.tsx` line 293

**Problem:** Choosing 'Custom dates' when it is already selected replaces the user's range with tracking start to today.

**Scenario:** The Dates control reads Custom with 2026-11-01 to 2026-11-05. Open the select and click 'Custom dates' again, or open it and press Enter, since the selected option takes focus on open. The filter becomes 2026-10-27 to today, all tabs refetch, and the typed range is lost.

**Evidence:** Select.tsx:250-253 calls onChange for every option click. DropdownOptionItem.tsx:81-93 calls onSelect with no same-value guard. getSelectDropdownInitialFocus.ts:4-6 focuses the pressed option on open. handleDatePresetChange at AnalyticsFilterBar.tsx:293-298 always overwrites dateFrom and dateTo for CUSTOM.

**Suggested fix:** Return early from handleDatePresetChange when preset === selectedDatePreset.

## D43 [minor] PAGE (confirmed, from U03-filters)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsFilterBar.tsx` line 272

**Problem:** The date check has no upper bound, but the server now rejects dates after 2100-12-31. A far-future To date commits and turns the filtered tabs into error panels.

**Scenario:** In Custom, type To = 2206-11-08 as a typo for 2026. isCompleteDateInReach passes because the year is at least the tracking year, and dateFrom is earlier, so the value commits on blur or after 600 ms. parseCrmAnalyticsLocalDate throws 'Invalid analytics dateTo', so Overview, Funnel, Tracks & sources and Trends all show 'This view could not load'. Retry cannot help until the user finds and fixes the date. The panel's line 'The other tabs may still work' is also untrue here, except for Reports, which sends no filter.

**Evidence:** AnalyticsFilterBar.tsx:272-274 only checks the 4-digit pattern and year >= tracking year. isToDateAllowed at 280-282 adds only the dateFrom check. To's input at lines 351-357 has no max. parse-crm-analytics-filter.util.ts:27 and 121-127 reject values above MAXIMUM_LOCAL_DATE, and the resolver parses the filter on all five filtered queries (crm-analytics.resolver.ts:72, 88, 105, 126, 148). The filter bar stays on screen, so the user can correct the date. The L23 fix added this server limit without a front-end match.

**Suggested fix:** Add the same maximum, '2100-12-31', to isCompleteDateInReach, so the date is held back like the other refused dates, and pass it as the To input's latestDate.

## D44 [minor] PAGE (confirmed, from U03-filters)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsFilterBar.tsx` line 344

**Problem:** The From input has no min, so the calendar offers years the filter refuses. The refused date stays displayed in the input while the page keeps the old date.

**Scenario:** Tracking started in 2026, and the range is 2026-10-27 to 2026-11-08. Use the From calendar to pick 2025-12-15. Focus stays in the input, as the comment at lines 172-173 says. After 600 ms isDateAllowed is false, so nothing commits and draftDate is not cleared. The input reads 2025-12-15, while the chip and every number still use Oct 27. It snaps back only on blur or Enter, with no message.

**Evidence:** Lines 344-350 pass only latestDate to the From input, so min is undefined. Line 209 shows draftDate ?? appliedDate. commitAfterIdle at lines 184-189 clears the draft only when it commits. isCompleteDateInReach at 272-274 refuses any year before the tracking year. The test 'holds back a year before tracking started and a reversed range' (AnalyticsFilterBar.test.tsx:525-534) checks only that onChange is not called.

**Suggested fix:** Pass earliestDate as January 1 of the tracking start year to the From input, so the calendar cannot offer a refused year. The To input is already limited by dateFrom in Custom.

## D45 [minor] PAGE (confirmed, from U03-filters)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsFilterBar.tsx` line 276

**Problem:** Moving a range forward in natural field order drops the new From date with no message, leaving a range the user did not ask for.

**Scenario:** The range is 2026-11-01 to 2026-11-05 and the user wants 2026-11-10 to 2026-11-20. Type From = 2026-11-10 and press Tab: it is later than To, so it is refused and snaps back to 11-01 with no message. Type To = 2026-11-20 and press Tab: it commits. The page now shows Nov 1 to Nov 20, 20 days instead of the 11 asked for. Only the reverted input and the chip show this. Changing To first avoids it.

**Evidence:** isFromDateAllowed at lines 276-278 rejects date > filter.dateTo. commitDraft at lines 191-203 then sets draftDate to null without feedback. The test 'keeps the last applied date for a reversed range' (AnalyticsFilterBar.test.tsx:411-426) makes refusing deliberate, but it covers both entries being refused, not the partly applied result. Contract section 8 and the redesign say nothing about this.

**Suggested fix:** When a committed From passes To, move To to the same date (and the reverse), so the bar never holds a reversed range and the entry is kept. Update the reversed-range test to match. Alternatively, keep refusing and show an inline message when a date is refused.

## D46 [minor] PAGE (confirmed, from U03-filters)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsCategoryCharts.tsx` line 78

**Problem:** Chart rows are chosen from the new filter and the previous response together. Clicking a track therefore briefly draws the programs of every track.

**Scenario:** With no filter, the payload holds all tracks and every program that has people. Click the AI track. The filter updates at once, while useCrmAnalyticsQuery still returns previousData. getAnalyticsCategoryChartRows sees trackKey set and returns every row with a parentKey, so the answer cards, 'How many people in each?', the rate chart, the heatmap and the scatter switch to all programs from all tracks, dimmed, until the response arrives. That can take up to the 8 second statement limit, plus any wait for a read slot. The people note also switches to the program overlap count from the old payload. A click during this time can select a program from a different track.

**Evidence:** AnalyticsCategoriesTab.tsx:114-124 passes the current filter with retained categories. useCrmAnalyticsQuery.ts:32 returns data ?? previousData, and Apollo 4.2.0's useQuery keeps previousData (react/hooks/useQuery.js:137-138, 188-193). crm-analytics-metrics.service.ts:1155-1163 returns both levels in one rows array. getAnalyticsCategoryChartRows.ts:17-24 has no check on which filter produced the rows, and AnalyticsCategories has no echo of its filter. AnalyticsCategoryCharts.tsx:266-269 and 343-349 use the same chartRows for the note and the answers. This is a different path from L18 and L19.

**Suggested fix:** Choose the level from the filter the payload was requested with. For example, have the server echo trackKey and programKey in AnalyticsCategories, or keep the last filter whose response arrived and pass that to getAnalyticsCategoryChartRows.

## D47 [minor] PAGE (confirmed, from U03-filters)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsFilterBar.tsx` line 296

**Problem:** Custom dates starts at the tracking start date without checking it against today. A tracking start in the future sends a reversed range, which the server rejects.

**Scenario:** CRM_ANALYTICS_TRACKING_START_AT is set to a future go-live date, for example 2026-12-01, and today is 2026-11-08. Picking 'Custom dates' sends dateFrom 2026-12-01 and dateTo 2026-11-08. parseCrmAnalyticsFilter throws 'Invalid analytics date range' and the tabs show error panels until the user switches back to a preset or removes the date chip. The default start date is in the past and does not trigger this, so it needs a future override.

**Evidence:** Lines 294-298 set both dates with no guard. Unlike isFromDateAllowed, this path has no ordering check. parse-crm-analytics-filter.util.ts:144 rejects dateFrom > dateTo. crm-analytics-settings.service.ts:34-53 accepts any parseable override, including a future one, and crm-analytics-meta.service.ts:97-108 passes it to the page with no guard. The page state stays READY once a sync has run.

**Suggested fix:** Use the earlier of the tracking start date and today as dateFrom.

## D48 [minor] PDF (confirmed, from U17-pdf-first-page)
File: `packages/twenty-front/src/modules/crm-analytics/report-pdf/utils/buildAnalyticsPdfAnswers.ts` line 184

**Problem:** Page 1 asks 'Which step has the lowest conversion?' and answers from funnel.lowestStepStageKey, which skips the first step whenever a later step qualifies. The PDF never says so, while the Funnel tab does. Which step gets named is correct under the contract. What is wrong is the unqualified question and the missing disclosure in the PDF. Severity lowered from major: every printed number is right, and contract lines 904 and 930 already use the unqualified label 'Lowest step' for this same key.

**Scenario:** A report has New with eligible 500 and stepRate 0.20, and Contacted with eligible 100 and stepRate 0.62, the lowest of the later steps. Page 1 prints 'Contacted to Before meeting: 62% moved on, of 100 people.' under that question. On the funnel page, New shows 20%, Contacted's column is colored under the note 'The lowest step is in color', and nothing explains why. For the same data, the Funnel tab's Biggest drop card says New to Contacted, 80%. The local checks will not show this: the demo has NEW at 0.93 against CONTACTED at 0.85 (generate.mjs:49-50), and the PDF fixture has 82% against 62%. research/presentation.md:11 says the first step usually loses most, so real reports may hit this often. No production data settles that.

**Evidence:** Traced by reading the code; no PDF was rendered. crm-analytics-metrics.service.ts:634-646 drops rows[0] when laterRows is non-empty, and the spec 'skips the first step when another qualifies' pins this. buildAnalyticsPdfAnswers.ts:55-59 uses the key directly. The contract settles the selection (line 488, 'excluding the first step only if another qualifies') and the label (line 904 'Lowest step', line 930 'Lowest step: {a} to {b}, {x}%.'), which is more than the report allowed for. It does not cover this PDF question or a disclosure. Decisions from testing is silent on it. The only user-visible disclosure in crm-analytics is AnalyticsFunnelCharts.tsx:70, 'The lowest step leaves out the first step when a later step has enough people.' A grep finds no such text in report-pdf. AnalyticsPdfFunnelSection.tsx:164 and AnalyticsPdfFunnel.tsx:189 use the label with no qualifier, and AnalyticsReportView.tsx:426 and 441 also omit it.

**Suggested fix:** Keep the key and do not compute a separate true lowest on page 1. That would break contract line 488 and make page 1 contradict the same PDF's 'Lowest step' marker (AnalyticsPdfFunnel.tsx:189) and takeaway (buildFunnelTakeaway.ts:69, printed via AnalyticsPdfFunnelSection.tsx:172). The suggested 'Which step after the first has the lowest conversion?' is also wrong as a fixed string, because the server names the first step when it alone qualifies (spec 'names the first step when it alone qualifies'). Instead, in buildLowestStepAnswer, when lowestIndex > 0 and the first row has a lower stepRate, add a clause that names it, for example 'The first step, New to Contacted, is left out: 20%.' Add the Funnel tab's sentence to conversionNote at AnalyticsPdfFunnelSection.tsx:164, and to the report view notes at AnalyticsReportView.tsx:426 and 441. Add a test for a first step lower than the named step. The tests at buildAnalyticsPdfAnswers.test.ts:22-24 and 33-39 pin the current text, and :22-24 still passes if the clause is conditional, since the fixture's first step is higher.

## D49 [minor] PDF (confirmed, from U17-pdf-first-page)
File: `packages/twenty-front/src/modules/crm-analytics/report-pdf/utils/buildAnalyticsPdfAnswers.ts` line 88

**Problem:** When no stage has at least minimumSample completed stays, the slowest-stage answer falls back to all timed rows and names a winner from tiny samples. The Funnel tab refuses to answer on the same rows. Severity lowered from major: the sentence is true and prints its count, so the reader can discount it. It is also limited to low-volume and early reports, though those stay frozen and downloadable.

**Scenario:** minimumSample is 30. Contacted has medianDays 9 from completedStays 1, and New has medianDays 3 from completedStays 12. firmRows is empty, so timedRows is used and page 1 prints 'Contacted: a median of 9 days, from 1 completed stay.' with no small-group wording. buildSlowestStageCard prints 'Not enough finished stays yet.' for the same rows. The report's example of 40 days cannot occur in the first report after the 2026-10-27 tracking start, but a stay that long is possible once the data is about six weeks old if volume is still low.

**Evidence:** Traced by reading the code; no PDF was rendered. Line 88 is `(firmRows.length > 0 ? firmRows : timedRows)`. buildFunnelAnswerCards.ts:74-82 filters on completedStays >= minimumSample with no fallback, lines 84-91 return the not-enough message, and buildFunnelCharts.test.ts:133 is titled 'never names a drop or a slowest stage from too few people'. On the same page, the other comparative answers refuse small groups: the lowest step needs eligible >= minimumSample on the server, and the track answer prints 'No track has enough people to compare conversion yet.' The overall answer adds 'still a small group' in words (line 37). The contract and dashboard-redesign.md do not define a slowest stage beyond naming the card. Line 931 applies the same 'only rows at or above minimum qualify' rule to the Categories takeaway. review-plan-page.json's U17 focus also says slowest stage must skip too-small rows. buildAnalyticsPdfAnswers.test.ts has no case for the fallback, and no other test in the module depends on it. Reachable: report.minimumSample is always set (crm-analytics-report.service.ts:266), and completed stays per stage come from the cohort up to the period end (crm-analytics-metrics.service.ts:1010-1028).

**Suggested fix:** Remove the fallback and pick only from firmRows. Keep 'No one has completed a stage yet.' for no timed rows. When timed rows exist but none is firm, print a separate line such as 'Not enough completed stays to say yet.' Add a test for that case.

## D50 [minor] PDF (confirmed, from U17-pdf-first-page)
File: `packages/twenty-front/src/modules/crm-analytics/report-pdf/utils/buildAnalyticsPdfAnswers.ts` line 134

**Problem:** bestRow accepts a measured 0% rate, so the answer can say a track 'converts best' when no qualifying track has converted anyone. On a tie the first row wins, and that row is the largest.

**Scenario:** AI has 168 people, overallEligible 40 and overallRate 0. Business has overallEligible 31 and overallRate 0. Other tracks are under 30. pickHighestRow keeps AI, the same-key branch at line 150 runs, and page 1 prints 'AI is largest, with 168 people, and converts best: 0% of 40 people.' The Tracks section takeaway then prints 'AI is largest; AI converts best, 0%.' This can happen from about 90 days after tracking start, when groups first pass 30 eligible and signings are rare. It would also happen across every track if the guessed SIGNED raw values turn out wrong. A lone qualifying track at 0% reads the same way.

**Evidence:** Traced by reading the code; no PDF was rendered. Lines 134-140 filter only on isDefined(overallRate) and overallEligible >= minimumSample. The server returns 0, not null, when eligible > 0 and nobody reached the end (computeRate, crm-analytics-metrics.service.ts:199-200, used at line 590), and formatAnalyticsRate(0) returns '0%'. pickHighestRow at lines 113-116 uses a strict > comparison, and top-level rows sort by people (compareCategoryRows, metrics service 570-586, applied at 1155-1157). Contract line 931 only says rows at or above the minimum qualify, so it does not settle the all-zero case. The number itself is an honest measured 0%, which is why this stays minor. The report's other locations hold: buildAnalyticsCategoryAnswers.ts:51-62 has the same gap on the Best converting card. It missed buildCategoriesTakeaway.ts:42-48, which has the same gap and prints in the PDF through AnalyticsPdfTracksSection.tsx:97.

**Suggested fix:** Require overallRate > 0 for the best row in all three builders: buildAnalyticsPdfAnswers.ts:134-140, buildAnalyticsCategoryAnswers.ts:51-62 and buildCategoriesTakeaway.ts:42-48. When rows meet the minimum but all are at 0%, print a new line such as 'No track has converted anyone yet.' Do not reuse 'No track has enough people to compare conversion yet.' or the card's 'Not enough people in any group to compare yet', because those would be false here. Add a test for the all-zero case to each builder's tests.

## D51 [minor] PDF (confirmed, from U18-pdf-funnel)
File: `packages/twenty-front/src/modules/crm-analytics/report-pdf/components/AnalyticsPdfFunnelSection.tsx` line 164

**Problem:** The note says 'The lowest step is in color', which is not always true. lowestStepStageKey is the lowest only among steps with at least the minimum sample, leaves out the first step when a later one qualifies, and is null when none qualifies. Contract line 488 sets that definition and the highlight, so both stay. The sentence is what misleads, and no PDF text states the rule.

**Scenario:** New has eligible 100 and rate 0.05. Contacted has eligible 40 and rate 0.20. Before meeting has eligible 12 and rate 0.08. computeLowestStepStageKey returns CONTACTED, so the 20% column is in color beside the 5% and 8% columns, under a note saying the lowest is in color, and the funnel above tags that row 'Lowest step'. A low first step is a likely shape, so this should be common. At launch, when every step has eligible under 30, the key is null. hasKnownStepRate can still be true through small-sample or so-far rates, so the note promises a colored step and none is colored.

**Evidence:** crm-analytics-metrics.service.ts:635-657 filters to eligible >= minimumSample, then prefers rows other than rows[0]. AnalyticsPdfColumns.tsx:26-29 uses the accent only when isHighlighted. Line 230 and line 190 of this file take that flag from lowestStepStageKey. AnalyticsFunnelCharts.tsx:70 carries the qualifier on the page. review-notes.md line 22 (U17-pdf-first-page) flags the same gap. 'Decisions from testing' does not cover this sentence.

**Suggested fix:** Keep the highlight. When lowestStepStageKey is defined, reword the sentence at line 164, for example 'The step in color is the lowest among steps with at least {minimumSample} people, leaving out the first step when a later one qualifies.' Leave the sentence out when the key is null. The conversion block always renders when a marker exists, so one place is enough. The first-page question at buildAnalyticsPdfAnswers.ts:184 has the same gap, and a test pins its text, so change both if it is reworded.

## D52 [minor] PDF (confirmed, from U18-pdf-funnel)
File: `packages/twenty-front/src/modules/crm-analytics/report-pdf/components/AnalyticsPdfFunnelSection.tsx` line 112

**Problem:** buildStepRateBarRow ignores rate.isLighter, so in the bar form used above 12 steps, small-sample and so-far rates print bold on a firm neutral bar. The column form honours isLighter, so the same rate changes weight when the chart switches form. This is latent: the current config has 8 ranked stages, so 7 steps, and it starts only at 14 ranked stages.

**Scenario:** The config has 13 steps. A row has eligible 2 and stepRate 0.5, or eligible 0 and soFarRate 0.1. describeAnalyticsPdfRate returns isLighter true. The row gets tone NEUTRAL unless it is the lowest step, so AnalyticsPdfHorizontalBars computes isLighter false and '50%' prints bold in ink with the firm neutral fill, the same as a rate from 500 people. Its count or 'so far' still prints beside it. In AnalyticsPdfColumns the same rate is neutralSoft, non-bold and inkSecondary.

**Evidence:** Line 112 sets tone only from lowestStepStageKey. AnalyticsPdfHorizontalBars.tsx:97 derives lighter text only from tone === 'LIGHTER' or a null value. AnalyticsPdfColumns.tsx:31-33 and 90-95 honour rate.isLighter. dashboard-redesign.md rule 6 and its PDF section require small samples to print lighter. Only buildOversizedReportFixture reaches this path, and all its step rates are firm, so no test catches it.

**Suggested fix:** Add a lighter neutral tone to AnalyticsPdfBarTone, with neutralSoft fill and lighter text like the column form, and include it in the isLighter check at AnalyticsPdfHorizontalBars.tsx:97. In buildStepRateBarRow, use ACCENT for the lowest step, the new tone when rate.isLighter, otherwise NEUTRAL. Do not reuse 'LIGHTER': its pale accent fill would put color on more than the lowest step. Add a small-sample step to the oversized fixture.

## D53 [minor] PDF (confirmed, from U18-pdf-funnel)
File: `packages/twenty-front/src/modules/crm-analytics/report-pdf/components/AnalyticsPdfFunnelSection.tsx` line 247

**Problem:** The PDF's stacked-bar note never says what 'Still in progress' covers. The segment is row.inWindow (entered minus eligible), so it includes people who already moved on or left inside the window. The number and the label are as specified, so neither should change: contract lines 426 and 482, row E at line 1044 (moved on, still counted too recent), and dashboard-redesign.md rule 5 ('Still in progress' for too recent). The defect is only the missing definition, which the page states and the PDF does not.

**Scenario:** Week two after launch: 100 people entered New in the last 14 days and 60 have already reached Contacted. eligible is 0, so inWindow is 100. The stacked bar for New reads 100% Still in progress with no Moved on part, while the funnel in the same section shows Contacted with 60 and '60% moved on so far'. With no definition, a reader takes it that all 100 are still in New. The same holds for anyone who exited inside the window. It is not only a launch effect: in any report, this part counts everyone whose window at that stage has not closed, whatever they have done since.

**Evidence:** crm-analytics-metrics.service.ts:624 has inWindow: step.entered - eligible, and lines 388-390 count eligible, reached_next and exited only where window_end has passed. AnalyticsFunnelCharts.tsx:101 says 'Still in progress means they are inside the window.' The PDF note at line 247 says only 'Share of the people who reached each stage, all applications since tracking start.' A grep of report-pdf for 'progress' and 'window' finds no definition elsewhere. 'Decisions from testing' does not address this wording. review-notes.md line 10 (U10-funnel) notes the same looseness.

**Suggested fix:** Add one sentence to the note at line 247, for example 'Still in progress means the step's window has not closed yet, including people who have already moved on or left.' The page's definitions of Stalled and Left can come across at the same time. Do not split the segment or add a reachedSoFar server field: rows E and F in the contract fix this arithmetic.

## D54 [minor] PDF (confirmed, from U15-reports)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsReportView.tsx` line 590

**Problem:** Report line charts pass previousValues but no previousLabel, so a gray line from a whole window earlier appears in the legend and tooltip as 'Previous period'. In the same report, that phrase means one period back in the comparison table.

**Scenario:** Weekly report for 2027-02-01. The trend has 12 buckets, so the last point's previous value is the week of 2026-11-09. Hovering shows 'Previous period: 40', while the comparison table's 'Previous period' for New applications shows the week of Jan 25, for example 75. Two different numbers carry the same label. Overall conversion by week goes 26 weeks back. It appears once a report is at least one window past tracking start, because previousValues is otherwise left out.

**Evidence:** compute-crm-analytics-report-periods.util.ts:156-160 sets previousBucketStart to start minus bucketStarts.length periods, and the defaults are 12 buckets, or 26 for overall conversion by week (lines 26-33). computeReportSeries sends dateFrom null, so reports use those defaults. AnalyticsLineChart.tsx:279 and 344 fall back to 'Previous period', and the legend shows at default size. The comparison table heading (AnalyticsReportView.tsx:188) uses computeCrmAnalyticsPreviousReportPeriod, one period back. AnalyticsTrendSmallChart.tsx:171 passes `${windowLength} before`, and the PDF prints 'The 12 weeks before' (AnalyticsPdfTrendsSection.tsx:122-125). Contract section 6 settles what the value is, not its label. Correction to the report: the web report is the only caller that omits the prop, but Overview passes the same words explicitly (AnalyticsOverviewCharts.tsx:204).

**Suggested fix:** Add previousLabel to AnalyticsReportTrendChart in buildAnalyticsReportTrendCharts, as t`${getAnalyticsWindowLength(points.length, report.periodType)} before` the way Trends builds it, and pass it to AnalyticsLineChart. Overview's line has the same wording next to its figure's 'against the previous period' (AnalyticsFiguresRow.tsx:210). That is outside this report view, so raise it separately rather than changing it here.

## D55 [minor] PDF (confirmed, from U15-reports)
File: `packages/twenty-front/src/modules/crm-analytics/utils/buildAnalyticsReportTrendCharts.ts` line 48

**Problem:** The frozen DROP_OFF series covers only the entry step, but the web report titles it 'Drop-off rate over time' with no stage, so it reads as drop-off for the whole pipeline.

**Scenario:** Monthly report: the line shows 22%, which is the share of people who did not get past New within its window. A reader takes 22% as the pipeline's drop-off, and neither the title, legend, tooltip nor note says otherwise. Trends labels the same metric 'Drop-off from New' and the PDF says 'Drop-off from New over time'.

**Evidence:** computeReportSeries calls resolveTrendStageKey('DROP_OFF', null), which returns ENTRY_STAGE_KEY (crm-analytics-metrics.service.ts:924 and 2206-2209). Contract section 7 says `DROP_OFF` (entry step). readRateTrendValue reads that one step. getSeriesLabel takes only the metric and ignores the series stageKey, although AnalyticsTrendsTab.tsx:81-83 and AnalyticsPdfTrendsSection.tsx:449-451 name the stage. The note at lines 68-70 is generic too.

**Suggested fix:** Look up the stage label from report.funnel.rows by the series stageKey and use t`Drop-off from ${stageLabel}`, keeping 'Drop-off rate' only when the stage is not found. The title then matches the PDF's 'Drop-off from New over time'.

## D56 [minor] PDF (confirmed, from U15-reports)
File: `packages/twenty-front/src/modules/crm-analytics/utils/buildAnalyticsReportAnswers.ts` line 74

**Problem:** The report's Overall conversion card never sets isLighter, so small-sample and so-far rates draw at full strength. L7 fixed this for the Funnel tab only.

**Scenario:** A report with overall.eligible = 12 and rate = 0.25 shows a full-weight '25%'. With eligible = 0 and soFarRate = 0.1 it shows a full-weight '10% so far', which is the state of any report in the first 90 days once someone has signed. The Funnel tab, Overview and the PDF draw the same values lighter.

**Evidence:** AnalyticsAnswerCards.tsx:15 and 72 support isLighter, and buildOverallConversionAnswer.ts:50 and 59 return it. buildFunnelAnswerCards.ts:108-111 passes it on. buildAnalyticsReportAnswers calls describeAnalyticsRate itself at lines 76-81 and uses only .label. buildAnalyticsPdfKeyFigures.ts:91 and 104 set isLighter for the same figure. dashboard-redesign.md rule 6 requires lighter drawing. L7 names only buildFunnelAnswerCards, so this is not a duplicate.

**Suggested fix:** Keep the describeAnalyticsRate result in a variable and set isLighter to rate.isSmallSample || rate.isInProgress on the overall-conversion card. Reusing buildOverallConversionAnswer also works, but it changes the detail text.

## D57 [minor] PDF (confirmed, from U15-reports)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsReportView.tsx` line 426

**Problem:** The funnel note says people who applied in this period are still in progress and not rated yet. That holds only for a weekly report built on time. It is false for every monthly report and for any report built late, including every provisional rebuild and backfill, because funnel, category and cohort rates use windows closed by build time.

**Scenario:** The November 2026 weekly report is rebuilt in March 2027 once definitions are confirmed. Its applicants are past the 14-day window, so they count in eligible and in the rates, but the note says they are not rated. The same happens on time: the November monthly report is built on Dec 1, when people who applied Nov 1 to 16 are past the New window and already rated at that step. The demo shows it on the first local run, since load.mjs clears reports and the daily job then builds the old periods late.

**Evidence:** crm-analytics-report.service.ts:229 sets cohortDateRange to { from: null, to: range.to }. computeFunnel (crm-analytics-metrics.service.ts:997) calls readFunnelGroups without windowsClosedAt, so buildFunnelCtes uses now(); only computeReportSeries passes windowsClosedAt. STEP_WINDOW_DAYS is 14. buildMissingReports treats provisional rows as missing once the config stops being provisional, and rebuilds them with the current time. Contract section 6 says rates come from 'the people past their window at generated_at', which is what the code does. Its added line that a period's own applications are too recent to rate is true only for the on-time weekly case. Correction to the report: 'all applications since tracking start' is the wording contract section 6 asks for, so that half, and line 490, is settled and not a bug.

**Suggested fix:** Change the wording only. Keep the contract's phrase and replace the second sentence, for example: t`Counts people across all applications since tracking started, up to the end of this period. A rate counts only people past that stage's window when this report was made; anyone still inside it is not rated yet.` Do not pass windowsClosedAt into the report's funnel, categories or cohorts without asking the user, because that changes the basis contract section 6 sets.

## D58 [minor] PDF (confirmed, from U15-reports)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsReportView.tsx` line 510

**Problem:** Several report empty states cannot fire on the data the server sends, because it always returns one row per configured stage. A quiet period or an early report draws an all-zero or all-dash chart instead of a plain message, unlike the matching tab and the PDF.

**Scenario:** A week with no stage moves: movement has 12 rows, all 0, so isEmpty is false and the diverging chart draws only zeros. Trends says 'No one changed stage in this period.' and the PDF says 'No one moved between stages in this period.' An early report where nobody is past a 14-day window and nobody has moved on: 'Conversion at each step' draws gridlines and dashes, where the Funnel tab says 'No one has passed a stage's window yet.' Correction to the report: if someone has moved on, the chart shows lighter so-far columns, as the Funnel tab does, so the all-dash case needs no moves at all. The same applies to 'Which track converts best?' on any report in the first 90 days before anyone has signed: every row is a dash, where the Tracks tab shows its 'tracked long enough' message.

**Evidence:** computeMovement maps CRM_ANALYTICS_CONFIG.stages (crm-analytics-metrics.service.ts:1220) and computeFunnel maps RANKED_STAGES (line 1030). Line 510 tests movement.length === 0, line 442 tests funnel.rows.length < 2, and line 427 tests funnel.rows.length === 0. Lines 491-493 test row counts, while buildAnalyticsCategoryRateRows returns a row with empty segments for an unknown rate. AnalyticsTrendsTab.tsx:299-301 and 361 use a .some check, AnalyticsFunnelCharts.tsx:87 uses !hasAnyStepConversion(funnel), AnalyticsCategoryCharts.tsx:367 uses !hasAnyRate, and AnalyticsPdfTrendsSection.tsx:252-255 and AnalyticsPdfFunnelSection.tsx:123 and 199 each have a no-data line. Line 528 in this same view already uses .some.

**Suggested fix:** Line 510: !report.movement.some(row => row.enteredInPeriod > 0 || row.leftInPeriod > 0) with a 'No one changed stage in this period.' message. Line 442: !hasAnyStepConversion(report.funnel) with the Funnel tab's message. Line 427: !report.funnel.rows.some(row => row.entered > 0) with the PDF's line. Lines 491-493: no row in rateRows.rows or rateRows.dividedRows has segments, with the Tracks tab's message.

## D59 [minor] PDF (confirmed, from U15-reports)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsReportView.tsx` line 511

**Problem:** The frozen report reuses AnalyticsMovementTable, whose column is headed 'Now', but countNow is the count when the report was generated. The card note does not say so.

**Scenario:** In June, a user opens the March report and clicks Show numbers. 'Contacted: Now 14' reads as today's count, but 14 is the count when the March report was generated and the live page shows a different number.

**Evidence:** AnalyticsMovementTable.tsx:29 hardcodes t`Now`. Contract section 6 says a report's movement.countNow is current state at generated_at, and the payload is stored. The note at line 509 covers only moves. The other cards on this page say 'as of when this report was made' (lines 462 and 527), and the PDF explains it: 'In stage now is when this report was generated.' (AnalyticsPdfTrendsSection.tsx:288). Contract section 8 asks for a 'now' column on Trends and for the report view to reuse the table, but it does not settle the wording in a frozen report.

**Suggested fix:** Add an optional column-label prop to AnalyticsMovementTable, defaulting to t`Now`, and pass something like t`At report time` from the report view, which keeps the reuse the contract asks for. A smaller option is to add the PDF's sentence to the card note at line 509.

## D60 [minor] PDF (confirmed, from U15-reports)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsReportView.tsx` line 412

**Problem:** While a newly selected report loads, the view keeps the previous payload and Download stays active, so a click saves the previous report while the rail already highlights the new one.

**Scenario:** March is open. The user clicks February, not yet opened in this session, in the rail and then Download PDF while the read runs. That is usually brief but can reach about 10 seconds when page reads are queued. The file saved is March, because report still comes from previousData, while the rail marks February. If February arrives while the PDF is being built, the key changes, the spinner disappears, and the March file still saves with February on screen. Correction to the report: the dimmed title is not the only clue, because the file name also carries March's date. A report already in the Apollo cache switches at once and is not affected.

**Evidence:** useCrmAnalyticsQuery.ts:32 returns data ?? previousData with isRefetching true. The installed @apollo/client 4.2.0 useQuery keeps the old data in previousData when variables change. AnalyticsReportView renders AnalyticsReportDownload with report from that payload at lines 412-415, and its key follows the payload's period, not the selected props. StyledReport only lowers opacity, and the Button gets no disabled state. AnalyticsReportsTab.tsx:243 and 249 highlight from selection at once, and line 261 renders the view with no key. downloadAnalyticsReportPdf and buildAnalyticsPdfFileName both use the prop they are given. Database service: 2 page reads at a time, with a 10 second slot wait.

**Suggested fix:** Pass a disabled flag to AnalyticsReportDownload when report.periodType or report.periodStart differs from the periodType and periodStart props, and set disabled on the Button. Both period starts are plain YYYY-MM-DD strings, so a direct comparison works. A background refresh of the same report keeps it enabled.

## D61 [minor] PAGE (confirmed, from U19-pdf-tracks)
File: `packages/twenty-front/src/modules/crm-analytics/utils/buildCategoriesTakeaway.ts` line 42

**Problem:** The Tracks takeaway and the first-page track answer name a best converter even when every qualifying rate is 0, so a group where nobody converted is called the best.

**Scenario:** A report is built after the first applicants pass the 90 day window. Every track with overallEligible of 30 or more has overallRate 0 because nobody reached Signed in time. One qualifying track at 0 is enough, for example when only the largest track has 30 eligible people. pickHighestRow keeps the first qualifying row, since no later value is strictly greater, and the server orders rows by people. The Tracks section under 'Which tracks work best?' prints 'Artificial Intelligence & Software Engineering is largest; Artificial Intelligence & Software Engineering converts best, 0%.' The first page prints '... is largest, with 168 people, and converts best: 0% of 72 people.' The chart below shows 0%.

**Evidence:** Read in code, not rendered. computeRate(0, n) returns 0, not null (crm-analytics-metrics.service.ts:199, 590, 1140), and the report stores that row through computeCategories. isDefined(0) passes the filter at buildCategoriesTakeaway.ts:44-45. The reduce at lines 15-20 keeps the first row on a tie, compareCategoryRows (metrics service 570-586) sorts by people, and formatAnalyticsRate(0) returns '0%'. The only caller is AnalyticsPdfTracksSection.tsx:97. That section already handles all-zero for its scale note through hasPositiveRate (lines 87 and 154) but passes the takeaway through unchanged. buildAnalyticsPdfAnswers.ts:134-154 has the same gap on the first page. Not in the original report: the page has it too, since buildAnalyticsCategoryAnswers.ts:51-62 fills the 'Best converting' card with '0%'. Contract line 931 only says rows at or above the minimum qualify and is silent on an all-zero group. No test uses a zero overallRate for best: buildCategoriesTakeaway.test.ts, buildAnalyticsPdfAnswers.test.ts and buildAnalyticsCategoryAnswers.test.ts cover positive or null rates, and the last file's only zero is a step rate. Not in large-review-findings.md. Severity stays minor because the printed 0% is a true measured value and only the 'converts best' wording is wrong.

**Suggested fix:** Correction to the reported fix: do not let this case fall to line 51, because 'no group has enough people to compare conversion yet' would be false here. Keep the current filter, then add a separate branch when the chosen bestRow has overallRate 0, returning a new Lingui sentence such as '{largest} is largest; no group has converted yet.' Do the same in buildTrackAnswer, for example '{largest} is largest, with {people}. No track has converted yet.' In buildAnalyticsCategoryAnswers, show a dash and a plain reason on the 'Best converting' card. Add a zero-rate test to each of the three test files.

## D62 [minor] PDF (confirmed, from U19-pdf-tracks)
File: `packages/twenty-front/src/modules/crm-analytics/report-pdf/charts/AnalyticsPdfHorizontalBars.tsx` line 46

**Problem:** In the PDF 'People by track' and Programs charts, the active part of a catch-all row is drawn in a darker gray that the legend does not list. The legend says Active is the accent blue and Not active is gray, so the row has no mark a reader can read as active.

**Scenario:** Correction to the reported scope: this affects weekly and monthly reports, because 'People by track' is on every report and only the Programs section is monthly. A report has a 'No position' row with people 120 and activePeople 80. buildAnalyticsPdfCountBars gives it tone NEUTRAL. getPartBarFill returns neutral #b3b3b3 for the 80, and the rest of the bar is neutralSoft #d6d6d6. The legend above shows only blue for Active and #d6d6d6 for Not active, so the bar shows no blue and an unexplained darker gray, and it can read as all not active. The same happens for the 'Unmapped' track and for every program in the 'Unmapped' block, where no row shows blue. The report's people counts have no date range (crm-analytics-report.service.ts:273), so imported people count here and this row can be large.

**Evidence:** Checked in code, not rendered. buildAnalyticsPdfCategoryBars.ts:60-61 sets partValue and tone NEUTRAL for catch-all rows. AnalyticsPdfHorizontalBars.tsx:46-47 and 141 draw the part in neutral, and lines 125-129 draw the rest in neutralSoft. AnalyticsPdfActiveLegend.tsx:12 and 17 list accent and neutralSoft only. The legend is used at AnalyticsPdfTracksSection.tsx:135 and AnalyticsPdfProgramsSection.tsx:175, and neither chart's note explains the darker gray. The server sets isUnmapped true for the UNMAPPED track and its programs (metrics service 1972), and isAnalyticsCatchAllRow.ts:6-7 treats those and the NONE row as catch-all. The page does not do this: AnalyticsCategoryCharts.tsx:146-158 and buildAnalyticsCategoryBarRows.ts:55-68 set active to accent on catch-all rows too, and AnalyticsHorizontalBarChart.tsx:265 honors that color, so the PDF differs from both the live page and the on-page report view. Inside the PDF, buildAnalyticsPdfConversionBars also uses accent tones for catch-all rows. dashboard-redesign.md rule 9 allows gray for context and the people-chart row says 'active shown darker than the rest', which explains the choice of shade but not leaving it off the legend. The contract and redesign doc do not settle this, and it is not in large-review-findings.md.

**Suggested fix:** Draw the part in the accent on every row, replacing getPartBarFill(row.tone) at line 141 with ANALYTICS_PDF_COLOR.accent and removing the helper, which matches the page and the legend. Keep the NEUTRAL tone for bars with no part: 'New applications by track' and the funnel step-rate bars. If catch-all rows should stay gray so they do not compete with real tracks, keep the drawing and add a legend item or note saying the darker gray on these rows means active.

## D63 [minor] PAGE (confirmed, from U13-trends-tab)
File: `packages/twenty-front/src/modules/crm-analytics/utils/summarizeAnalyticsTrendSeries.ts` line 65

**Problem:** A Drop-off rate in a month that is still running can have a value, and the card headline shows it as final. The rate branch of getWhenText ignores isPartial, so there is no 'so far', the big number is not lighter, and a change against the month before is shown. The chart under the same headline draws that point lighter and its tooltip says 'So far, still in progress.'

**Scenario:** Today is 2027-03-20, By month, filtered to one track. 40 people applied on Mar 1 to 5 and nobody since, so all their 14-day windows have closed and eligible equals entered. The March bucket has a value and isPartial true. The card shows a full-strength '35%' and '40 people who applied in Mar 2027. +5 points against the month before.' The change needs February to have 30 people or more. One new applicant on Mar 21 makes eligible differ from entered, so the value goes null and the line stops. Only monthly Drop-off can reach this: a running week is younger than the 14-day window, and no month is older than the 90-day overall window. Under the minimum sample the number is lighter and the change is hidden, but 'so far' is still missing.

**Evidence:** Checked on HEAD 405c185e. crm-analytics-metrics.service.ts:738 gives a value when step.eligible === step.entered, and line 388 counts eligible as window_end <= now(). compute-crm-analytics-report-periods.util.ts:161 sets isPartial for the bucket holding today, for every metric. summarizeAnalyticsTrendSeries.ts:134 takes the last point with a value, partial or not. Lines 65-77 return before isPartial is read. The guard at line 161 applies only when isRunningCount is true. AnalyticsTrendSmallChart.tsx:139 lightens the value only for small samples. AnalyticsLineChart.tsx:288 and 424 mark the same bucket 'So far' and lighter. dashboard-redesign.md rule 6 says a rate still in progress draws lighter and says so far. Contract section 6 sets the server value (null until eligible = entered) but says nothing that lets the headline call an unfinished period final. The summary tests only cover a partial rate with a null value. AnalyticsTrendTable.tsx:248 does mark the row 'in progress', but getChange at lines 110-119 still shows its change.

**Suggested fix:** Fix it on the front end and keep the server value, since contract section 6 defines mature as eligible = entered and the cohort table uses the same rule. In summarizeAnalyticsTrendSeries, when the metric is a rate and latestPoint.isPartial: word the detail as so far, such as '40 people who applied so far in Mar 2027', return no change text, and return a flag that draws the value lighter. Extend the AnalyticsTrendSmallChart styling to that flag. Skip the change in AnalyticsTrendTable.getChange for the same case. The alternative is to return null from the server for a partial rate bucket, which adds a condition to the contract's definition, so it should be recorded there. Add a test for a partial rate point with a value.

## D64 [minor] PAGE (confirmed, from U13-trends-tab)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsTrendSmallChart.tsx` line 110

**Problem:** The stop note gives a false reason when the last bucket is empty because nobody applied in it. It only checks that the last point's value is null, then says newer applicants have not had enough time.

**Scenario:** Viewed in August 2027, By month, dates 2027-01-01 to 2027-02-28, filtered to a track with 40 applicants in January and none in February. February has no funnel group, so it returns value null and size 0. January is the headline, and under the chart the card says 'The line stops before recent periods, because newer applicants have not had enough time yet.' February is six months old and had no applicants. No date filter is needed: By week or By month on a narrow track, program or source with no recent applicants does the same.

**Evidence:** crm-analytics-metrics.service.ts:720-722 returns { value: null, size: 0 } when the group is undefined. An immature bucket also has a null value, but its size is above 0 (lines 730 and 741). AnalyticsTrendSmallChart.tsx:110-113 tests only !isDefined(points.at(-1)?.value). The redesign's 'its line stops before recent periods and says so' does not cover an old empty bucket.

**Suggested fix:** Show the note only when the last point with a size above 0 has a null value. For example: const lastPointWithPeople = points.findLast(({ size }) => isDefined(size) && size > 0), then require isDefined(lastPointWithPeople) && !isDefined(lastPointWithPeople.value). The existing test, whose last point has size 12, still passes.

## D65 [minor] PAGE (confirmed, from U13-trends-tab)
File: `packages/twenty-front/src/modules/crm-analytics/utils/getAnalyticsSeriesEmptyText.ts` line 34

**Problem:** For a date range wholly before tracking start, the New applications card says there are no applications. The server nulled those buckets because their total is unknown, not because it is zero.

**Scenario:** Tracking starts 2026-10-27. Choose Custom dates 2026-09-01 to 2026-09-30, By month. The September bucket is earlier than firstTrackedBucketStart 2026-10-01, so its value is null whatever rows exist. Every point is null, the summary is null, and the card reads 'No applications in this range yet.' The New applications by track card shows the same text. By week and By day do the same for this range.

**Evidence:** crm-analytics-metrics.service.ts:2347-2354 has the comment 'A bucket wholly before tracking start has no known total, however many rows it holds' and returns null, while a tracked bucket with no rows returns 0. So an all-null series only happens before tracking or with no buckets. The page stays out of the EMPTY panel because computeMovement has no date on scope (line 1185), so countNow is above 0 (line 1228) and AnalyticsTrendsTab.tsx:254-259 is false. AnalyticsFilterBar.tsx:272-274 only checks the year of a date, and the From input has no min, so a date earlier in 2026 is accepted. The rate branch of the same function already names the tracking start. Rule 6 says unknown is never shown as zero.

**Suggested fix:** When the series has buckets, use tracking-start wording for NEW_APPLICATIONS as the rate branch does, for example 'Tracking started {date}. Applications before then have no known total.' Keep the current text when there are no buckets: a future-only range returns an empty series (compute-crm-analytics-report-periods.util.ts:144), and there 'no applications' is true. Both callers, AnalyticsTrendSmallChart.tsx:104 and AnalyticsTrendTrackCharts.tsx:83, know whether any points exist and can pass that in.

## D66 [minor] PAGE (confirmed, from U13-trends-tab)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsTrendsTab.tsx` line 280

**Problem:** getCutRangeNote compares the retained old series with the new filter, so a false 'Showing the latest N periods.' appears during a refetch. If that refetch fails, the note stays beside the error cards.

**Scenario:** On 2026-11-08 choose Last 30 days: dateFrom is 2026-10-10, and By week has 5 buckets starting 2026-10-05. Click By month. Until the response returns, filter.period is MONTH, so requestedStart is 2026-10-01. The old first bucket is later, so the toolbar reads 'Dates widen to whole months on this tab. Showing the latest 5 periods.' Nothing was cut. By day to By week does the same, and so does moving dateFrom earlier. A filter already in the Apollo cache is not affected. If the request fails, previousData stays, isRefetching goes false and the cards show 'This chart could not load', with the false note still in the toolbar.

**Evidence:** Line 280 passes smallChartSeries together with trendsFilter. The series comes from previousData through useCrmAnalyticsQuery.ts:32, and Apollo 4.2 useQuery.js:190-195 keeps previousData when variables change. AnalyticsTrendsTab.tsx:149-157 reads dateFrom and period from the new filter. Only the chart labels moved to the payload's period (lines 239-240, the L19 fix). AnalyticsContent.tsx does not remount the tab on a filter change. A real cut only happens at 60 buckets (compute-crm-analytics-report-periods.util.ts:24), so any note on a shorter retained series is false.

**Suggested fix:** Compute the note only when !isSmallChartsRefetching and smallChartsError is not defined, and show no cut note otherwise. The 'Dates widen' part can stay, because it describes the new filter.

## D67 [minor] PAGE (confirmed, from U13-trends-tab)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsTrendsTab.tsx` line 96

**Problem:** The Active people note defines the chart as 'People not signed or exited', but people with an unmapped stage or no stage are neither of those and are left out of the count.

**Scenario:** A snapshot has 100 people in mapped main stages and 40 whose raw Stage value is not in the config. The chart shows 100, although by the note's wording the answer is 140. Most raw values in the config are still guesses, so this gap could be large at launch. The number itself is right; only the note is wrong.

**Evidence:** The snapshot stores raw stage values, unmapped and empty included (crm-analytics-snapshot.service.ts:38). readSnapshotBuckets LEFT JOINs stage_map (crm-analytics-metrics.service.ts:2501) and applies buildActiveConditionSql at line 2472, which is m.kind IN ('MAIN','OTHER') (line 244). For an unmapped or empty stage m.kind is NULL, so the row is dropped. Contract line 469 sets the number. The Overview tile with the same wording already adds the caveat: AnalyticsFiguresRow.tsx:184 says 'Leaves out N with a stage not yet mapped.' The provisional banner does not mention it.

**Suggested fix:** Reword the note to match the definition, for example 'People in a mapped stage who have not signed or exited, from the last daily count in each period.'

## D68 [minor] PAGE (confirmed, from U13-trends-tab)
File: `packages/twenty-front/src/modules/crm-analytics/utils/summarizeAnalyticsTrendSeries.ts` line 108

**Problem:** A rate change of exactly one point reads '+1 points' or '-1 points', because the text has no singular form. The median branch just below it does use plural. The Change column in AnalyticsTrendTable.tsx:136 has the same wording.

**Scenario:** Overall conversion moves from 20% to 21% with both groups at the minimum sample or above. The card reads '+1 points against the month before', and the table's Change column reads '+1 points'.

**Evidence:** summarizeAnalyticsTrendSeries.ts:108 and AnalyticsTrendTable.tsx:136 are both t`${points} points`. summarizeAnalyticsTrendSeries.ts:117-120 uses plural for days. These are the only two places this text is built, and no test expects the '1 points' form.

**Suggested fix:** Use plural(Math.abs(roundedPoints), { one: `${points} point`, other: `${points} points` }) in both places, with roundedPoints = Math.round(delta * 100). AnalyticsTrendTable.tsx needs plural added to its macro import.

## D69 [minor] SERVER (confirmed, from stage-clock)
File: `packages/twenty-server/src/modules/analytics/services/crm-analytics-metrics.service.ts` line 476

**Problem:** The stage clock pairs the person's live stage with copied transitions and never checks that the copy has seen the move into that stage. With no row into the stage it falls back to created_at, and with an older row into it, it uses that row. A person who just moved shows as past limit with a wrong age, printed as exact, until the next sync.

**Scenario:** Limit 14, sync ticks at :07, :22, :37, :52. Person created 2026-10-28 00:00 in NEW, moved to CONTACTED 2026-11-27 10:00, page opened 10:03, last sync 09:52. scope reads CONTACTED and transition has no row for them, so latest_entry is empty, stage_entered_at is Oct 28 and days_in_stage is 30. People to follow up shows Contacted, 30, 16 with no 'at least', and stuckPeople and the Contacted pastLimitCount each rise by 1. The 10:07 sync clears it. The usual forward move does the same: NEW to CONTACTED copied on Nov 20, then CONTACTED to BEFORE_MEETING at 10:00 has no row into BEFORE_MEETING, so it reads 'Before meeting, 30, 16' for someone only 7 days into Contacted and never past limit. B(t1) to C(t2) back to B, not yet copied, uses old t1, for imported people too. The list sorts by days over limit, so a bulk move puts these people near the top. Normally this lasts up to 15 minutes plus timeline queue delay. It lasts as long as sync keeps failing, and longer per tick if the pattern moves to hourly as contract section 5 allows.

**Evidence:** Traced by hand through the current code, not run. crm-analytics-metrics.service.ts:467-471 latest_entry filters only on to_key = current_key. Line 476 is the fallback. Line 477 gives is_lower_bound false when there is no row. Line 489 evaluates to NOT false AND 30 > 14. readStageClockTotals (1606-1611) and readStuckRows (1662-1669) both read it per request, with no cache and no sync on read. scope is the live person row (build-crm-analytics-cte.util.ts:64-65, facade:263-265). transition is analytics.stage_transition (cte util:66-71), filled only by the 7,22,37,52 sync and the 02:30 daily job. AnalyticsStuckTable.tsx:112 prints 'at least' only for isLowerBound. Contract line 473 gives exactly this fallback order and the code follows it to the letter, but the contract never considers a live stage ahead of the copy: its only pending-timeline rule is reconcile's 30 minute skip (line 359), and 'Decisions from testing' says nothing on it. Not in large-review-findings.md: L25's fix at line 472 covers only moves inside one stage. Limits on the claim: a failed sync is flagged in the sync line at once (AnalyticsSyncLine.tsx:25), with a banner after 60 minutes. A first-move row that is lost for good is the documented reconcile limit (contract line 372, integration check R5), so it is not part of this finding. Frozen reports are effectively unaffected because the daily job re-reads first (crm-analytics-workspace-daily.job.ts:97-139), leaving only moves in the seconds around 02:30.

**Suggested fix:** In buildStageClockCtes, make stage_entered_at NULL when the copy is behind, so the person counts as neither stuck nor inactive and is not listed until the next sync. Two checks are needed, because the original newest-transition CTE misses the finding's own headline case: that person has no transition row at all. (1) The newest key-changing transition's to_key IS DISTINCT FROM current_key, the same comparison reconcile makes at crm-analytics-sync.service.ts:74-80. (2) For people with no key-changing transition, s.updated_at is later than the start of the last ok sync in analytics.sync_log, less a short margin for a pending timeline job. Reconcile uses the same updated_at signal at line 79. Add no new figure to the page. This changes the written rule at contract line 473, so the user should decide first and the contract should change with the code.

## D70 [minor] SERVER (confirmed, from filter-sql)
File: `packages/twenty-server/src/modules/analytics/services/crm-analytics-metrics.service.ts` line 751

**Problem:** resolveSnapshotDimension treats a program as implying its track only when the position is in the config map. A program under the Unmapped track therefore counts as two dimensions, and the stored-count lines become unavailable even though the stored 'position' rows answer the filter exactly. No wrong number is shown; the charts are missing.

**Scenario:** A position OLD_ROLE is an option on the field but not in any configured track. All 39 current form positions are mapped, so this starts when a position is added without a config change, or locally with the seed's LEGACY_POSITION. On Tracks & sources the user clicks the Unmapped row, which sets trackKey 'UNMAPPED'. The chart then shows that track's programs, and the user clicks OLD_ROLE, giving { trackKey: 'UNMAPPED', programKey: 'OLD_ROLE' }. On Trends, TRACK_KEY_BY_POSITION.get('OLD_ROLE') is undefined, which is not 'UNMAPPED', so isTrackImplied is false, dimensions has 2 entries and the function returns null. Total contacts, Active people and People in each stage then show 'Stored daily counts use one category at a time. Keep only one of Track, Program or Source.' Overview loses the Active people and Total contacts sparklines. The same click on a mapped program draws the line. Removing the Track chip also draws it, because the program alone is one dimension.

**Evidence:** Traced by reading the code; not run. getAnalyticsCategoryClickFilter.ts:24 sets trackKey to row.parentKey and programKey to row.key. buildCategoryMemberCtes (metrics service 506-528) gives unmapped positions parent UNMAPPED, and getAnalyticsCategoryChartRows.ts:19-23 shows program rows once a track is set. AnalyticsCategoryCharts passes these rows to clickable bars through dividedRows. crm-analytics-meta.service.ts:264-270 lists unmapped options with trackKey UNMAPPED, and AnalyticsFilterBar.tsx:268-270 offers them once that track is selected, so the filter bar reaches the same pair. AnalyticsContent.handleFilterChange and AnalyticsTrendsTab do not change track or program, and parseCrmAnalyticsFilter keeps both. computeTrendSeries (2259-2267) returns SNAPSHOT_FILTER_COMBINATION. crm-analytics-snapshot.service.ts:46 stores 'position' rows under the raw value, and the track filter adds nothing because that program already implies Unmapped, so the data exists. The code comment at line 748, the spec at 1774-1777 and integration check T18 treat a program inside its track as one dimension; the spec refusal at 1783 covers only a mapped program under another track. No test pairs UNMAPPED with an unmapped program. Contract section 1 line 72 puts unknown positions in track UNMAPPED, and nothing in sections 3 to 7 or the last sections refuses this pair. resolveSeriesTrackKeys (2123-2127) already applies the same fallback. Not in large-review-findings.md. The same defect is also filed under the snapshot, trends and config keys of the findings file.

**Suggested fix:** Keep the isDefined(filter.programKey) guard and compare with the fallback: isDefined(filter.programKey) && (TRACK_KEY_BY_POSITION.get(filter.programKey) ?? UNMAPPED_CATEGORY_KEY) === filter.trackKey. The guard must stay: without it, a plain Unmapped track filter would count as implied, drop to the 'all' dimension and read everyone's totals. A helper shared with resolveSeriesTrackKeys would also cover NONE with NONE, which only a direct API call can send. Add a case beside the spec at line 1775, plus a check that a mapped track with an unmapped program is still refused.

## D71 [minor] SERVER (confirmed, from database)
File: `packages/twenty-server/src/modules/analytics/services/crm-analytics-settings.service.ts` line 46

**Problem:** The tracking start check uses new Date(), which accepts many mistyped values. They pass as valid and silently change the numbers, although the comment at lines 32-33 says a mistyped value fails the job visibly.

**Scenario:** An operator hand-writes CRM_ANALYTICS_TRACKING_START_AT as a JSON string such as "Oct 27", "2026" or "2026-02-31". Direct SQL is the only writer, because the key has no UI or API. On a UTC server getTrackingStart returns 2001-10-27T00:00:00.000Z, 2026-01-01T00:00:00.000Z or 2026-03-03T00:00:00.000Z and does not throw, so jobs log ok and the page loads. Every read binds that value as $2, so s.created_at >= $2 lets imported people into funnel cohorts. The daily job also copies timeline rows from that date into stage_transition. Reports are listed from the wrong start, oldest first, at 8 per run. With 2001 that is about 1,607 periods, so each night stores 8 reports dated from 2001 onward and no current report is built for about 200 nights. Correcting the value later does not remove them: buildMissingReports only adds rows, and listReports returns every stored row.

**Evidence:** Lines 44-47 reject only non-strings, empty strings and NaN, and line 53 returns the parsed value. Date parsing reproduced with node. TZ=UTC: 'Oct 27' and '10/27' give 2001-10-27, '12' gives 2001-12-01, '2026' gives 2026-01-01, '2026-02-31' gives 2026-03-03. TZ=Asia/Karachi: '10-27-2026' gives 2026-10-26T19:00Z. 'not a date', '27/10/2026' and '2026-13-01' do throw. The rest was traced by reading, not run. Nothing downstream catches it, because toISOString output is well-formed for Temporal.Instant.from (compute-crm-analytics-report-periods.util.ts:67,179). Uses: crm-analytics-sync.service.ts:277-280, crm-analytics-metrics.service.ts:1290-1291 and 1326, crm-analytics-meta.service.ts:97-98, build-crm-analytics-cte.util.ts:71 and 77, crm-analytics-workspace-daily.job.ts:97-104, crm-analytics-report.service.ts:87-93 and 161-174. Correction to the report: the claim that the job runs up to the 10 minute budget each night is overstated. REPORTS_PER_RUN_LIMIT = 8 (compute-crm-analytics-report-periods.util.ts:23,266) normally stops it first; the budget at crm-analytics-report.service.ts:40 is only a backstop. The oldest-first order at line 265 starving current reports is a consequence the report missed. The contract does not settle this: lines 38 and 322 give no format, P7 (line 1029) only needs a bad value to fail, and line 997 is local test setup, so production has no documented SQL and a hand-typed date is the normal route. Not in large-review-findings.md. The unit test rejects only 'not a date', '' and 20260801 (crm-analytics-settings.unit.ts:61-72). Severity stays minor: it needs a manual database write, and the odd date does appear on the Funnel tab (AnalyticsFunnelTab.tsx:104) and in the report view, though no error is raised.

**Suggested fix:** Do not use Temporal.Instant.from alone as reported. It throws RangeError on '2026-08-01', which crm-analytics-settings.unit.ts:47-54 pins as accepted, so that fix would break the test. In a try/catch, parse values matching /^\d{4}-\d{2}-\d{2}$/ with Temporal.PlainDate.from(value).toZonedDateTime('UTC').toInstant(), and everything else with Temporal.Instant.from(value), importing Temporal from temporal-polyfill as the module's utils do. Throw the existing error on failure and return new Date(instant.epochMilliseconds).toISOString(). Checked with node: this keeps '2026-08-01' and full instants with an offset, and rejects 'Oct 27', '2026', '12', '10/27', '10-27-2026' and '2026-02-31'. Do not return the instant's own string, because it drops '.000' ('2026-10-27T00:00:00Z') and no longer matches the default constant's format. Add those rejected values to the it.each at crm-analytics-settings.unit.ts:61.

## D72 [minor] SERVER (confirmed, from trends)
File: `packages/twenty-server/src/modules/analytics/services/crm-analytics-metrics.service.ts` line 751

**Problem:** resolveSnapshotDimension treats a program as implying its track only for positions in the config map. An unmapped position has no entry in TRACK_KEY_BY_POSITION, so a program under its own Unmapped track counts as two dimensions, and every stored-count (snapshot) series returns SNAPSHOT_FILTER_COMBINATION. This filter combination is one the page itself produces.

**Scenario:** A person holds position X, which is not in the config's track table. Contract line 72 sends such positions to track key UNMAPPED, and the seed has LEGACY_POSITION as a case. On Tracks & sources, click the Unmapped row: the filter becomes { trackKey: 'UNMAPPED', programKey: null } and the chart switches to program rows. Click X: the filter becomes { trackKey: 'UNMAPPED', programKey: 'X' }. With Track on Unmapped, the Program dropdown produces the same pair, because it lists only unmapped programs. The result: on Trends, the Total contacts and Active people small charts and 'People in each stage over time' show 'Stored daily counts use one category at a time. Keep only one of Track, Program or Source.' instead of a line. On Overview, the Active people and Total contacts sparklines go blank with no explanation. The tile values stay correct because they read live data. The same steps on a mapped program draw the lines. { programKey: 'X' } with Track on All also draws them from the 'position' rows and selects the same people. Correction to the original finding: the message is inconsistent rather than false. Two chips do show, and removing the Track chip keeps programKey and draws the line, so the user has a way out. No number is wrong, so minor stands.

**Evidence:** Checked on HEAD 405c185e with a clean tree. The lines have not changed since the first server commit, and large-review-findings.md does not list this bug. L12 changed only the clear branch of the click filter. Trace: getAnalyticsCategoryClickFilter.ts:24 sets trackKey: row.parentKey and programKey: row.key. metrics service lines 506 and 528 give unmapped positions parent UNMAPPED. AnalyticsCategoryCharts.tsx:106-114 and AnalyticsHorizontalBarChart.tsx:230-240 keep catch-all divided rows clickable. crm-analytics-meta.service.ts:264-270 plus AnalyticsFilterBar.tsx:268-270 give the dropdown path. parse-crm-analytics-filter.util.ts:151-152, useCrmAnalyticsSeries and AnalyticsContent do not normalise the pair. Line 751 evaluates undefined === 'UNMAPPED' as false, dimensions has 2 entries, line 766 returns null, and line 2266 returns the reason with no points. AnalyticsTrendSmallChart.tsx:99-100 and AnalyticsTrendStageChart.tsx:80-90 show the text. AnalyticsOverviewCharts.tsx:86-93 ignores unavailableReason, and AnalyticsFiguresRow.tsx:108-110 draws nothing under 2 values. The data exists: crm-analytics-snapshot.service.ts:46 stores 'position' rows by raw value. Same people: lines 282-284 and 292 make the track condition redundant for an unmapped X, since X itself satisfies it. The contract does not settle this. Lines 492, 926 and 1132 only say one dimension at a time. The code comment at line 748, spec lines 1774-1777, integration metrics.cjs:455 and dataflow filters.cjs:57 all state that a program inside its track is one dimension, and contract line 72 makes UNMAPPED the track of an unknown position. No spec asserts refusal for the unmapped pair. seed/expected.mjs:1218-1222 counts any track plus program as two dimensions, but no seed check I found sends that pair. Duplicates of this bug: the snapshot[0], filter-sql[0] and config[1] entries, and review-notes.md line 15. Found by reading the code; not run.

**Suggested fix:** Compare with the fallback: (TRACK_KEY_BY_POSITION.get(filter.programKey) ?? UNMAPPED_CATEGORY_KEY) === filter.trackKey. Better, extract one helper shared with resolveSeriesTrackKeys (lines 2124-2126), which also maps NONE to NONE. { trackKey: 'NONE', programKey: 'NONE' } is API-only today, because program rows never carry key NONE and meta does not list it. The spec cases at lines 1780-1795 stay refused, and a mapped track paired with an unmapped program still returns null. Add to the spec at line 1774: { trackKey: 'UNMAPPED', programKey: 'LEGACY_POSITION' } reads position rows, and { trackKey: 'ROBOTICS', programKey: 'LEGACY_POSITION' } is refused.

## D73 [minor] SERVER (confirmed, from job-lifecycle)
File: `packages/twenty-server/src/modules/analytics/services/crm-analytics-sync.service.ts` line 233

**Problem:** hasDailyLogRow counts a daily row with status skipped as if the baseline had been taken. A workspace whose Stage field appears after a 02:30 tick therefore gets no baseline from its first working sync, and the date the field was fixed never gets a snapshot. Narrowed from the original finding: only the skipped case holds. The failed case is in refuted.

**Scenario:** A workspace is active with no Stage field, or one of the wrong type, and the crons are running. Sync rows close as skipped and never reach the daily check. At 02:30 the daily job writes a row with status skipped and reason NO_STAGE_FIELD. The field is fixed at 10:00. The 10:07 sync reads the timeline and closes ok, so the page state is READY, but hasDailyLogRow returns true and nothing is enqueued. daily_snapshot stays empty, and reconcile and reports do not run, until the next 02:30. That wait can be just under 24 hours, depending on when the field is fixed. The date of the fix gets no snapshot unless someone runs crm-analytics:run by hand. Impact is limited: no stored number is wrong, reconcile and reports catch up at 02:30, snapshot trends return null rather than 0, and the page shows the banner 'The daily count has not run yet. Trends and reports may be missing.' Reach: the field must be absent at a 02:30 tick before any non-skipped daily has run, so this affects a workspace added later or a rebuilt instance. It does not affect a production workspace that already has Stage when the crons start.

**Evidence:** Line 233 is `SELECT 1 FROM analytics.sync_log WHERE workspace_id = $1 AND job_name = 'daily' LIMIT 1`, with no status filter (current file, no uncommitted changes). crm-analytics-workspace-sync.job.ts:49-61 enqueues only when that returns nothing, and its comment says 'No daily row means a fresh database'. The skipped row comes from computeJobOutcome (sync.service.ts:268-275) and closeLogRow (line 121); crm-analytics-sync.service.spec.ts:661-673 and integration check Y12 show it being written. A skipped sync never reaches the check (spec lines 384-400). The only other enqueuers are the 02:30 cron and the manual command. The snapshot stamps now() as the local date (snapshot.service.ts:20-23, 56). The page state is computed at meta.service.ts:127-129. lastReconciliationAt reads only ok daily rows (meta.service.ts:167-174), which drives the banner in getAnalyticsDailyCountWarning.ts:14-15, rendered at AnalyticsContent.tsx:156-165. Contract line 234, the 'Fresh database' row, says 'enqueues the daily job if no `daily` log row exists, so the day-one baseline is taken at once'. The code follows that wording but misses its stated aim, and no contract row covers a skipped row followed by a fixed field, so this is a gap and not a decision. research/critique.md:31 calls the day-one baseline irreplaceable. The crons-registration entry in review-unverified-server.json reports the same line, so treat the two as one bug. Traced by reading the code; not run.

**Suggested fix:** Add `AND status <> 'skipped'` to the query at line 233. Running and failed rows still count, so nothing is enqueued twice and the contract's retry rule stays as it is. A workspace with no Stage field never reaches the check, so it does not loop. Add a spec assertion on that SQL, since the existing mock ignores status. Update the comment at crm-analytics-workspace-sync.job.ts:49 and reword contract line 234 in both copies. Do not use the daily_snapshot check the finding suggested: a workspace with no people inserts no snapshot rows (contract line 388), so sync would enqueue a full daily every 15 minutes forever on the concurrency-1 workspaceQueue. Do not add a retry for failed rows, for the reason given in refuted.

## D74 [minor] SERVER (confirmed, from config)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsTrendStageChart.tsx` line 138

**Problem:** The 'People in each stage over time' chart labels a sum as 'Total', but that sum covers only the 11 MAIN and EXIT stages. The same sum sets the column height and is printed above wide columns. The card's note never says that Interested, unmapped and no-stage people are left out, so the figure reads below the real total. Correction to the original finding: the series list itself is not a defect, because the redesign specifies it. The defect is the word 'Total' and the missing note.

**Scenario:** A day's snapshot has 500 people: 300 in MAIN stages, 60 in exits, 90 in INTERESTED (the three follow-up forms set this) and 50 on an unmapped raw value. The stacked column and its tooltip read 'Total 360', and 360 is also printed above the column when slots are at least 40px wide. The Total contacts small chart on the same Trends tab reads 500. Nothing on the card explains the 140 people missing. A person reset to INTERESTED by a form also shrinks the column with no explanation.

**Evidence:** Traced by reading the code; not run. AnalyticsTrendStageChart.tsx:105-119 sums the segments, line 138 labels the sum Total, and the note at line 155 does not mention the omitted people. AnalyticsColumnChart.tsx:155, 193, 266 and 279 use the same sum for height and the printed label, shown when slotWidth >= 40 (line 204). crm-analytics-series-stages.constant.ts:3-5 gives 8 MAIN + 3 EXIT = 11 stages, mapped at crm-analytics-metrics.service.ts:2101. readSnapshotBuckets lines 2474-2476 limit STAGE_COUNT to one stage_key. TOTAL_CONTACTS has no stage condition, because AnalyticsTrendsTab.tsx:180 forces status ALL, and 'all' snapshot rows hold every raw stage including '' (crm-analytics-snapshot.service.ts:38). What the contract settles: dashboard-redesign.md:135 says 'STAGE one series per main stage plus exit stages', and crm-analytics-metrics.service.spec.ts:2437 asserts INTERESTED is left out, so the constant is correct. Contract line 472 'so they sum to total contacts' describes Overview stage totals, not this chart. No contract or redesign text asks for a Total row or settles its meaning. Severity lowered from major: each stage's number is correct, the true total is on the same tab, and only this chart requests STAGE (reports and the PDF do not). The gap can still be wide at launch, since FLOLABS.md:56 says 25 stages against 13 mapped raw values, and the provisional banner (AnalyticsContent.tsx:166-168) does not explain this chart.

**Suggested fix:** Leave CRM_ANALYTICS_SERIES_STAGES as it is. At line 138 rename the row, for example t`Total in these stages`, and add a sentence to the note at line 155, such as 'Interested, unmapped and no-stage people are not shown.' If the user wants columns that add up to Total contacts, that is a design change to confirm first: also request TOTAL_CONTACTS with the same filter and draw the difference as one gray segment. No existing test asserts the Total wording on this card.

## D75 [minor] SERVER (confirmed, from config)
File: `packages/twenty-server/src/modules/analytics/services/crm-analytics-metrics.service.ts` line 751

**Problem:** resolveSnapshotDimension treats a program as implying its track only for positions in the config. An unmapped position under the Unmapped track therefore counts as two dimensions, so snapshot metrics return unavailable even though the position snapshot rows exist and answer the filter exactly.

**Scenario:** A CRM position LEGACY_POSITION is not in the config. On Tracks & sources, the user clicks the Unmapped row, which sets trackKey 'UNMAPPED' and shows its programs, then clicks LEGACY_POSITION. The filter becomes { trackKey: 'UNMAPPED', programKey: 'LEGACY_POSITION' }. TRACK_KEY_BY_POSITION.get returns undefined, which differs from 'UNMAPPED', so isTrackImplied is false, dimensions has 2 entries and the function returns null. TOTAL_CONTACTS, ACTIVE_PEOPLE and STAGE_COUNT return SNAPSHOT_FILTER_COMBINATION. The Trends small charts and the stage chart say 'Stored daily counts use one category at a time. Keep only one of Track, Program or Source.' The Overview sparklines for those metrics go blank. The same click on a mapped program draws its lines. Removing the Track chip also draws them, so a workaround exists.

**Evidence:** Traced by reading the code; not run. Lines 749-751 compare only the map result, and the map at lines 172-179 holds configured positions only. Line 765 returns null, and lines 2265-2267 return the reason. How the filter is reached: category_member gives unmapped positions parent_key UNMAPPED (lines 506, 528); getAnalyticsCategoryChartRows.ts:19-23 shows program rows once a track is set; getAnalyticsCategoryClickFilter.ts:24 sets trackKey to row.parentKey and programKey to row.key. Catch-all rows stay clickable because AnalyticsHorizontalBarChart.tsx:230-231 handles every row and AnalyticsCategoryCharts.tsx:359-361 passes onRowClick with the divided rows. crm-analytics-meta.service.ts:264-270 with AnalyticsFilterBar.tsx:268-270 offers the same pair once Unmapped is chosen. One page-wide filter (AnalyticsContent.tsx:63) carries it to AnalyticsTrendSmallChart.tsx:99-100, AnalyticsTrendStageChart.tsx:88-89 and the sparkline requests at AnalyticsOverviewCharts.tsx:33-38. The data exists: crm-analytics-snapshot.service.ts:46 stores 'position' rows by raw value. The contract does not settle it: lines 72 and 373 put unknown positions under track UNMAPPED, so the program does imply its track. Line 492's 'one dimension only' does not forbid this, and the code comment at line 748 states the implied-track rule. resolveSeriesTrackKeys at lines 2124-2126 already has the fallback. No test pins the current result: spec lines 1774-1783 cover mapped programs only. Not in large-review-findings.md. The same bug is reported under the snapshot, filter-sql and trends keys.

**Suggested fix:** Move the expression at lines 2124-2126 into one module-level helper: programKey === NONE_CATEGORY_KEY ? NONE_CATEGORY_KEY : (TRACK_KEY_BY_POSITION.get(programKey) ?? UNMAPPED_CATEGORY_KEY). Use it in both resolveSeriesTrackKeys and isTrackImplied. Do not use the '?? UNMAPPED' fallback alone, because { trackKey: 'UNMAPPED', programKey: 'NONE' } would then read the no-position rows for a filter that matches nobody. The NONE and NONE pair becomes implied too, though only a direct API call can send it: the page never sets programKey to NONE. Add spec cases: { UNMAPPED, raw position } reads the position rows, and { UNMAPPED, mapped position } is still refused.

## D76 [minor] SERVER (confirmed, from periods)
File: `packages/twenty-server/src/modules/analytics/services/crm-analytics-metrics.service.ts` line 1367

**Problem:** resolveNewApplicationRanges uses a future dateTo as the end of the range. dayCount (line 1373) then includes days that have not happened, so a count that can only run to today is compared with a full previous span of the requested length.

**Scenario:** Tracking start 2026-10-27, zone UTC, viewed on 2026-12-08. In the filter bar pick Custom dates, set From to Dec 1 and To to Dec 31. Computed with the real date library: current Dec 1 to Dec 31, dayCount 31, previous Oct 31 to Nov 30. The previous span starts after tracking start, so neither hasRangeStartedBeforeTracking nor getFiguresWithTrackedPrevious nulls it. With 20 applications in the 8 elapsed days and 120 in the 31-day span, the tile reads '20', 'Dec 1 to Dec 31', '-100 against the previous period', a fall caused only by the unfinished range. Correction to the reported scenario: a range wholly in the future does not show '0 against a real count' on the page. The API returns those numbers, but no person is created in the future, so totalContacts is 0 and AnalyticsOverviewTab.tsx:96 shows the 'No people match these filters' panel instead of the tile. Reach is limited: all presets end today and Custom starts with To set to today, so the user has to pick a later To date by hand. Frozen reports are not affected, because crm-analytics-report.service.ts:231 passes its own finished ranges to computeNewApplications.

**Evidence:** Line 1367 is `const to = dateTo ?? context.localToday`, and lines 1373-1380 build the previous span from it. Nothing clamps the date earlier: parseCrmAnalyticsFilter only rejects dates after 2100-12-31 (parse-crm-analytics-filter.util.ts:27,124), the resolver passes the result straight through, and AnalyticsFilterBar.tsx:280-282 and 351-357 set no upper limit and no max on the To date. The tile subtracts the two values with no partial marker (AnalyticsFiguresRow.tsx:160-164, shown at 208-212). The trend path for the same filter does clamp (compute-crm-analytics-report-periods.util.ts:131, with the spec 'does not run past today, even with a later date filter' at compute-crm-analytics-report-periods.util.spec.ts:335), and the page withholds this same subtraction for a running trend period (summarizeAnalyticsTrendSeries.ts:160-161, AnalyticsTrendTable.tsx:110-118). Contract check: section 6 line 470 says 'Previous is the equal-length span before', which the code applies literally to the requested range, but it does not address a filter running past today, and neither 'Decisions from testing' nor dashboard-redesign.md has an entry for it. L23 in large-review-findings.md only stopped the far-future SQL error by adding the maximum date, so this is not already handled. No unit spec covers a future dateTo on Overview. This is the same bug as the first entry under 'overview' (rated major there) and the line 1367 entry under 'metrics-entry', so count it once. Traced by reading the current code at 405c185e and computing the ranges with temporal-polyfill; the page was not run.

**Suggested fix:** Clamp `to` to localToday only when the range has already started: compute the requested end and `from` as now, then use localToday as `to` when the requested end is later than localToday and `from` is not after localToday, before computing dayCount. In the scenario that gives current Dec 1 to Dec 8 and previous Nov 23 to Nov 30, which is still an equal-length span, and AnalyticsOverviewTab.getFiguresWithTrackedPrevious recomputes from the returned dates, so it follows. Do not apply the reported fix as written ('keep from no later than to') to a wholly future range: it turns Jan 1 to Jan 31 into Dec 8 to Dec 8 (checked), which counts today's submissions for a January filter, also through getCategories at line 825, and fails blackbox/responses.test.mjs:548-549, which expects a far-future range to come back unchanged. Leave that range as requested. Add a spec with a dateTo after localToday, and record the rule in 'Decisions from testing', since contract line 470 does not mention it.

## D77 [minor] SERVER (confirmed, from report)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsMovementTable.tsx` line 29

**Problem:** In a frozen report the movement table heads the stored countNow column 'Now', but the value is the stage count at generated_at and stays fixed after that, so the heading is wrong on any later day. The web report never explains this for that column, although the PDF does and the web report's other at-generation cards do.

**Scenario:** Tracking start 2026-10-27, zone UTC. November is the first complete month, so the 02:30 daily job on 2026-12-01 builds and stores it with, say, Contacted countNow = 120. A reader opens that report on 2027-02-15 and clicks 'Show numbers' on 'What moved this period?'. The row reads 'Contacted, Entered 40, Left 35, Now 120', while the live count may be 300, which is what the Trends tab's 'Now' column shows. A report built late shows the same problem differently: a backfilled report or a provisional rebuild pairs an old period's moves with the count from the build day, still headed 'Now'. No stored number is wrong; only the heading misdescribes it.

**Evidence:** Traced by reading only; nothing run, as instructed. Value never refreshes: crm-analytics-report.service.ts:122-129 returns the stored payload unchanged, and crm-analytics.resolver.ts:179-185 and useCrmAnalyticsQuery.ts:40 pass it through. Value is taken at build: report service lines 237-241 and 282 store computeMovement rows, and crm-analytics-metrics.service.ts:1203-1208 and 1228 read count_now from live scope. Lines 190-194 overwrite a stored row only for a provisional to confirmed rebuild, and lines 161-174 treat those rows as missing once the config flips. Timing: compute-crm-analytics-report-periods.util.ts:188-215 makes November the first month and builds it when periodEnd <= localToday; the cron is '30 2 * * *' and the daily job builds reports at crm-analytics-workspace-daily.job.ts:130-139. Callers: AnalyticsReportView.tsx:511 passes rows={report.movement} and the component has no heading prop. The only other caller, AnalyticsTrendsTab.tsx:363, gets live rows (metrics service line 2006), so 'Now' is right there. Wording: the card note at AnalyticsReportView.tsx:509 does not mention it. The sibling at-generation cards at lines 462 and 527 say 'as of when this report was made', and AnalyticsPdfTrendsSection.tsx:288 says 'In stage now is when this report was generated.' Correction to the finding: the page is not wholly silent. AnalyticsReportView.tsx:404-406 says 'It stays as generated' on confirmed reports, but that is not tied to this column. Provisional reports, which is the current config (crm-analytics-config.constant.ts:38 isProvisional true), show only 'Generated {date}.' The table is also closed by default behind 'Show numbers' (AnalyticsChartCard.tsx:171 and 242). These are why it stays minor. Contract: contract.md:503 settles the value ('Current state at generated_at'), not the heading. Section 8 line 901 lists 'now' for the Trends movement view only, line 902 says the report viewer reuses 'the shared tables', dashboard-redesign.md:77 says reports reuse the same charts, and 'Decisions from testing' covers only the provisional rebuild. An optional heading prop keeps the table shared. Not listed in large-review-findings.md. The same bug appears again in the review file under 'series-cohort-movement' at the same line, so count it once.

**Suggested fix:** Add an optional prop to AnalyticsMovementTable, for example countHeading?: string, and render {countHeading ?? t`Now`} at line 29. Pass t`At report time` from AnalyticsReportView.tsx:511 and leave AnalyticsTrendsTab.tsx:363 unchanged. No report test asserts this heading, and analytics-contract.pw.ts:373 asserts 'Now' only on Trends, so it stays valid. Adding the PDF's sentence to the note at AnalyticsReportView.tsx:509 is a weaker alternative, because that note is a tooltip behind an info icon (AnalyticsChartCard.tsx:217-222) and the column would still read 'Now'.

## D78 [minor] CHARTS (unverified, from U06-bar-charts)
File: `packages/twenty-front/src/modules/crm-analytics/charts/AnalyticsHorizontalBarChart.tsx` line 246

**Problem:** The tooltip closes only from a row's own pointer leave or blur. Clicking a row can unmount that row, and the tooltip then stays on screen showing the removed row's numbers.

**Scenario:** Tracks view of Categories with 5 tracks. Click the fifth row, which has 2 programs. When the response arrives the chart stays mounted, and getAnalyticsCategoryChartRows swaps the rows to the 2 programs with new keys, so the clicked row unmounts. No leave event reaches the unmounted row, activeTooltip stays set, and the pointer now rests on empty space below the 2 rows. The old tooltip ('Click to see its programs', old counts) remains even after the pointer leaves the card, until another row is hovered and left. The same happens from the keyboard: Enter removes the focused row, and blur may not run. Also, a tooltip open while any refetch lands keeps the content captured at pointer enter.

**Evidence:** Lines 244-248 are the only handlers that close it, and activate on line 231 does not hide it. useAnalyticsChartTooltip.tsx:72 holds state in the chart, above the rows, and stores the content object. StyledRoot (line 284) has no leave handler. Row keys are row.key (line 235). Found by reading; not run in a browser.

**Suggested fix:** Call hideTooltip inside activate before onRowClick, and add onPointerLeave={hideTooltip} on StyledRoot as a backstop.

## D79 [minor] CHARTS (unverified, from U06-bar-charts)
File: `packages/twenty-front/src/modules/crm-analytics/charts/AnalyticsColumnChart.tsx` line 102

**Problem:** Stacked bars can draw longer than their value. Each segment has a 2px minimum and a 2px gap, and neither is limited by the bar's true length, so short stacks overflow it. The horizontal chart has the same rule (AnalyticsHorizontalBarChart.tsx:88 and 94).

**Scenario:** 'People in each stage over time': an early bucket has total 8 across 4 stages and a later one has 600, so axisTop is 600 and the plot is 199px. The true height is 8/600 x 199 = 2.7px. The drawn stack is 4 x 2 + 3 x 2 = 14px, which reads as about 42 people on the axis, and the '8' label is anchored at the 2.7px line, so it overlaps the stack. Horizontal case: People bars with active 1 and not active 1 on a scale of 1000 with a 200px track are 0.4px true, 6px drawn. Also, a full 13-stage column loses 24px of 199 to gaps, so segment heights are about 12% short against the axis.

**Evidence:** Column: line 266 sets the height, line 94 gap: 2px, line 102 min-height: 2px, line 101 flex-basis: 0, and line 93 column-reverse sends overflow upward. StyledColumnValue line 112 uses bottom: 100% of the undersized column. Horizontal: lines 88 and 94 with the width on line 256. Arithmetic from the CSS; not rendered.

**Suggested fix:** Skip the gap and minimum when the bar is too short to hold them, for example draw a single 2px sliver for the whole stack below a pixel threshold, and put separators inside the segments so gaps do not take length.

## D80 [minor] CHARTS (unverified, from U06-bar-charts)
File: `packages/twenty-front/src/modules/crm-analytics/charts/AnalyticsHorizontalBarChart.tsx` line 166

**Problem:** Rate bars use the largest rate in view as the end of the scale, with no axis. The highest rate always fills the track, and the same rate changes length when a filter changes.

**Scenario:** 'Which converts best?' with a track filter leaving one measured program at 3%: the bar fills the whole width, the look of complete conversion, with only the '3%' text saying otherwise. Beside it, 'Conversion at each step' draws 3% as a sliver because it uses a 0 to 100% scale. A 6% group is a quarter of the track next to a 24% group, then the full track once the filter leaves it alone. The report's 'Which track converts best?' does the same.

**Evidence:** Line 166 takes the maximum of all row totals and line 224 uses it as the scale, and the component has no maxValue prop. Rate callers AnalyticsCategoryCharts.tsx:370 and AnalyticsReportView.tsx:495 pass raw fractions as segment values. AnalyticsColumnChart has maxValue, and both step-rate callers pass maxValue={1}. dashboard-redesign.md line 55 does not set a scale, so this is a judgement call on the requirement that bar lengths be true.

**Suggested fix:** Add an optional maxValue prop to the horizontal chart, used as the scale when given, and pass maxValue={1} from both rate charts.

## D81 [minor] CHARTS (unverified, from U04-chart-foundation)
File: `packages/twenty-front/src/modules/crm-analytics/charts/useAnalyticsChartTooltip.tsx` line 72

**Problem:** The tooltip stays on screen with old numbers when a click replaces the mark under it. The hook stores a snapshot of the content and clears it only on pointer leave or blur, and neither arrives for a removed element.

**Scenario:** On Tracks & sources, press Enter on a focused track row, or click it and keep the pointer still. The filter sets trackKey, and when the response arrives getAnalyticsCategoryChartRows swaps in program rows, so the clicked row's key is gone. Its onBlur and onPointerLeave never run. The tooltip with the old track's title and counts then sits over the new program bars. It stays until the pointer enters and leaves another mark, and a keyboard user may never do that. If the row survives (Sources view, same key), its tooltip keeps the old 'Click to filter the page.' hint although the row is now selected. Traced by reading the code; not run.

**Evidence:** AnalyticsHorizontalBarChart.tsx:231 `activate` and AnalyticsScatterChart.tsx:277 call the click handler without hiding the tooltip. Hiding happens only at HorizontalBar:245 and 248 and Scatter:303 and 306. React turns its event system off during commit, so a focusout fired while the row is removed never reaches onBlur. No pointerout is delivered to a removed node either. AnalyticsCategoryCharts.tsx:355-383 and getAnalyticsCategoryChartRows.ts show the rows change on the click. The chart stays mounted because useCrmAnalyticsQuery keeps previous data, so activeTooltip survives.

**Suggested fix:** Call hideTooltip() inside `activate` before onRowClick or onPointClick in both charts.

## D82 [minor] CHARTS (unverified, from U04-chart-foundation)
File: `packages/twenty-front/src/modules/crm-analytics/charts/useAnalyticsChartTooltip.tsx` line 49

**Problem:** Tooltip placement checks only the chart card's box, not the scrolling page body. On a card that runs past the fold, a tooltip can be placed below the visible area and clipped completely.

**Scenario:** On a laptop, the Overview tab's 'Where is everyone now?' card has many stage rows. The body's bottom edge is at y=600 and the card ends at y=900. Hover the last visible row at y=590 with a tooltip 110px tall. afterPointer is 602, and 602+110 <= 892, so it counts as fitting and is placed at y=602. That is entirely below the body's edge, so nothing shows until the user scrolls, despite the rule that every mark has a tooltip.

**Evidence:** Lines 49-51 take bounds from closest('[data-analytics-chart-card]') only, and getTooltipStart flips above the pointer only against that bound. AnalyticsChartCard is position: relative, so it is the tooltip's containing block, and it sits inside AnalyticsContent.tsx:47-52 StyledBody with overflow-y: auto, which clips it.

**Suggested fix:** Intersect the bounds with the nearest scrolling ancestor's rect and the viewport, so the tooltip flips above the pointer when it would pass the visible bottom.

## D83 [minor] CHARTS (unverified, from U04-chart-foundation)
File: `packages/twenty-front/src/modules/crm-analytics/charts/AnalyticsColumnChart.tsx` line 203

**Problem:** The x-label stride blanks labels to make room, but each kept label is still limited to one slot's width. On dense charts the kept labels break into cut-off fragments.

**Scenario:** On Trends, By week, 'People in each stage over time' is a half-width card with 26 buckets. At a chart width of about 508px, plotWidth is 464, slotWidth about 17.8 and stride 4. Each fourth label such as 'Aug 3' gets a box of about 16px, with overflow-wrap: anywhere and a 2-line clamp, so it shows roughly 'Au' / 'g…'. Blanking the other labels gains no room, and the date cannot be read from the axis.

**Evidence:** StyledXLabel (lines 142-153) is flex: 1 1 0 with min-width: 0, overflow: hidden, overflow-wrap: anywhere and -webkit-line-clamp: 2. Lines 301-304 render every column's span, with '' for the blanked ones, so all spans have equal width. X_LABEL_WIDTH_IN_PX (64) is used only to compute the stride. The card at AnalyticsTrendStageChart.tsx:153 is not isFullWidth. The label comes from formatAnalyticsBucketLabel with isCompact, 'Aug 3'.

**Suggested fix:** Let a kept label span its stride, for example flex-grow: stride on it with the blanked spans dropped, or position it absolutely with white-space: nowrap, centered on its slot.

## D84 [minor] PAGE (unverified, from U12-category-builders-scatter)
File: `packages/twenty-front/src/modules/crm-analytics/utils/getAnalyticsCategoryChartRows.ts` line 19

**Problem:** The level to draw is chosen from the new filter, but the rows can still be the previous response. While the track click refetches, every program of every track is drawn and used for the answer cards.

**Scenario:** Tracks and programs tab with no filter, 5 tracks and 39 positions. Click track AI. filter.trackKey is AI at once, but categories is still the unfiltered payload. programRows holds all 39 programs, so bars, heatmap, scatter and 'Largest' or 'Best converting' show programs from other tracks until the response returns (page reads can take seconds). Clicking one of those rows then sets a different track.

**Evidence:** useCrmAnalyticsQuery.ts:32 returns data ?? previousData. AnalyticsCategoriesTab.tsx:117-122 passes the retained categories with the current filter. Server computeCategories (metrics service 1155-1163) lists programs under every track when unfiltered. Contract 'Decisions from testing' says rows are limited to the chosen track. L19 is the same class of bug for period labels, not this one.

**Suggested fix:** Choose the level from the rows the payload holds, for example show programs only when the payload has a single top-level track, or return the applied filter in the payload and compare against it rather than the live filter.

## D85 [minor] CHARTS (unverified, from U12-category-builders-scatter)
File: `packages/twenty-front/src/modules/crm-analytics/charts/AnalyticsScatterChart.tsx` line 277

**Problem:** Clicking a point that the new data replaces leaves its tooltip on screen. The tooltip hides only on pointer leave or blur, and a removed element fires neither.

**Scenario:** Hover the AI point and click it. The filter applies, the response arrives, and the track points unmount in favour of program points. activeTooltip stays set, so the AI tooltip with its old numbers and 'Click to see its programs.' stays over the chart until the pointer enters and leaves another point. Points are small, so it can stay for a long time.

**Evidence:** activate at line 277 only calls onPointClick. useAnalyticsChartTooltip.tsx:104 clears state only through hideTooltip, wired at lines 303 and 306. The chart stays mounted through the refetch, so the hook state survives (AnalyticsCategoriesTab.tsx:115-123). Shared note from U04-chart-foundation confirms the snapshot behaviour.

**Suggested fix:** Call hideTooltip inside activate before onPointClick, and do the same for the bar chart row at AnalyticsHorizontalBarChart.tsx:231.

## D86 [minor] CHARTS (unverified, from U12-category-builders-scatter)
File: `packages/twenty-front/src/modules/crm-analytics/charts/AnalyticsScatterChart.tsx` line 141

**Problem:** The Y scale is set by the highest rate of all points, including small samples, so one tiny group can squash every reliable group against the axis.

**Scenario:** Tracks at 8%, 6% and 5% with 100 or more people each, plus a group with overallEligible 1 at 100%. yTop becomes 1 (ticks 0, 25, 50, 75, 100%). With a 240px plot the three real groups sit 19, 14 and 12px above the axis, so they nearly overlap and 6% and 5% are only 2.4px apart. Their 14px-high labels can collide and be dropped by the greedy placement. Without the small group the axis would be 0 to 10% and they would spread over about 70px.

**Evidence:** Lines 140-143 use Math.max over all plotted y values, with no isSmallSample filter. Points get isSmallSample in AnalyticsCategoryCharts.tsx:323. L9 reports the same fault for the heatmap only.

**Suggested fix:** Compute maxValue from points that are not small samples, falling back to all points when none qualify, and clamp or mark any small-sample point above the top.

## D87 [minor] PAGE (unverified, from U12-category-builders-scatter)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsCategoryCharts.tsx` line 318

**Problem:** 'No position', 'No source' and unmapped rows are plotted on the scatter in the same accent as real groups and move both median lines. Everywhere else they are kept apart so they never rank against real groups.

**Scenario:** Real tracks at 40% (200 people) and 30% (100 people), 'No position' at 2% (500 people), Unmapped at 1% (40 people). The rate median of the 4 points is 16% against 35% for the real tracks, and the people median moves too. The reader cannot tell which points are real groups, and the 'big but weak' reading is taken against a line set by rows that are not groups.

**Evidence:** Line 318 builds scatterPoints from [...groupRows, ...catchAllRows]. AnalyticsScatterChart has no property for a catch-all point and computes medians from every plotted point at lines 155-156. buildAnalyticsCategoryBarRows.ts:20 states catch-all rows never rank against real groups, and buildAnalyticsCategoryAnswers.ts:41 excludes them.

**Suggested fix:** Leave catch-all rows out of the medians and draw them in gray, or leave them off the scatter and count them under it.

## D88 [minor] PAGE (unverified, from U12-category-builders-scatter)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsCategoryCharts.tsx` line 395

**Problem:** With a status filter on, the scatter and answer cards mix a filtered count with an unfiltered rate and do not say so, although the contract requires saying so where rates show.

**Scenario:** Status = Left on Tracks & sources. Scatter X counts only people who left, while Y is the whole cohort's conversion. A track where no one has left still gets a point at x = 0 with the tooltip 'People 0, Overall conversion 40%, Out of 120 people'. 'Best converting' can also name that track, although the page shows it has 0 people in this view. Only the 'Which converts best?' note carries the disclaimer.

**Evidence:** readFunnelGroups uses withoutStatusFilter (metrics service 1769) while readCategoryPeople does not. computeCategories (1108-1112) builds rows from the union of people and funnel keys, so a 0-people row with a rate exists. 'Rates ignore the status filter.' appears only in rateNote at line 260, per a grep across crm-analytics. Contract 'Decisions from testing', Status filter: 'says so where other rates show'.

**Suggested fix:** Add the same sentence to the scatter and heatmap notes and to the answer cards when filter.status is not ALL. Consider excluding rows with people 0 from the scatter and Best converting while a status filter is on.

## D89 [minor] PAGE (unverified, from U12-category-builders-scatter)
File: `packages/twenty-front/src/modules/crm-analytics/utils/buildAnalyticsCategoryAnswers.ts` line 51

**Problem:** 'Best converting' names a winner when there is nothing to win: every qualifying group at 0%, or only one group in view. The PDF takeaway does the same.

**Scenario:** Three tracks with overallEligible 40, 35 and 30, and no one signed yet, which is likely soon after launch. The card reads 'Best converting 0%, AI, of 40 people', chosen only because it comes first in server order. The PDF says 'AI is largest; AI converts best, 0%.' With a single source or program filter, the only row in view is also called best. Likewise 'Biggest drop' reads 0% when every qualifying step is 100%.

**Evidence:** The reduce at lines 56-61 keeps the first row on ties, with no check that the rate is above 0 or that another group qualifies. buildCategoriesTakeaway.ts:42-57 uses the same logic through pickHighestRow. The chart rows come from getAnalyticsCategoryChartRows, which returns one row under a single filter.

**Suggested fix:** Require a best rate above 0 and at least two qualifying groups, otherwise show a dash with a plain reason such as 'No group stands out yet'. Apply the same rule in buildCategoriesTakeaway, and hide 'Biggest drop' at 0%.

## D90 [minor] PAGE (unverified, from U12-category-builders-scatter)
File: `packages/twenty-front/src/modules/crm-analytics/utils/buildAnalyticsCategoryAnswers.ts` line 44

**Problem:** 'Largest' accepts any group with at least one person, while the PDF takeaway for the same rows requires the minimum sample. The page and the PDF can give opposite answers.

**Scenario:** A narrow date filter, or a small workspace, leaves tracks with 3 and 2 people and minimumSample 30. The card says 'Largest: 3 people, AI', although Best and Biggest drop say there are not enough people. For the same rows, buildCategoriesTakeaway returns 'Not enough people in any group to compare yet.'

**Evidence:** Line 44 filters on row.people > 0. buildCategoriesTakeaway.ts:32 filters on row.people >= minimumSample. The review plan's focus for this unit says a too-small row must not be named largest. An existing test ('never names the no-value or unmapped rows') expects 'Ads' with 10 people, so a fix must update it.

**Suggested fix:** Pick one rule for both builders. Either apply minimumSample to Largest and show the people count only in the bars, or relax the takeaway so it names the largest group as the card does.

## D91 [minor] PAGE (unverified, from U12-category-builders-scatter)
File: `packages/twenty-front/src/modules/crm-analytics/utils/buildAnalyticsCategoryAnswers.ts` line 82

**Problem:** When only catch-all rows are in view, all three cards say there are not enough people, even when many people are shown directly below.

**Scenario:** Click the 'No position' row. trackKey becomes NONE and the server returns only the NONE row, with for example 500 people. groupRows is empty, so all three cards show a dash and 'Not enough people in any group to compare yet', while the bar below it reads 500. The same happens when filtering to an unmapped raw source or to the Unmapped track.

**Evidence:** Line 41 removes catch-all rows and line 82 is the only fallback text. Server scope (metrics service 278-284) accepts trackKey NONE, and buildCategoryMemberCtes keeps the NONE row. getAnalyticsCategoryChartRows.ts:29 returns that one row, and AnalyticsCategoryCharts.tsx:358-359 draws it.

**Suggested fix:** When rows contains people but groupRows is empty, use a different line such as 'These people have no position or an unmapped one, so there is no group to compare', or hide the cards.

## D92 [minor] PDF (unverified, from U14-trend-cards)
File: `packages/twenty-front/src/modules/crm-analytics/utils/buildAnalyticsReportTrendCharts.ts` line 81

**Problem:** The on-screen report's gray line is one whole window back, but no label is built for it, so it shows the chart default 'Previous period'.

**Scenario:** In a monthly report for Nov 2027, New applications has 12 buckets. The gray value at Nov 2027 is Nov 2026, yet the legend and tooltip call it 'Previous period'. The card below, 'Compared with the previous period', means Oct 2027. A reader takes a year-ago number as last month's.

**Evidence:** computeCrmAnalyticsTrendBuckets sets previousBucketStart to start minus bucketStarts.length, and DEFAULT_TREND_BUCKET_COUNTS is 12 for WEEK and MONTH. AnalyticsReportTrendChart has no previousLabel field, AnalyticsReportView passes none, and AnalyticsLineChart falls back to t`Previous period` (lines 279, 344). The Trends tab passes `${windowLength} before` (AnalyticsTrendSmallChart.tsx:171), and the PDF uses 'The 12 months before' (AnalyticsPdfTrendsSection.tsx:112). The [U15-reports] note reports the same gap from the view side.

**Suggested fix:** Return previousLabel from buildAnalyticsReportTrendCharts using getAnalyticsWindowLength(points.length, report.periodType), and pass it to AnalyticsLineChart in AnalyticsReportView.

## D93 [minor] PDF (unverified, from U14-trend-cards)
File: `packages/twenty-front/src/modules/crm-analytics/utils/buildAnalyticsReportTrendCharts.ts` line 47

**Problem:** The on-screen report titles the DROP_OFF line 'Drop-off rate over time', but the series covers only the entry stage. The title and note do not name the stage.

**Scenario:** A report shows 'Drop-off rate over time' at 40%. That is the share who did not move on from New within its 14 day window. A reader takes it as pipeline-wide drop-off. The PDF of the same report says 'Drop-off from New over time'.

**Evidence:** computeReportSeries resolves DROP_OFF with no stage to ENTRY_STAGE_KEY (resolveTrendStageKey). The builder receives stageKey at line 60 and uses it only in the React key. AnalyticsPdfTrendsSection.tsx:450 and AnalyticsTrendsTab getSmallChartTitle both name the stage.

**Suggested fix:** Find the stage label through report.funnel.rows by stageKey and title it t`Drop-off from ${label} over time`, as the PDF does.

## D94 [minor] PAGE (unverified, from U14-trend-cards)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsTrendTrackCharts.tsx` line 131

**Problem:** With a program filter on, the 'by track' cards draw one line named after the whole track, but its values cover only the chosen program.

**Scenario:** Filter to the Robotics track and the program Robotics Engineering Intern. The card 'New applications by track' draws one line labeled 'Robotics & Intelligent Systems' with value 12, and the tooltip row says the same, while the whole track has 200. The number table header also names the track.

**Evidence:** resolveSeriesTrackKeys returns the track key, and buildSeriesGroups (crm-analytics-metrics.service.ts:2088-2090) keeps filter with its programKey for the query. groupLabel stays the track label from buildCategoryLabel. The front end uses groupLabel for the line and for the column in AnalyticsSeriesTable.

**Suggested fix:** When programKey is set, use the program's label as groupLabel in buildSeriesGroups, or have the card show the selected program's label.

## D95 [minor] PAGE (unverified, from U14-trend-cards)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsTrendTable.tsx` line 248

**Problem:** A New applications bucket that straddles tracking start shows its partly tracked count as a normal value, with no marker in the table or on the line. Only the bucket holding today is tagged.

**Scenario:** Tracking starts 2026-10-27, By month. The Oct 2026 row reads 4 and Nov 2026 reads 120, with no tag on October. The small chart, the track line and the frozen report lines all draw October as a full month, so the chart shows a steep climb that comes from when tracking began.

**Evidence:** The server keeps the straddling value: readTrendValues nulls only bucketStart < firstTrackedBucketStart, and its comment says 'A bucket's own count may be partial'. isPartial is only start === currentBucketStart (compute-crm-analytics-report-periods.util.ts:161). getChange and the summary guard the previous value only. This is separate from L4, L5 and L15, which cover the comparison base. 'Decisions from testing' settles previous values, not how this value is shown.

**Suggested fix:** On the front end, use isAnalyticsPeriodFullyTracked(point.bucketStart, base) for running-count metrics to tag the row 'partly tracked' and draw that bucket lighter. Alternatively, send a flag on the point from the server.

## D96 [minor] PAGE (unverified, from U14-trend-cards)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsSeriesTable.tsx` line 88

**Problem:** The number tables behind the track and stage cards ignore point.isPartial, so the running current period reads as a finished one.

**Scenario:** On Wednesday, open 'Show numbers' on New applications by track, By week. The top row 'Week of Nov 2' shows 3 for a track, next to last week's 40, with no 'in progress' tag. The line chart above draws that segment lighter and its tooltip says 'So far', and AnalyticsTrendTable tags the same row.

**Evidence:** columns carry the full points, but renderValue and the row label use only bucketStart and value. AnalyticsTrendTable.tsx:248 renders StyledInProgress for the same case.

**Suggested fix:** Read isPartial from columns[0].points for the row and add the same 'in progress' tag beside the period label.

## D97 [minor] PAGE (unverified, from U14-trend-cards)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsTrendTable.tsx` line 131

**Problem:** The rate Change is computed from unrounded rates, while the two value cells beside it show rounded whole percents. The three numbers in a row can contradict each other, and a change of one prints as '+1 points'.

**Scenario:** Value 0.124 prints 12% and previous 0.116 prints 12%, yet Change reads '+1 points'. In the other direction, 0.125 prints 13% and 0.124 prints 12%, and Change reads '0 points'.

**Evidence:** Math.round(change * 100) uses the raw difference, while AnalyticsRateCell uses formatAnalyticsRate, which rounds to whole percents from 1% to 99%. Line 136 is a fixed t`${points} points` with no plural.

**Suggested fix:** Compute the change from the rounded percents shown (round each value, then subtract), and use plural for 'point' and 'points'.

## D98 [minor] PAGE (unverified, from U11-categories)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsCategoryCharts.tsx` line 78

**Problem:** Chart rows are chosen by combining the current filter with the previous filter's payload while a refetch runs, so the charts draw the wrong level and the wrong groups until the response arrives.

**Scenario:** No filters, so the payload holds 5 tracks and all their programs. Click the AI track. In that render filter.trackKey is AI_SOFTWARE but categories is still the old payload (data is undefined, previousData is used). getAnalyticsCategoryChartRows sees a track filter and program rows, so it returns every program of every track. For up to the 8 second page timeout, the bars, heatmap, scatter and the Largest, Best and Biggest drop cards rank programs from other tracks under a chip that says Track: AI. The rows are still clickable, so clicking a Finance bar sets trackKey to the Business track.

**Evidence:** useCrmAnalyticsQuery.ts:32 returns data ?? previousData. AnalyticsCategoryCharts.tsx:78 passes the new filter with the old categories. getAnalyticsCategoryChartRows.ts:19-23 only checks trackKey or programKey plus programRows.length. The answer cards use chartRows at line 344. The only cue is the 0.6 opacity at AnalyticsCategoriesTab.tsx:27. This differs from L18 and L19: there old numbers keep their rows, while here the row set itself is wrong.

**Suggested fix:** Choose the level from the filter that produced the payload. For example, keep the last settled filter in the view and pass it to AnalyticsCategoryCharts while isRefetching is true, or have the server echo the filter's trackKey and programKey in AnalyticsCategories.

## D99 [minor] PAGE (unverified, from U11-categories)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsCategoryCharts.tsx` line 111

**Problem:** A click that filters removes the hovered bar or point but never hides its tooltip, so the old tooltip stays on the chart.

**Scenario:** Hover the fifth track in 'How many people in each?' and click it. That track has two programs, so the chart shrinks to two rows and the pointer is now over blank space. No pointerleave reaches the removed row, and the root has no handler. The tooltip with the old track's title, counts and 'Click to see its programs.' stays over the card until another mark is hovered. Selecting a program, which shrinks the chart to one row, does the same, and so does pressing Enter on a focused row or a scatter point.

**Evidence:** useAnalyticsChartTooltip.tsx:104 hides only through hideTooltip. AnalyticsHorizontalBarChart.tsx:244-248 and AnalyticsScatterChart.tsx:300-306 call it only from blur and pointerleave on the mark. The charts stay mounted across the filter change, so activeTooltip survives. handleRowClick at line 106 changes the rows. Note U04-chart-foundation flagged the mechanism, and this confirms it is reachable from this tab.

**Suggested fix:** Have the chart call hideTooltip before onRowClick and onPointClick in activate, or clear the tooltip when the row keys change.

## D100 [minor] PAGE (unverified, from U11-categories)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsCategoryCharts.tsx` line 395

**Problem:** With a status filter on, only the 'Which converts best?' card says rates ignore it. The answer cards, heatmap, scatter and table show unfiltered rates and cohort counts beside status-filtered people counts, with no note.

**Scenario:** Pick Status = Left. A track shows People 12 (only those who left), but 'People who applied' 300 and Overall 18% (the whole cohort). The scatter plots x = 12 against y = 18%, and the Best converting card reads 18%. Nothing on those views says the rate covers more than the 12 people, so a reader takes 18% as the conversion of people who left, whose true conversion is 0.

**Evidence:** rateNote at lines 256-263 is passed only to the card at line 366. The heatmap note at line 382, scatter note at line 395, AnalyticsCategoryTable.tsx and buildAnalyticsCategoryAnswers have no status text. Server: readCategoryPeople keeps status, while readFunnelGroups applies withoutStatusFilter (crm-analytics-metrics.service.ts:1769). The contract's Decisions from testing says the page 'says so where other rates show'.

**Suggested fix:** Add 'Rates ignore the status filter.' to the heatmap and scatter notes and to the numbers table when filter.status is not ALL. Say it once above the charts if that is cleaner, so it also covers the answer cards.

## D101 [minor] PAGE (unverified, from U11-categories)
File: `packages/twenty-front/src/modules/crm-analytics/utils/buildAnalyticsCategoryAnswers.ts` line 82

**Problem:** When every shown row is a catch-all row, all three answer cards say there are not enough people, even if the row has hundreds of people and a measured rate.

**Scenario:** Click the 'No source' row, or an 'Unmapped: x' source, or the Unmapped track or 'No position'. chartRows is now only catch-all rows, for example 400 people and a 12% rate from 200 eligible. groupRows is empty, so Largest, Best converting and Biggest drop all show a dash and 'Not enough people in any group to compare yet', directly above a bar showing 400 people. The same happens with no filter if production position values do not match the provisional mapping, so every position lands in Unmapped.

**Evidence:** Line 41 removes catch-all rows, and lines 105-128 fall back to notEnoughPeople whenever the result is null. AnalyticsCategoryCharts.tsx:344 passes chartRows. isAnalyticsCatchAllRow.ts:6-7 matches NONE and every unmapped row, including the program rows under UNMAPPED.

**Suggested fix:** Keep catch-all rows out of the ranking, but when groupRows is empty and rows has people, use a different detail such as 'Only unmapped or empty values are shown', or hide the answer cards.

## D102 [minor] PAGE (unverified, from U11-categories)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsCategoriesTab.tsx` line 105

**Problem:** The empty check looks only at people, but category rows can also exist from new applications that are not limited by the date filter, so real application counts are replaced by 'No people match these filters'.

**Scenario:** Filter Last 7 days. Nobody was created in those days, but 3 imported people resubmit the Internship Application form, which updates the existing person. readCategoryPeople returns nothing because created_at is outside the range. readCategoryNewApplications returns counts, so rows exist with people 0 and newApplications above 0. every(people === 0) is true, so the tab shows the EMPTY panel with Reset filters, while Overview under the same filter shows New applications 3.

**Evidence:** crm-analytics-metrics.service.ts:1810-1814 scopes people with scopeDateRange. Line 1894 creates the new applications statement with no date on scope, and only submitted_at is limited (line 1905). Lines 1107-1111 merge those keys into rows. computeNewApplications at line 968 is the same unscoped count that Overview shows. Resubmission reuses the person per CLAUDE.md, citing public-form.service.ts:94-97.

**Suggested fix:** Treat the result as empty only when every row has people 0 and no newApplications above 0, for example rows.every((row) => row.people === 0 && (row.newApplications ?? 0) === 0).

## D103 [minor] PDF (unverified, from U16-pdf-shell)
File: `packages/twenty-front/src/modules/crm-analytics/report-pdf/utils/toAnalyticsPdfPrintableText.ts` line 37

**Problem:** Text is split into code points without normalizing first, so a separate combining mark is sanitized on its own. Stripping the mark leaves an empty string, which returns '?'. The base letter prints correctly, followed by a stray '?'.

**Scenario:** A position, source or stage label is stored in decomposed form (NFD, common when pasted from macOS), such as 'Résumé'. The PDF prints 'Re?sume?', although 'é' is in Windows ANSI and the precomposed form prints fine. An emoji with variation selector U+FE0F likewise gives two question marks.

**Evidence:** Array.from gives ['R','e','́',...]. For '́', isPrintable is false, NFKD keeps it, COMBINING_MARKS removes it, simplified.length is 0, so line 31 returns UNPRINTABLE_CHARACTER. I replayed this logic in node and got 'Re?sume?'. The spec only tests precomposed input ('Łódź').

**Suggested fix:** Normalize the whole string first: Array.from(text.normalize('NFC')). Also return '' rather than '?' when the character is only a mark.

## D104 [minor] PDF (unverified, from U16-pdf-shell)
File: `packages/twenty-front/src/modules/crm-analytics/report-pdf/utils/getAnalyticsPdfRowLabelLayout.ts` line 24

**Problem:** The layout adds LABEL_GAP to the widest label's estimate, and the charts subtract it again. Floating-point rounding can make the result slightly smaller than the estimate, so the widest label fails its own fit check and gets an ellipsis. Latent today: every configured stage label is below the affected width.

**Scenario:** A stage is renamed 'Waiting for second meeting date' once recruiting confirms the list. Its estimate is 120.40000000000005. labelWidth is 128.40000000000005, and the chart's maximumWidth = labelWidth - 8 is 120.40000000000003. The check at fitAnalyticsPdfLabel.ts:50 fails. The row height stays 13.5 or 14.5, so maximumLines is 1 and the label prints truncated, although the column was sized to fit it.

**Evidence:** I ran the same arithmetic in node, and that label failed the check. Of 14,362 random labels with estimates of 96 to 162 points, 640 failed. Rounding only occurs where the estimate and estimate + 8 fall in different binary ranges, so labels of about 120 to 128 points. Charts subtract the gap at AnalyticsPdfHorizontalBars, StackedBars and DivergingBars (maximumWidth={labelWidth - LABEL_GAP}). Callers are the funnel and trends sections.

**Suggested fix:** Add a small allowance to the fit check, such as estimate <= maximumWidth + 0.01 in truncateAnalyticsPdfLabel and wrapAnalyticsPdfLabel. Alternatively, have the layout return the text width and let charts use it directly.

## D105 [minor] PDF (unverified, from U16-pdf-shell)
File: `packages/twenty-front/src/modules/crm-analytics/report-pdf/components/AnalyticsPdfPageFrame.tsx` line 56

**Problem:** Two running strings on every page skip the printable-text sanitizer: the brand at line 56 and 'Page N of M' at lines 64 to 66. These are the only page-text paths in the PDF that do. L17 covers the missing Unicode font; this is a separate gap in the sanitizer's coverage.

**Scenario:** A translated catalog gives 'Page {pageNumber} of {totalPages}' in Russian. Every other string prints '?' for characters the font lacks, but the header brand and footer page number print as wrong characters. The sanitizer's own comment says it exists to prevent this. English output is unaffected.

**Evidence:** Line 56 is <Text style={styles.runningBrand}>{t`FloLabs analytics`}</Text>. Lines 64 to 66 return the t string directly from render. A grep for '<Text' in report-pdf finds only this file, AnalyticsPdfText and AnalyticsPdfSvgText, and only these two strings are unwrapped.

**Suggested fix:** Wrap both strings in toAnalyticsPdfPrintableText, as lines 54 and 60 already do.

## D106 [minor] PDF (unverified, from U20-pdf-trends)
File: `packages/twenty-front/src/modules/crm-analytics/report-pdf/charts/AnalyticsPdfLine.tsx` line 182

**Problem:** A previous-period value with no known neighbour is never drawn, because the previous line has no isolated-point dots. The legend and note still say a dashed line is there, and the invisible value still sets the axis.

**Scenario:** Tracking starts 2026-10-27. The first previous value allowed for NEW_APPLICATIONS is the week of 2026-11-02, so the weekly report for 2027-01-25 has exactly one non-null previousValue, on its last point. buildLinePoints sets hasPreviousLine true, so the legend reads 'The 12 weeks before' and the note adds 'Dashed is the window before', but nothing dashed appears. The monthly report for November 2027 does the same. Rate lines hit it more often, since a week with no applicants is null and leaves a lone previous value between gaps. If that value is the largest, the Y axis also stretches to fit a mark that cannot be seen.

**Evidence:** buildAnalyticsLinePath.ts:30-35 turns a one-point run into just 'Mx,y'. The Path at AnalyticsPdfLine.tsx:183-190 strokes it with the default butt cap, so a zero-length subpath paints nothing. The current line handles this at lines 211-230 with getAnalyticsIsolatedPoints, but previousPoints is never passed to it. maximumValue at lines 76-82 still counts the value. AnalyticsPdfTrendsSection.tsx:174-176 and 185-187 add the legend and note from any defined previousValue.

**Suggested fix:** After the previous Path, draw getAnalyticsIsolatedPoints(previousPoints) as small neutral dots.

## D107 [minor] PDF (unverified, from U20-pdf-trends)
File: `packages/twenty-front/src/modules/crm-analytics/report-pdf/charts/AnalyticsPdfLegend.tsx` line 67

**Problem:** The legend key for the dashed previous line prints almost solid, because every legend line uses round caps at width 1.75. It does not match the line drawn in the chart, and it defeats the dash's stated purpose in a black and white print.

**Scenario:** Any trend chart with a previous line. The legend key uses dash '3 2', stroke width 1.75 and round caps. Each cap extends a dash by 0.875pt at both ends, so the 2pt gap shrinks to 0.25pt. The 14pt key reads as a continuous gray line beside a 'Last 12 weeks' key that is also solid. In the chart the same line has butt caps at width 1.25 and keeps its full 2pt gaps.

**Evidence:** AnalyticsPdfLegend.tsx:66-68 sets strokeWidth 1.75 and strokeLinecap round for every line key. AnalyticsPdfLine.tsx:183-190 draws the previous line with PREVIOUS_LINE_WIDTH 1.25 and no strokeLinecap. AnalyticsPdfLineDash.ts says dashes tell the lines apart in a black and white print. The small-group dash '0.1 2.8' does need round caps, so caps must vary by item.

**Suggested fix:** Add optional lineWidth and lineCap to AnalyticsPdfLegendItem. Pass width 1.25 and butt caps for the PREVIOUS item, and keep round caps for the small-group item.

## D108 [minor] PDF (unverified, from U20-pdf-trends)
File: `packages/twenty-front/src/modules/crm-analytics/report-pdf/components/AnalyticsPdfTrendsSection.tsx` line 80

**Problem:** The previous-period rate line ignores previousSize, so a rate from a tiny earlier group prints as a firm dashed value with no small-group mark, and it can stretch the Y axis over the reliable current line.

**Scenario:** Weekly report, drop-off chart. A week 12 weeks back had 1 applicant who did not move on, so previousValue = 1.0 and previousSize = 1. Current weeks read 30 to 45% from 40 or more people. maximumValue becomes 1, the ticks become 0%, 50%, 100%, and the current line is squeezed into the lower half under an unmarked dashed spike to 100%. A reader sees a large improvement that comes from one person.

**Evidence:** buildLinePoints destructures only bucketStart, value, previousValue and size. The server sends previousSize for rate metrics at crm-analytics-metrics.service.ts:698, and the only front-end reader is AnalyticsTrendTable.tsx:123 and 266, which is how the page handles it. AnalyticsPdfLineChartPoint has no field for it, and maximumValue at AnalyticsPdfLine.tsx:76-82 counts every previousValue. dashboard-redesign.md requires that small samples print lighter with their count.

**Suggested fix:** Carry isPreviousLighter on each point from previousSize against report.minimumSample. Leave those values out of the Y scale, and draw them with the small-group dash or drop them from the dashed line.

## D109 [minor] PDF (unverified, from U20-pdf-trends)
File: `packages/twenty-front/src/modules/crm-analytics/report-pdf/charts/AnalyticsPdfLine.tsx` line 272

**Problem:** When the last known point is a small group with a rate near 0, the 'of N' detail under the end label prints on top of that bucket's X-axis label.

**Scenario:** Monthly report in the half-width Overall conversion chart. The 90-day window stops the line about three buckets before the end, and the last known bucket has 0% of 12 people. Height is 92, so plotBottom is 78 and y is 78. The value baseline is 80.88 and the detail baseline is 87.88. The X label baseline is 89. labelEvery is 3 and is anchored to the last point, so that bucket has a label such as 'Dec 2026', centered and about 29pt wide. The detail starts 6pt right of the point and the label runs about 14.5pt right of it, so about 8pt of 'of 12' overlaps the date. It happens whenever the value is under about 5% of the scale at a labelled bucket, and 0% small groups are common soon after launch.

**Evidence:** END_DETAIL_OFFSET = 7 at line 26. The detail y is set at lines 268-273 with no check against the bottom band. X labels are drawn at height - 3 at line 167, BOTTOM_BAND is 14, and the X labels are anchored middle. Traced by hand; no PDF was rendered.

**Suggested fix:** Print the detail above the value label when the point is within about 8pt of plotBottom, for example baseline minus the label font size.

## D110 [minor] PAGE (unverified, from path-react-lifecycle)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsTrendsTab.tsx` line 250

**Problem:** isNothingToShow is computed from retained previous payloads and ignores trendsError and smallChartsError, so a failed query under a new filter shows 'No people match these filters' instead of an error with Retry.

**Scenario:** On Trends, Source = X returns nothing, so the EMPTY panel shows. Change to Source = Y. Both the trends and series queries fail with a busy error. payload is still the empty result for X, so isNothingToShow stays true. The tab says no people match Source = Y with only a Reset button. The error never appears, although people do match. If the queries succeed, the same false message still shows for the whole load.

**Evidence:** Lines 250-264 use trends and smallChartBundle only, and line 266 returns the EMPTY panel before any card can show trendsError. The Overview, Funnel and Categories tabs all check isDefined(error) first; Trends has only isForbidden and the null check at lines 229-235.

**Suggested fix:** Add !isDefined(trendsError) && !isDefined(smallChartsError) && !isTrendsRefetching && !isSmallChartsRefetching to isNothingToShow, so cards with errors render and an old empty result is not stated about a new filter.

## D111 [minor] PAGE (unverified, from path-react-lifecycle)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsOverviewTab.tsx` line 96

**Problem:** Empty panels are chosen from the retained previous payload with no refetching check, so an old empty result is stated about the new filter for the whole load, with no busy sign. The Funnel and Categories tabs do the same.

**Scenario:** Status = No stage gives totalContacts 0 and 'No people match these filters'. Click Reset filters. While the unfiltered read runs (up to about 10 to 25 seconds if slots are busy), the panel stays, undimmed, and the chips have already cleared. The button looks dead, and the page claims no one matches an unfiltered view. The same happens when moving between filters from an empty one.

**Evidence:** AnalyticsOverviewTab.tsx:96 tests overview.figures.totalContacts with isRefetching unused on this branch. AnalyticsFunnelTab.tsx:78 returns EMPTY_FUNNEL and ignores isRefetching. AnalyticsCategoriesTab.tsx:105 returns EMPTY inside StyledLayout isRefetching={false}. payload is previousData during loading, per useCrmAnalyticsQuery.ts:32.

**Suggested fix:** When isRefetching is true on these branches, show the loading skeleton rather than the empty panel.

## D112 [minor] CHARTS (unverified, from path-react-lifecycle)
File: `packages/twenty-front/src/modules/crm-analytics/charts/AnalyticsHorizontalBarChart.tsx` line 231

**Problem:** A click that filters replaces the clicked mark, but the tooltip hides only on that mark's pointerleave or blur. A removed element never fires these, so the tooltip stays on screen with the old row's numbers. AnalyticsScatterChart.tsx:277 has the same bug.

**Scenario:** On Tracks & sources, click the fifth track bar in 'How many people in each?' and keep the mouse still until the response arrives. The chart redraws with that track's two programs, so nothing sits under the pointer and no row gets pointerenter. The tooltip for the old track stays over the new chart. Moving off the rows does not clear it; only entering and leaving another row does. In the scatter this is more likely, since most of the plot is blank.

**Evidence:** activate at line 231 calls only onRowClick. Hide is wired at lines 245 and 248 on the row. activeTooltip in useAnalyticsChartTooltip.tsx is a content snapshot held by the chart, which stays mounted because getAnalyticsCategoryChartRows swaps track rows for program rows. Row keys change, so the clicked row unmounts. U04 and U11 raised the same hook in shared notes.

**Suggested fix:** Call hideTooltip inside activate in both charts. As a guard, clear activeTooltip when the marked rows change.

## D113 [minor] CHARTS (unverified, from path-react-lifecycle)
File: `packages/twenty-front/src/modules/crm-analytics/charts/AnalyticsLineChart.tsx` line 153

**Problem:** hoveredIndex and the tooltip snapshot survive a change of buckets. The crosshair can use an index past the new data, and the tooltip keeps old values until the pointer reaches a different index. AnalyticsSparkline.tsx:61 has the same state.

**Scenario:** On Trends choose By month from By day, then move the mouse over a chart while the response is pending, at index 60 of 90. The response has 6 month buckets. toSvgX(60) lands far right of the plot, and StyledSvg has overflow: visible, so a stray vertical line can draw over neighbouring cards. If the old index is still in range, for example index 3, handlePointerMove sees nextIndex === hoveredIndex and only moves the tooltip, so it keeps the old day's title and value above a month bucket until the pointer crosses to another bucket.

**Evidence:** useState at line 153 is never reset on prop change. Line 234 returns early with moveTooltip when the index matches. Lines 499-502 draw toSvgX(hoveredIndex) with no bound check. The chart stays mounted across refetches because the card keeps children while isRefetching.

**Suggested fix:** Give the chart a key built from its first and last bucket keys and bucket count, so hover state resets when buckets change. Alternatively store the hovered bucket key instead of the index and ignore it when absent.

## D114 [minor] PAGE (unverified, from path-react-lifecycle)
File: `packages/twenty-front/src/modules/crm-analytics/utils/getAnalyticsCategoryChartRows.ts` line 21

**Problem:** Rows are chosen by pairing the new filter with the previous payload during a refetch, so clicking a track redraws every track's programs under that track's chip until the response arrives.

**Scenario:** On Tracks & sources with no filter, click AI. filter.trackKey is set at once, while categories is still the unfiltered payload holding all 39 program rows. programRows.length > 0 returns all of them, so every chart, the heatmap and the answer cards briefly show programs from all five tracks under the chip 'Track: AI'. An answer card can name a Robotics program as the largest. A click on a row in this state filters to a program the user did not mean to choose. With slow reads this lasts for seconds.

**Evidence:** Lines 19-24 read trackKey and programKey from the filter argument. AnalyticsCategoryCharts.tsx passes the current filter with the retained categories payload. AnalyticsCategoryTable.tsx's comment confirms rows include both levels. This is separate from L18 and L19, which are about Overview cards and period labels. U12 noted the same read.

**Suggested fix:** Have the server echo the filter it answered in the categories payload and read track and program from that, or keep the filter paired with each received payload in AnalyticsCategoriesView.

## D115 [minor] PAGE (unverified, from path-react-lifecycle)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsSyncLine.tsx` line 37

**Problem:** The relative sync time is computed only at render, and nothing re-renders the header while the page sits idle. The line and the stale banner therefore freeze at their load values.

**Scenario:** Open Analytics at 09:00 with the last sync 3 minutes ago, leave the tab open and return at 14:00. The header still reads 'Last updated 3 minutes ago' and no stale banner shows, although five hours passed and the numbers on screen are from 09:00. Only a click on a filter or tab triggers refreshOldMeta. A reader who just looks gets a false freshness claim, against the requirement of an honest last-sync line and stale warning.

**Evidence:** Line 37 calls beautifyPastDateRelativeToNow during render. AnalyticsPage has no state except meta. AnalyticsContent.tsx's refreshOldMeta runs only from handleFilterChange and onChangeTab. meta.sync.isStale is computed on the server at asOf. The contract's no-polling rule covers data fetches, and a clock re-render sends none.

**Suggested fix:** Add a one-minute interval state in AnalyticsSyncLine, cleaned up on unmount, that recomputes the label and treats the time since lastSuccessfulSyncAt as stale past the threshold. Alternatively print an absolute time. Neither needs a network request.

## D116 [minor] PAGE (unverified, from path-react-lifecycle)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsContent.tsx` line 197

**Problem:** The one scrolling StyledBody is shared by all tabs and is not reset on tab change, so a new tab opens at the old scroll offset. Picking another report from the sticky rail has the same problem.

**Scenario:** Scroll Trends down 1500px to the cohort heatmap and click Funnel. Funnel renders with scrollTop still 1500, so the reader lands mid-page below the takeaway and answer cards, or at the ledger. On Reports, scroll March to the comparison table and click February in the sticky rail. February appears at the same offset with its title out of view, so nothing shows that the report changed.

**Evidence:** Line 197 renders a single StyledBody with overflow-y: auto, and the tabs are conditional children inside it, so the DOM node and scrollTop persist. No code sets scrollTop or keys this element. AnalyticsReportsTab.tsx:261 swaps the report by props inside the same scroller, with the rail sticky at line 239.

**Suggested fix:** Set key={activeTabId} on StyledBody, or reset scrollTop in the tab change handler. For reports, reset the scroller when a report is picked.

## D117 [minor] PAGE (unverified, from path-react-lifecycle)
File: `packages/twenty-front/src/modules/crm-analytics/hooks/useCrmAnalyticsQuery.ts` line 24

**Problem:** Reads for abandoned filters or tabs keep running on the server and hold the two page-read slots in FIFO order. Quick filter clicks can make the newest filter's queries fail with the 10 second busy error, while older results nobody will see still complete.

**Scenario:** Production-sized data where each read takes about 3 seconds. On Trends, each filter change sends 4 reads. Pick Track, Source, then Program about 2 seconds apart, making 12 reads. With 2 slots, reads 11 and 12 start about 15 seconds after the first click, 11 seconds after they were queued, past PAGE_READ_SLOT_WAIT_MS. Those reads belong to the current filter, so two cards show 'This chart could not load', while the first 8 reads answered filters already replaced. Overview sends 5 reads per change, and two users share the limit. This needs real load, and the seed data will not show it.

**Evidence:** handleFilterChange in AnalyticsContent.tsx applies each click at once with no throttle. Apollo drops the old observation, but ending the fetch does not stop the Nest handler. crm-analytics-database.service.ts:21-22 sets 2 slots and a 10 second wait, with waiters served by shift() in order. AnalyticsChartCard shows only a generic message, hiding the 'Analytics is busy' text the server provides. The contract allows the busy error, but not losing the current view to discarded work.

**Suggested fix:** In the hook, retry once automatically after a short delay when the error subCode is CRM_ANALYTICS_BUSY and show the server's busy message. Consider a brief delay before sending reads after a filter change, and serving the newest waiter first.

## D118 [minor] PAGE (unverified, from path-filter-to-chart)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsOverviewCharts.tsx` line 128

**Problem:** After a funnel or series query fails on a new filter, the Overview tiles keep drawing the previous filter's rate and sparklines. The hook returns previousData together with the error.

**Scenario:** On Overview, click a track. The funnel or series read fails, for example with the busy error, which is more likely after several quick clicks because each click queues 5 reads against 2 slots. The Overall conversion tile still shows the unfiltered rate, such as 25%, above 'This figure could not load'. All four sparklines stay unfiltered under the 'Track: X' chip with no notice at all, while the New applications line card beside them shows its error.

**Evidence:** useCrmAnalyticsQuery.ts:32 has `data ?? previousData`. With Apollo 4, an error on changed variables leaves data undefined and previousData set. AnalyticsOverviewCharts.tsx:128 builds the answer whenever funnel is defined, and line 132 only swaps the note. readSparkline at line 86 reads seriesBundle and never checks seriesError. AnalyticsFiguresRow.tsx:226-235 renders the value regardless of hasOverallConversionError.

**Suggested fix:** Pass `overallConversion: null` when funnelError is defined and empty sparklines when seriesError is defined. Alternatively, have the hook return no payload when error is set and the last data belongs to other variables.

## D119 [minor] SERVER (unverified, from path-filter-to-chart)
File: `packages/twenty-server/src/modules/analytics/services/crm-analytics-metrics.service.ts` line 749

**Problem:** isTrackImplied misses unmapped programs, so a track and program pair chosen by one click counts as two categories, and the snapshot charts refuse to draw.

**Scenario:** In Tracks & sources, under the Unmapped track, click a program whose option is not in the config. getAnalyticsCategoryClickFilter sends trackKey UNMAPPED and programKey RAW. On Trends, Total contacts, Active people and People in each stage all read 'Keep only one of Track, Program or Source', although the user picked one thing. On Overview, the Active people and Total contacts sparklines disappear silently.

**Evidence:** TRACK_KEY_BY_POSITION.get(RAW) is undefined, so `undefined === 'UNMAPPED'` is false and dimensions has two entries, which returns null at line 766. resolveSeriesTrackKeys at line 2126 already uses `?? UNMAPPED_CATEGORY_KEY` for the same lookup, so the two disagree. The snapshot already holds position rows for raw values (crm-analytics-snapshot.service.ts:46).

**Suggested fix:** Compare `(TRACK_KEY_BY_POSITION.get(filter.programKey) ?? UNMAPPED_CATEGORY_KEY) === filter.trackKey`.

## D120 [minor] PAGE (unverified, from path-filter-to-chart)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsCategoryCharts.tsx` line 382

**Problem:** With a Status filter on Tracks & sources, the answer cards, heatmap, scatter and table show rates that ignore the status, with no note. The scatter also pairs a status-narrowed people count with an un-narrowed rate.

**Scenario:** Pick Status = Left. The 'Best converting' card reads '12%, AI, of 80 people' and the 'Conversion at every step' heatmap keeps the whole cohort's rates under the 'Status: Left' chip. A scatter point plots x = 15 (people who left) against y = 12% (of all 80), and its tooltip shows People 15 and Out of 80 people. Only 'Which converts best?' says that rates ignore the status filter.

**Evidence:** readFunnelGroups strips status (metrics service line 1769), while readCategoryPeople keeps it (line 1812). rateNote at line 260 is used only by the one card; the notes at lines 382 and 396 and buildAnalyticsCategoryAnswers have no such text, and neither does the table's Overall column. Contract 'Decisions from testing', Status filter, says the page says so where other rates show.

**Suggested fix:** Add one tab-level notice when filter.status is not ALL, or append 'Rates ignore the status filter' to the heatmap and scatter notes and the answer cards' details.

## D121 [minor] PAGE (unverified, from path-filter-to-chart)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsOverviewCharts.tsx` line 79

**Problem:** Under a date filter, the Active people and Total contacts sparklines count everyone, while the value above them in the same tile counts only people created in the range. Nothing says so.

**Scenario:** Pick Last 30 days. The hero tile shows Active people 40. Hovering its sparkline shows 'Active people 3,200', and the same happens on the Total contacts tile, under the same date chip. A reader cannot tell which is the filtered number.

**Evidence:** computeOverview passes scopeDateRange (service lines 1391-1401), which adds `p.created_at >= $2` and the range (buildCurrentStateDateConditions). readSnapshotBuckets uses the dates only to pick buckets, and daily_snapshot has no creation date. AnalyticsFiguresRow.tsx:187-190 and 267-270 draw both in one tile, and its note at line 263 says 'People matching these filters'.

**Suggested fix:** Hide these two sparklines while a date filter is on, or add a note and tooltip wording such as 'Everyone at that date, not narrowed by the date filter'.

## D122 [minor] SERVER (unverified, from path-filter-to-chart)
File: `packages/twenty-server/src/modules/analytics/services/crm-analytics-metrics.service.ts` line 1449

**Problem:** The '{n} imported, dates unknown' line on the New applications tile is a workspace-wide total that no filter narrows, but it sits under filtered numbers with no such label.

**Scenario:** With chips 'Track: Robotics' and 'Status: Left', the tile reads '3 ... 3,000 imported, dates unknown'. The 3,000 looks like imported applications for that track and status, but it is the same number for every filter.

**Evidence:** countImportedApplications takes only state and run and counts every row of the Applications table (facade line 317). AnalyticsFiguresRow.tsx:213-216 prints it whatever the filter. Contract section 4 settles only that this is a total with no dates, not that it should appear unlabeled under a person filter.

**Suggested fix:** Show the line only when no track, program, source or status filter is active, or word it as 'all tracks' when one is.

## D123 [minor] PAGE (unverified, from path-filter-to-chart)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsOverviewTab.tsx` line 96

**Problem:** The empty check uses only people created in the range, so a filter with real applications shows 'No people match these filters' and hides the applications. Categories has the same check.

**Scenario:** Pick Track: Robotics and Last 7 days. No new person was created in that track this week, but 6 existing or imported people resubmitted the application form. figures.newApplications is 6 and totalContacts is 0, so Overview shows only the empty panel. In Categories, rows carry newApplications 6 with people 0, and the same panel appears. Trends shows those 6 applications under the same chips.

**Evidence:** People narrow by createdAt (buildCurrentStateDateConditions). computeNewApplications and readCategoryNewApplications use a scope with no date and filter on submitted_at. AnalyticsOverviewTab.tsx:96 tests only totalContacts, and AnalyticsCategoriesTab.tsx:105 tests only row.people.

**Suggested fix:** Treat the view as empty only when newApplications is also 0 or null, and rows' newApplications too.

## D124 [minor] PAGE (unverified, from path-filter-to-chart)
File: `packages/twenty-front/src/modules/crm-analytics/utils/getAnalyticsCategoryChartRows.ts` line 19

**Problem:** While a filter loads, the new filter is applied to the previous payload, so the charts draw a set of rows that matches neither filter.

**Scenario:** In Tracks and programs with no filter, click one track. Until the categories read returns, which can take many seconds when reads queue, all charts redraw every program of every track, about 39 bars at once, each ranked and clickable. Removing a track chip does the reverse: the old single-track payload is cut to one bar labeled as the whole view.

**Evidence:** AnalyticsCategoryCharts.tsx:78 passes the retained `categories` and the current `filter`. programRows are all rows with a parentKey, and only the server narrows them to the chosen track. The payload does not carry the filter it was computed for.

**Suggested fix:** Keep the filter that produced the shown payload, for example by echoing trackKey and programKey in AnalyticsCategories, and use that here and in the click handlers.

## D125 [minor] PAGE (unverified, from path-filter-to-chart)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsOverviewCharts.tsx` line 178

**Problem:** The Overview line chart and sparklines silently widen a date filter to whole weeks. The chip and the tile beside them keep the exact range, and only Trends explains the widening.

**Scenario:** On Wednesday Nov 11, pick Last 7 days. The tile reads 'Nov 5 to Nov 11' with 12 applications. The line shows the weeks of Nov 2 and Nov 9 in full, including Nov 2 to 4, for a total of 20, with no note. The two numbers disagree under one chip.

**Evidence:** computeCrmAnalyticsTrendBuckets starts at the period start of dateFrom, and readNewApplicationBuckets reads whole buckets. getDateWideningNote exists only in AnalyticsTrendsTab.tsx:108. The note at line 178 says only 'Applications by the week they were submitted'.

**Suggested fix:** Append 'Dates widen to whole weeks here' to this card's note when a date filter is active, reusing the Trends wording.

## D126 [minor] PAGE (unverified, from path-filter-to-chart)
File: `packages/twenty-front/src/modules/crm-analytics/utils/buildAnalyticsCategoryAnswers.ts` line 82

**Problem:** The answer cards leave out catch-all rows, so a filter that leaves only such rows shows a false 'not enough people' message next to a large bar.

**Scenario:** In Sources, click 'No source', with 300 people. In Tracks, click 'Unmapped', or use a workspace where no position matches the config. Largest, Best converting and Biggest drop all show a dash and 'Not enough people in any group to compare yet', while the bar directly below shows 300 people.

**Evidence:** groupRows at line 41 removes isAnalyticsCatchAllRow rows, and largestRow at line 43 only needs people > 0. AnalyticsCategoryCharts.tsx:343 passes chartRows, which under these filters contain only catch-all rows.

**Suggested fix:** Use all chart rows when no named row remains, or show different text, such as 'Only people with no value or an unmapped value are in view'.

## D127 [minor] PAGE (unverified, from path-filter-to-chart)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsOverviewTab.tsx` line 96

**Problem:** An empty panel keeps showing, undimmed, while the query for a different filter runs, so it states a result for a filter that has not been checked. The other tabs do the same.

**Scenario:** Filter A returns zero people, so 'No people match these filters' appears. Pick source B, which is not cached. The chips now say Source B and the panel still says no people match, with no busy sign. It stays until the read returns, which can include up to 10 s of slot wait and 15 s of read time. A user may reset or change filters based on that false statement.

**Evidence:** The hook returns previousData during refetch. The empty branches at AnalyticsOverviewTab.tsx:96, AnalyticsCategoriesTab.tsx:105-107 (`isRefetching={false}`), AnalyticsFunnelTab.tsx:78 and AnalyticsTrendsTab.tsx:266 never read isRefetching. PAGE_READ_SLOT_WAIT_MS and PAGE_READ_TIME_BUDGET_MS are in crm-analytics-database.service.ts:22-23.

**Suggested fix:** Skip the empty branches while isRefetching is true, or show a skeleton in their place.

## D128 [minor] PAGE (unverified, from path-filter-to-chart)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsOverviewCharts.tsx` line 204

**Problem:** The Overview chart's gray line is labeled 'Previous period', but each point is one whole window earlier, not the week before.

**Scenario:** With no date filter the chart has 12 weeks. The tooltip for the week of Feb 1 reads 'New applications 12, Previous period 7', where the 7 comes from the week 12 weeks earlier. A reader takes it as last week. With a 2-week filter, the same label means 2 weeks earlier.

**Evidence:** computeCrmAnalyticsTrendBuckets sets previousBucketStart to start minus bucketStarts.length periods. AnalyticsTrendSmallChart.tsx:171 already handles this with `${windowLength} before` from getAnalyticsWindowLength; this caller hardcodes the label.

**Suggested fix:** Use getAnalyticsWindowLength(newApplicationsPoints.length, 'WEEK') and the same '{window} before' label.

## D129 [minor] PDF (unverified, from path-unknown-values)
File: `packages/twenty-front/src/modules/crm-analytics/utils/buildAnalyticsReportAnswers.ts` line 76

**Problem:** The report's Overall conversion answer card never sets isLighter, so small-sample and so-far rates draw at full strength.

**Scenario:** A stored report has funnel.overall.eligible = 12 and rate = 0.25, or eligible = 0 and soFarRate = 0.1. The Reports tab card shows a full-strength 25% or 10% so far. The same report's PDF key figure draws it lighter.

**Evidence:** Line 76 keeps only .label from describeAnalyticsRate and drops isSmallSample and isInProgress. AnalyticsAnswerCards.tsx has isLighter and StyledValue honours it. buildFunnelAnswerCards.ts:109 passes it since L7, and buildAnalyticsPdfKeyFigures.ts passes rate.isLighter. dashboard-redesign.md rule 6 requires lighter. L7 fixed only the Funnel card.

**Suggested fix:** Hold the description in a variable and add isLighter: rate.isSmallSample || rate.isInProgress to the overall-conversion card.

## D130 [minor] CHARTS (unverified, from path-unknown-values)
File: `packages/twenty-front/src/modules/crm-analytics/charts/AnalyticsHorizontalBarChart.tsx` line 224

**Problem:** Rate bars on the page scale to the highest rate shown, with no axis or note, so a low rate can fill the whole bar.

**Scenario:** Filter Tracks & sources to one track with one program at overallRate = 0.03. That single row draws a full-width bar labelled 3%. With three rows at 2%, 3% and 4%, the 4% bar fills the width and looks like near-total conversion. The Conversion at each step chart beside it uses a fixed 0 to 100% axis, so the two disagree visually.

**Evidence:** scale = largestValue, which is the largest row total. buildRateBar in AnalyticsCategoryCharts.tsx and buildAnalyticsCategoryRateRows pass raw rates, and the component has no maxValue prop. The PDF has the same scale but says so: AnalyticsPdfTracksSection.tsx adds 'Bars scaled to the highest rate, X'. The page's rateNote and the report view's note have no such sentence. Column charts pass maxValue={1}.

**Suggested fix:** Add an optional maxValue to AnalyticsHorizontalBarChart and pass 1 from both rate charts. Otherwise add the PDF's scale sentence to both notes.

## D131 [minor] PAGE (unverified, from path-unknown-values)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsCategoryCharts.tsx` line 46

**Problem:** Which converts best? ranks a small group's rate above firm ones, so the top bar can contradict the Best converting card and the same report's PDF order.

**Scenario:** Track A has 1 of 1 people signed (100%). Track B has 80 of 200 (40%). The bar chart lists A first, labelled 'highest first'. The answer card above says Best converting 40%, Track B. In a stored report, the page lists A first while its PDF lists B first.

**Evidence:** compareByRate and getRateRank (lines 38-52) rank every measured rate equally, whatever overallEligible is. buildAnalyticsCategoryBarRows.ts:115 getRank does the same for the report view. buildAnalyticsPdfCategoryBars.ts states 'A small group's high rate must not outrank a firm one' and shifts lighter rates down. buildAnalyticsCategoryAnswers.ts filters on overallEligible >= minimumSample.

**Suggested fix:** In both page sorts, rank firm rates first, then small-sample rates, then so far, then unknown, matching getConversionRank in the PDF.

## D132 [minor] PAGE (unverified, from path-unknown-values)
File: `packages/twenty-front/src/modules/crm-analytics/utils/buildStageTotalsChartRows.ts` line 51

**Problem:** A main stage with no limit still draws its whole bar as the Within limit segment.

**Scenario:** Signed has limitDays = null, so pastLimitCount is null. With 40 people in Signed, the Where is everyone now? bar is 40 in the accent color that the legend names Within limit, so the legend says signed people are within a limit that does not exist. The tooltip correctly shows only People 40.

**Evidence:** Line 51 always emits the withinLimit segment, using pastLimitCount ?? 0. The tooltip branch at about line 83 checks isDefined(row.pastLimitCount) and carries the comment 'A stage with no limit, such as the final one, has nothing to split'. The config sets limitDays: null for SIGNED, which has kind MAIN.

**Suggested fix:** When pastLimitCount is null, use a neutral segment key and label, such as People, instead of withinLimit.

## D133 [minor] PAGE (unverified, from path-unknown-values)
File: `packages/twenty-front/src/modules/crm-analytics/utils/buildFunnelCharts.ts` line 199

**Problem:** A median of exactly one day prints as '1 days', because the page hard-codes the plural.

**Scenario:** A stage has medianDays = 1 from 40 finished stays. The How long do people stay? bar reads '1 days', and the Slowest stage card reads '1 days' if it is the slowest. formatNumber with decimals: 1 has no minimum fraction digits, so 1.0 formats as '1'. A stage limit of 1 would read the same in the tooltip at line 215.

**Evidence:** buildFunnelCharts.ts:199 and :215 and buildFunnelAnswerCards.ts:100 use t`${days} days`. formatNumber sets minimumFractionDigits: 0. The PDF's formatAnalyticsPdfDays and the trend summary's formatDelta both use plural.

**Suggested fix:** Use plural on the numeric value, as formatAnalyticsPdfDays does, at all three places.

## D134 [minor] PAGE (unverified, from path-words-against-numbers)
File: `packages/twenty-front/src/modules/crm-analytics/utils/buildFunnelCharts.ts` line 159

**Problem:** 'Still in progress' is entered minus eligible, so it includes people who already moved on or exited inside the window. They are shown as undecided and never as Moved on or Left until the window closes.

**Scenario:** 100 people applied in the last 10 days. 80 have already moved to Contacted and 15 were rejected. 'What happened to people at each stage?' shows New as 100% Still in progress, and the ledger column shows 100, while Overview shows 5 people in New. The Contacted row also counts those 80 as still in progress there. A recruiter reads a backlog that does not exist.

**Evidence:** Metrics service line 624: inWindow = step.entered - eligible. reached_next and exited are counted only WHERE window_end <= now (lines 388-390). The word is repeated in AnalyticsStageLedger.tsx:246, the PDF legend at AnalyticsPdfFunnelSection.tsx:268 (which has no definition), and the tooltip at buildFunnelCharts.ts:66. The note at AnalyticsFunnelCharts.tsx:101 says only 'inside the window'. The redesign chose the term, but the number is wider than the words.

**Suggested fix:** Keep the numbers and rename the segment to something true, such as 'Too recent to judge', with the note 'includes people who have already moved or left'. Or return separate counts for people still in the stage.

## D135 [minor] PDF (unverified, from path-words-against-numbers)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsReportView.tsx` line 426

**Problem:** The report funnel note says people who applied in this period are not rated yet. That is false for monthly reports and for any report rebuilt later.

**Scenario:** The November monthly report is generated on Dec 1. Everyone who applied Nov 1 to Nov 16 is past the 14-day New window, so they are in eligible and in the New to Contacted percent, yet the note says they are not rated. A provisional rebuild months later makes it false for weekly reports too.

**Evidence:** buildReport sets cohortDateRange { from: null, to: range.to } (report service line 229). computeFunnel calls readFunnelGroups with no windowsClosedAt, so eligible is window_end <= now() (metrics service line 388). The windows are 14 days in the config. A month is longer than a window.

**Suggested fix:** Reword to 'A step counts only people past that step's time limit when this report was generated, so the newest applicants are not rated yet.'

## D136 [minor] PDF (unverified, from path-words-against-numbers)
File: `packages/twenty-front/src/modules/crm-analytics/utils/buildAnalyticsReportTrendCharts.ts` line 48

**Problem:** The web report titles its drop-off line 'Drop-off rate over time' without saying it covers only the first stage, so it reads as drop-off across the pipeline.

**Scenario:** A report shows 'Drop-off rate over time' at 35%. The series is only people who did not move on from New within 14 days. A reader takes 35% as total pipeline loss, while overall conversion on the same report is 4%.

**Evidence:** computeReportSeries uses resolveTrendStageKey(metric, null), which returns ENTRY_STAGE_KEY for DROP_OFF (metrics service 2202-2209). buildAnalyticsReportTrendCharts destructures stageKey but uses it only in the row key. The Trends tab says 'Drop-off from New' (AnalyticsTrendsTab.tsx:82), and the PDF names the stage (AnalyticsPdfTrendsSection.tsx:449-450).

**Suggested fix:** Pass report.funnel.rows into the builder and title the chart 'Drop-off from {stage} over time', with the series label to match, as the PDF does.

## D137 [minor] PAGE (unverified, from path-words-against-numbers)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsOverviewCharts.tsx` line 204

**Problem:** On Overview the gray line and its tooltip say 'Previous period', but the value is the same week 12 weeks earlier. The tile above uses the same phrase for the 7 days just before.

**Scenario:** In March, hover 'Week of Mar 1': 'New applications 20, Previous period 5'. The 5 is the week of Dec 7, not the week before. Beside it the tile reads '+3 against the previous period', meaning the prior 7 days. A reader takes 20 against 5 as a one-week jump.

**Evidence:** computeCrmAnalyticsTrendBuckets sets previousBucketStart = start minus bucketStarts.length periods (compute-crm-analytics-report-periods.util.ts:156-160), and the default is 12 weeks. AnalyticsTrendSmallChart.tsx:171 already labels this `${windowLength} before`, and AnalyticsTrendTable.tsx:226 says '12 weeks earlier'.

**Suggested fix:** Use previousLabel={t`${getAnalyticsWindowLength(points.length, 'WEEK')} before`} here, as the Trends small charts do.

## D138 [minor] PAGE (unverified, from path-words-against-numbers)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsFiguresRow.tsx` line 213

**Problem:** Under a track, program, source or status filter, the New applications tile still prints the whole workspace's imported total, as if it belonged to the filtered view.

**Scenario:** Filter Track = Design. The tile shows '4' with '12,000 imported, dates unknown' under it. A reader takes that as 12,000 imported Design applications.

**Evidence:** countImportedApplications takes only state and run and counts every undeleted Application (facade lines 306-322). computeOverview calls it with no filter (metrics service 1449). The tile prints it with no condition.

**Suggested fix:** Hide the line when a person filter is active, or word it '12,000 imported across all tracks, dates unknown'.

## D139 [minor] PAGE (unverified, from path-words-against-numbers)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsCategoryCharts.tsx` line 155

**Problem:** 'Not active' is people minus activePeople, so it includes people with an unmapped stage or no stage, whose status is unknown. Overview calls those same people 'not mapped' and keeps them apart.

**Scenario:** Production stage values differ from the guessed config, so 500 people in the AI track have unmapped stages. The bar reads Active 0, Not active 500, and the tooltip agrees. A recruiter concludes that the track is dead, while the Overview donut shows the same people as 'Not mapped or no stage'.

**Evidence:** Line 141: notActivePeople = people - activePeople. buildActiveConditionSql (metrics service line 244) requires kind MAIN or OTHER, and NULL kind fails it. buildAnalyticsCategoryBarRows.ts:64 and the PDF active legend repeat this. CLAUDE.md says raw values in the config are guesses, so this is the launch state.

**Suggested fix:** Name the segment 'Signed, left or not mapped', or return a separate unmapped count per row and draw it as a third segment.

## D140 [minor] PAGE (unverified, from path-words-against-numbers)
File: `packages/twenty-front/src/modules/crm-analytics/utils/buildStageTotalsChartRows.ts` line 54

**Problem:** A stage with no limit is drawn as 'Within limit', and the legend says so.

**Scenario:** Signed has limitDays null and 300 people. In 'Where is everyone now?' its bar uses the accent color that the legend names 'Within limit', and the screen reader label says 'within limit, past limit or inactive'. The tooltip alone switches to 'People'. Signed people have no limit to be within.

**Evidence:** buildMainRow always builds the withinLimit segment. The isDefined(row.pastLimitCount) check at line 83 applies only to the tooltip. AnalyticsHorizontalBarChart builds its legend from segment labels (lines 170-186). The config has limitDays: null for SIGNED.

**Suggested fix:** When pastLimitCount is null, use a segment with key and label 'people'/'People' and a distinct or neutral color, so the legend no longer claims a limit.

## D141 [minor] PAGE (unverified, from path-words-against-numbers)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsTrendsTab.tsx` line 374

**Problem:** In 'What moved this period?' the label 'Left' means any move out of a stage, including moving forward. Everywhere else in the tool 'Left' means exited.

**Scenario:** 40 people move from Contacted to Before meeting and nobody exits. The chart and table show Contacted: Left 40. On Overview, Status = Left shows 0 of these people. On the Funnel tab, the 'Left' segment for Contacted shows 0. A recruiter reads 40 people lost when they all progressed.

**Evidence:** computeMovement counts leftInPeriod from from_key for every transition (metrics service 1200-1202). Redesign rule 5 says 'Left' for exited, and getAnalyticsStatusFilterLabel maps EXITED to 'Left'. AnalyticsMovementTable.tsx:26 and AnalyticsReportView.tsx:522 use the same label. The PDF avoids this with 'Left the stage' (AnalyticsPdfTrendsSection.tsx:294).

**Suggested fix:** Use 'Moved out' or 'Left the stage' on the page chart, the movement table and the report view, as the PDF does.

## D142 [minor] PAGE (unverified, from path-words-against-numbers)
File: `packages/twenty-front/src/modules/crm-analytics/utils/buildFunnelAnswerCards.ts` line 66

**Problem:** The Biggest drop detail says people 'did not move on', but the count includes people who moved on after the 14-day window and left people who exited. It contradicts the next stage's count on the funnel beside it.

**Scenario:** 100 people are past the Saturday meeting window. 10 moved on within 14 days and 60 moved on at day 20. The card reads 'From Saturday meeting to Attended. 90 of 100 people did not move on.' The funnel below shows at least 70 people in Attended.

**Evidence:** Metrics service line 627: dropOffRate is (eligible - reachedNext) / eligible, with reached_next requiring next_at <= window_end. The contract says a late mover counts as timed out and still enters the next step. The card text does not mention the window, and neither does buildAnalyticsCategoryAnswers.ts:98.

**Suggested fix:** Add the window to the detail: '90 of 100 people did not move on within 14 days'. Do the same for the category card.

## D143 [minor] PDF (unverified, from path-words-against-numbers)
File: `packages/twenty-front/src/modules/crm-analytics/report-pdf/utils/buildAnalyticsPdfAnswers.ts` line 88

**Problem:** The PDF's 'Which stage is slowest?' falls back to tiny samples when no stage reaches the minimum, so one person's stay can decide it. The Funnel tab refuses to answer in the same case.

**Scenario:** No stage has 30 finished stays. Contacted has a median of 30 days from 1 stay, and New has a median of 6 days from 29 stays. The PDF answers 'Contacted: a median of 30 days, from 1 stay'. For the same data, the Funnel tab card says 'Not enough finished stays yet.'

**Evidence:** Line 88: (firmRows.length > 0 ? firmRows : timedRows). buildFunnelAnswerCards.ts:77-80 requires completedStays >= minimumSample, with no fallback.

**Suggested fix:** Remove the fallback and answer 'Not enough finished stays yet' when firmRows is empty, as the page does.

## D144 [minor] PDF (unverified, from path-words-against-numbers)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsReportView.tsx` line 409

**Problem:** The report header says imported people count 'in current totals only', but the period's movement figures and comparisons include their moves.

**Scenario:** An imported person moves from Contacted to Before meeting in the report week. 'What moved this period?' and the comparison row 'Entered Before meeting' count them. The header says imported people count only in current totals, so a reader takes those movement counts as tracked applicants only.

**Evidence:** computeMovement builds its scope with no created_at condition, and its comment says 'includes imported people' (metrics service 1185). Contract section 6 'Movement' says 'Includes imported people'. The same sentence is in AnalyticsPdfFirstPage.tsx ('Imported people count in current totals only, never in rates').

**Suggested fix:** Reword both places to 'Imported people count in current totals and stage moves, never in rates.'

## D145 [minor] PDF (unverified, from path-report-to-pdf)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsReportView.tsx` line 426

**Problem:** The funnel card note says people who applied in this period are still in progress and not rated yet. The stored numbers do rate them once they are past the step window at generation time, so the note is false on every monthly report and on any late-built or rebuilt report.

**Scenario:** November monthly report built on Dec 1. A person who applied on Nov 3 has a New step window that closed on Nov 17, so they count in eligible and in the New to Contacted rate. The card still tells the reader that November applicants are not rated. The same report rebuilt in January after isProvisional flips rates that month's applicants at every closed window.

**Evidence:** crm-analytics-report.service.ts:229 passes cohortDateRange { from: null, to: range.to }. computeFunnel passes no windowsClosedAt, so buildFunnelCtes compares window_end <= now(). Step windows are 14 days (STEP_WINDOW_DAYS) against a month-long period. The PDF note at AnalyticsPdfFunnelSection.tsx:180 words this correctly: 'counts only people past that step's window'.

**Suggested fix:** Reuse the PDF's meaning on the page: 'Counts people across all applications since tracking started. Only people past a step's window at the time this report was made are rated.'

## D146 [minor] PAGE (unverified, from path-report-to-pdf)
File: `packages/twenty-front/src/modules/crm-analytics/utils/buildAnalyticsCategoryBarRows.ts` line 118

**Problem:** The screen's 'Which track converts best?' chart ranks a small-sample rate by its raw value, so a tiny group can lead. The PDF for the same report ranks firm rates first, so the two show different leaders.

**Scenario:** Stored report has Track A with overallEligible 1 and rate 100%, and Track B with overallEligible 200 and rate 40%. The screen's top bar is Track A, drawn lighter. The PDF's top bar and its plain answer both name Track B as converting best.

**Evidence:** getRank returns rate.isInProgress ? -1 : rate.value ?? -2 and has no small-sample rule. buildAnalyticsPdfCategoryBars.ts:32-39 subtracts LIGHTER_RATE_RANK_SHIFT, with the comment 'A small group's high rate must not outrank a firm one'. buildAnalyticsPdfAnswers.ts:136-138 only names rows with overallEligible >= minimumSample.

**Suggested fix:** Rank small-sample rates below every firm rate in getRank, for example rate.isSmallSample ? rate.value - 2, keeping in-progress and unknown rows lower still, as the PDF does.

## D147 [minor] PDF (unverified, from path-report-to-pdf)
File: `packages/twenty-front/src/modules/crm-analytics/utils/buildAnalyticsReportTrendCharts.ts` line 48

**Problem:** The report screen titles the frozen DROP_OFF series 'Drop-off rate over time' without naming the step, though the series covers only the entry step. The Trends tab and the PDF both name it, so the label reads wider than the value.

**Scenario:** A report stores DROP_OFF with stageKey NEW. The screen card reads 'Drop-off rate over time' at, say, 30%. A reader takes that as pipeline drop-off. The PDF heading for the same line says 'Drop-off from New over time', and the Trends tab says 'Drop-off from New'.

**Evidence:** resolveTrendStageKey (crm-analytics-metrics.service.ts:2208-2209) falls back to ENTRY_STAGE_KEY for DROP_OFF, and the contract says 'DROP_OFF (entry step)'. buildAnalyticsReportTrendCharts destructures stageKey but uses it only in the key. AnalyticsTrendsTab.tsx:80-83 and AnalyticsPdfTrendsSection.tsx:449-451 look up the stage label.

**Suggested fix:** Look up stageKey in report.funnel.rows and use t`Drop-off from ${label}` for the DROP_OFF series label, falling back to 'Drop-off rate' if it is not found.

## D148 [minor] PDF (unverified, from path-report-to-pdf)
File: `packages/twenty-front/src/modules/crm-analytics/report-pdf/components/AnalyticsPdfTrendsSection.tsx` line 69

**Problem:** When a trend series was dropped because its query failed at build time, the frozen PDF prints 'Not enough data to draw this line yet.' That gives a false reason, and the word 'yet' implies it will fill in, though the report is frozen and the line is gone for good.

**Scenario:** During report build the DROP_OFF query fails with a non-timeout SQL error. buildTrendSeries logs it and leaves the series out, while NEW_APPLICATIONS is stored, so hasTrendSeries stays true. The PDF's 'Drop-off over time' block then says not enough data, although the funnel in the same PDF has plenty. The screen just omits the card.

**Evidence:** crm-analytics-report.service.ts:345-353 catches the error and leaves the metric out. AnalyticsPdfTrendsSection.tsx:154-166 treats a missing series the same as a series with no values and calls getUnavailableLine(null), whose default branch is line 69. Only the all-missing case at line 418 gets the honest 'not stored in this report' text.

**Suggested fix:** When findAnalyticsPdfTrendSeries returns undefined, print a separate line such as 'This line is not stored in this report.' Keep 'Not enough data' for a stored series with no values.

## D149 [minor] PDF (unverified, from path-report-to-pdf)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsReportView.tsx` line 412

**Problem:** While another report loads, the view keeps the previous report on screen and Download PDF stays enabled, so the button saves the old report while the rail already highlights the new one.

**Scenario:** March is showing and the user clicks February in the rail. February is highlighted, the view dims and still holds March. Page reads can wait several seconds for a slot. The user clicks Download PDF in that gap and gets FloLabs-analytics-monthly-2026-03-01.pdf, thinking it is February.

**Evidence:** useCrmAnalyticsQuery.ts:32 returns data ?? previousData, so report is the old payload while isRefetching is true. AnalyticsReportDownload receives that report and only its own isDownloading state disables the button (Button.tsx:64 disabled={disabled || loading}). isRefetching is not passed to it.

**Suggested fix:** Pass isRefetching to AnalyticsReportDownload and disable the button while it is true, or disable it when report.periodStart or report.periodType differ from the requested props.

## D150 [minor] CHARTS (unverified, from path-chart-truth)
File: `packages/twenty-front/src/modules/crm-analytics/charts/AnalyticsScatterChart.tsx` line 322

**Problem:** Each point's invisible 12px hit circle sits above every point drawn before it. Hovering or clicking a visible dot can therefore hit a neighbouring point, so the tooltip and the filter belong to the wrong group.

**Scenario:** Sources view with no date filter. 'Referral' has 8 people and 'Event' has 7, both at 0%, on an axis of about 4.7px per person. Hovering the centre of Referral's dot shows 'Event, People 7', and clicking filters the page to Event. Points are drawn largest first, so in a cluster the smallest group takes the hover from the larger dots around it.

**Evidence:** plotted.map renders one group per point, each with a transparent r=12 circle followed by the r=5 visible circle. A transparent fill still receives pointer events. AnalyticsCategoryCharts.tsx:318 feeds groupRows sorted by people descending, then catch-all rows, so later and smaller points paint over earlier ones. The tooltip and onClick are on each point's own group.

**Suggested fix:** Render all hit circles in a first pass and all visible dots with their handlers in a second pass, so a visible dot always wins. Alternatively, pick the nearest point from the pointer position.

## D151 [minor] CHARTS (unverified, from path-chart-truth)
File: `packages/twenty-front/src/modules/crm-analytics/charts/AnalyticsColumnChart.tsx` line 303

**Problem:** When x labels are thinned by stride, each shown label stays inside its own single slot. Text wider than the slot is broken mid-word and clamped to two lines, so the date is unreadable.

**Scenario:** Trends, By day, 'People in each stage over time' in a half-width card about 500px wide. Thirty columns give a slot of about 15px and a stride of 5. 'Nov 23' breaks to 'No' / 'v', with '23' clipped by the two-line clamp, so every shown label reads as a fragment of the month with no day. Any custom week range over about 20 buckets does the same.

**Evidence:** xLabelStride at line 203 blanks the other labels, but StyledXLabel (lines 142-153) keeps flex: 1 1 0, min-width: 0, overflow-wrap: anywhere and -webkit-line-clamp: 2, so the blanked neighbours' width is never given to the label.

**Suggested fix:** Give a shown label stride slots of width, for example flex-grow equal to the stride or an absolutely positioned centred label with nowrap, instead of wrapping it inside one slot.

## D152 [minor] CHARTS (unverified, from path-chart-truth)
File: `packages/twenty-front/src/modules/crm-analytics/charts/AnalyticsColumnChart.tsx` line 203

**Problem:** The stride logic meant for time axes also drops category labels. In 'Conversion at each step', every other column has no stage name, and the 'Lowest step' column can be one of them.

**Scenario:** Seven step columns in a two-column grid with a card about 500px wide, for example a 1280px window or the report view on a 1536px laptop. Plot is about 424px and slot about 60px, so stride is 2. Contacted, Saturday meeting and Second meeting have no label. If Contacted is the lowest step, the highlighted column says 'Lowest step 12%' with no stage name unless hovered.

**Evidence:** Line 203 computes Math.ceil(64 / slotWidth), and lines 302-304 print the label only when index % stride === 0. buildStepConversionColumns in buildFunnelCharts.ts:112 uses the same chart for stages. Labels already wrap to two lines, so they would fit. AnalyticsChartGrid allows cards down to 440px, and the card has 16px side padding.

**Suggested fix:** Add a prop for categorical axes that shows every label, wrapped and clamped, and use it for the step conversion charts. Keep stride for time axes only.

## D153 [minor] CHARTS (unverified, from path-chart-truth)
File: `packages/twenty-front/src/modules/crm-analytics/charts/AnalyticsColumnChart.tsx` line 102

**Problem:** A short stacked column is drawn taller than its value. Each non-zero segment has min-height 2px plus a 2px gap, and this overflows the column's percentage height upward. The same happens sideways in the horizontal chart (AnalyticsHorizontalBarChart.tsx:88 and 94).

**Scenario:** 'People in each stage over time': the first tracked week has 11 people across 5 stages and the axis top is 500. The correct height is 200 × 11/500 = 4.4px. The segments need 5 × 2 + 4 × 2 = 18px, so the column reads as about 45 people against the gridlines, and its total label sits over the overflow. On Overview, a stage with 3 people in 3 segments beside a stage with 1,000 draws about 10px instead of about 1px.

**Evidence:** StyledColumn has gap: 2px and an explicit height from total/axisTop. StyledColumnSegment has flex-basis: 0 and min-height: 2px. Nothing clips or adjusts for the floors, and overflow is visible. StyledSegment and StyledBar in the horizontal chart do the same with min-width and gap.

**Suggested fix:** Set the minimum on the whole stack, not on each segment. Drop the gap and segment minimums when the stack is too short for them, or merge small segments, so the outer length stays total/axisTop.

## D154 [minor] SERVER (unverified, from path-chart-truth)
File: `packages/twenty-server/src/modules/analytics/services/crm-analytics-metrics.service.ts` line 2088

**Problem:** Under a program filter, the TRACK series carries the parent track's key and label but holds only that program's numbers. The trend line, tooltip and number table name the track for a program-sized value.

**Scenario:** Filter Program = one Robotics position with Track on All. 'New applications by track' draws one line. Its tooltip and the Show numbers column say 'Robotics & Intelligent Systems: 3', although 3 is that single program and the track has 40 that week. The line also keeps the track's color. 'Overall conversion by track' has the same mismatch.

**Evidence:** resolveSeriesTrackKeys (lines 2123-2127) returns the program's parent track. buildSeriesGroups sets groupLabel from that track at lines 2080-2085 but keeps filter unchanged when programKey is set (lines 2088-2090). AnalyticsTrendTrackCharts.tsx:88 and 131 show groupLabel as the line and column name.

**Suggested fix:** When programKey is set, return the program's own label as groupLabel, keeping the parent track key for color, or have the front end title the card by program.

## D155 [minor] PAGE (unverified, from path-chart-truth)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsOverviewCharts.tsx` line 147

**Problem:** Under a date filter, the Total contacts and Active people tiles count only people created in the range, but their sparklines come from snapshot counts of everyone. The tile and its own sparkline tooltip give different numbers under the same label.

**Scenario:** Date filter Nov 1 to Nov 30 on Overview. The Total contacts tile shows 40 ('People matching these filters'). Hovering its sparkline shows 'Week of Nov 3, Total contacts 1,240'. Active people has the same gap, for example 25 against about 900.

**Evidence:** computeOverview passes dateRange as scopeDateRange to readStageCounts (line 1391), which excludes imported people and filters on created_at. readSnapshotBuckets (line 2450) applies dateFrom and dateTo only to bucket selection, and its dimension rows are all people. The Trends notes explain the daily count basis, but the Overview tiles do not. path-counting also noted this in the shared notes.

**Suggested fix:** Hide the snapshot sparklines on the tiles when a date filter is active, or label their tooltip as everyone at the end of that week rather than the tile's own measure.

## D156 [minor] PAGE (unverified, from path-chart-truth)
File: `packages/twenty-front/src/modules/crm-analytics/utils/buildStageTotalsChartRows.ts` line 54

**Problem:** A stage with no limit still gets a 'Within limit' segment, so the legend says the Signed bar is within a limit it does not have, while its tooltip says 'People'.

**Scenario:** Overview, 'Where is everyone now?': Signed has 60 people and limitDays null. Its bar is drawn in the accent color, and the legend above says that color means 'Within limit'.

**Evidence:** Config gives SIGNED limitDays: null, so pastLimitCount is null. The segment at lines 52-57 is unconditional. The tooltip at line 83 already branches on isDefined(row.pastLimitCount), but the segment and legend do not.

**Suggested fix:** When pastLimitCount is null, use a neutral segment key and label such as 'People' in the same color, so the legend does not claim a limit.

## D157 [minor] CHARTS (unverified, from path-chart-truth)
File: `packages/twenty-front/src/modules/crm-analytics/charts/AnalyticsHorizontalBarChart.tsx` line 181

**Problem:** Legend order follows first appearance across rows, not draw order, so it can differ from the order of the segments in the bars.

**Scenario:** After launch, New has imported inactive people and nobody past limit, and Contacted has both. Segments for New are [withinLimit, inactive]. The legend reads Within limit, Inactive, Past limit, while Contacted's bar draws Within limit, Past limit, Inactive.

**Evidence:** toLegendEntries flattens rows in order into a Map, so a key keeps its first position. buildStageTotalsChartRows.ts:58-77 only includes pastLimit and inactive when above 0, so a row can skip the middle segment.

**Suggested fix:** Always return all three segments, relying on the value > 0 filter when drawing, or pass an explicit legend order to the chart.

## D158 [minor] CHARTS (unverified, from path-chart-truth)
File: `packages/twenty-front/src/modules/crm-analytics/charts/getAnalyticsNiceTicks.ts` line 1

**Problem:** The L10 tick fix covers only rates. MEDIAN_DAYS axes can still land on steps finer than their one-decimal labels, so labels misstate gridline positions.

**Scenario:** A report's 'Median days in a stage over time' with a highest median of 0.9 days. targetCount 4 gives a step of 0.25 and ticks 0, 0.25, 0.5, 0.75, 1, printed as 0.0, 0.3, 0.5, 0.8, 1.0. A highest median of 0.2 gives ticks 0.05 apart, printed 0.1, 0.1, 0.2, 0.2. The compact Trends chart does this when the highest median is above 0.4 and up to 0.5.

**Evidence:** isRate is the only guard on the 2.5 multiple. AnalyticsTrendSmallChart.tsx:172 and buildAnalyticsReportTrendCharts.ts:90 pass isRate false for MEDIAN_DAYS. formatAnalyticsTrendValue.ts:15 prints one decimal. The values come from roundDays, so sub-day medians are possible but only show when every stay in view is that short.

**Suggested fix:** Let callers give a minimum tick step or decimals, such as 0.5 or 0.1 multiples only for MEDIAN_DAYS, or use two decimals on these ticks.

## D159 [minor] PAGE (unverified, from path-states-and-failure)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsTrendsTab.tsx` line 250

**Problem:** isNothingToShow does not check trendsError or smallChartsError, or whether the new queries are still loading. Retained empty payloads from the previous filter therefore show 'No people match these filters' for a filter whose requests failed or have not returned. It is the only tab whose empty check does not check for an error first.

**Scenario:** Source = X matches nobody, so Trends shows EMPTY. Pick Track = AI, which is not cached and has people. Both Trends queries fail on a network drop or a limiter busy error. trends and smallChartBundle remain X's empty payloads and isForbidden is false, so the EMPTY panel stays under the new AI chip with no toast and no Retry. AnalyticsChartCard, which would show the error, is not mounted. Even when the requests succeed, the same message shows under the new chip for the whole load, which can be up to about 25 seconds (10 s slot wait plus 15 s budget), with no dimming.

**Evidence:** Lines 250-264 test only trends, smallChartBundle, and their contents. useCrmAnalyticsQuery.ts:32 keeps previousData after an error on changed variables, as also noted by U01-shell-data. AnalyticsOverviewTab.tsx:76, AnalyticsFunnelTab.tsx:57 and AnalyticsCategoriesTab.tsx:80 all return on error before their empty checks.

**Suggested fix:** Require !isDefined(trendsError) && !isDefined(smallChartsError) && !isTrendsRefetching && !isSmallChartsRefetching in isNothingToShow, so failures reach the cards' error and retry states.

## D160 [minor] PAGE (unverified, from path-states-and-failure)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsOverviewTab.tsx` line 69

**Problem:** Queries the server does not vary by period still carry filter.period in their variables. Changing the period on Trends makes Overview, Funnel and Categories miss the Apollo cache, showing skeletons and re-sending heavy reads that return identical numbers through the limiter of 2 concurrent reads.

**Scenario:** On Trends, click By month, then open Overview, which was already loaded. The overview, funnel and two categories queries have new cache keys because period is MONTH, so their previously loaded results cannot be used. The tab shows skeletons and sends those 4 reads again (the series query is fixed to WEEK and stays cached), though nothing they show depends on period. Reset keeps the period, so this persists. Combined with abandoned reads, this uses up slots and makes the 10 second busy error more likely.

**Evidence:** Variables carrying period: AnalyticsOverviewTab.tsx:69 { filter }, AnalyticsOverviewCharts.tsx:68 { ...filter, status: 'ALL' }, AnalyticsOverviewCategoryCard.tsx:44, AnalyticsFunnelTab.tsx:38 and 50, AnalyticsCategoriesTab.tsx:73. On the server, every filter.period read in crm-analytics-metrics.service.ts is at line 2000 or later (trends and series code), and none is in computeOverview, computeFunnel or computeCategories. The comment at AnalyticsOverviewCharts.tsx:71 shows the intent that the period must not affect this tab, but only the series query applies it.

**Suggested fix:** Pin period to a constant in the variables of queries that ignore it (Overview, Funnel, Categories), for example { ...filter, period: 'WEEK' } as the series query already does, so their cache keys do not depend on the Trends selector.

## D161 [minor] SERVER (unverified, from facade)
File: `packages/twenty-server/src/modules/analytics/facade/crm-analytics-facade.service.ts` line 302

**Problem:** The relation filters soft-deleted submissions and people but not soft-deleted forms, so a form in the trash still feeds New applications. When that form is destroyed, the inner join drops all its submissions at once.

**Scenario:** An admin duplicates the form, names the copy 'Internship Application', collects 5 test submissions, then deletes the copy. For up to 14 days those 5 still count, since f."deletedAt" is not checked. After purge, formId becomes NULL and they drop out of past periods. If the real form is deleted and recreated, its whole history counts for 14 days and then vanishes from all trend buckets.

**Evidence:** The WHERE clause at lines 302-303 checks s."deletedAt" and p."deletedAt" only. Contract line 425 says 'deletedAt IS NULL everywhere, as in CRM lists', though the example SQL at contract line 296 has the same omission. The form relation is SET_NULL by default, so the inner join on s."formId" removes rows after purge.

**Suggested fix:** Add AND f."deletedAt" IS NULL. Decide with the user whether old submissions should survive a form being deleted and recreated.

## D162 [minor] SERVER (unverified, from facade)
File: `packages/twenty-server/src/modules/analytics/facade/crm-analytics-facade.service.ts` line 177

**Problem:** isCustomObjectUsable checks only that the fields submittedAt, form and person exist, not their types. A wrong-type field gives a raw SQL error instead of the 'Not available' state, unlike the person fields, which go through computeFieldStatus.

**Scenario:** formSubmission has a TEXT field named person or form created by hand, or setup-forms.mjs finds an existing field by name and skips creating the relation. hasFormSubmissionObject is true, the SQL reads s."personId" or s."formId", and Postgres raises column does not exist. A TEXT submittedAt fails in the local-date expression instead. The new-applications read runs inside overview and category queries, so those tabs show an error rather than 'Not available'.

**Evidence:** Lines 177-179 only test isDefined(fieldIdByName[fieldName]). The SQL at lines 299-303 assumes relation join columns and a timestamp. Metrics service ~957 feeds this SQL through buildCrmAnalyticsLocalDateSql. This is unlikely, because it needs manual metadata changes.

**Suggested fix:** Pass the required type with each field: form and person RELATION, submittedAt DATE_TIME, name TEXT. Treat a mismatch as unusable.

## D163 [minor] SERVER (unverified, from facade)
File: `packages/twenty-server/src/modules/analytics/facade/crm-analytics-facade.service.ts` line 226

**Problem:** isAuditLogged requires the field flag to be exactly true, while the timeline writer logs a field unless the flag is exactly false. The two disagree when the flag is undefined, which gives a false warning.

**Scenario:** The CRM upgrades to the version that adds field-level isAuditLogged, and the workspace's cached field projection predates that column. stageField.isAuditLogged is undefined. The timeline keeps recording stage changes, but the facade returns false and the page warns that stage changes are not being recorded. The project's stop rule treats that flag as a reason to halt metrics work. It clears only when the cache is rebuilt.

**Evidence:** build-non-audit-logged-field-names-by-object-metadata-id.util.ts:26-29 says 'A projection cached before the column existed has no value, so only an explicit false excludes' and uses !== false. The column arrives in upgrade command 2-40/2-40-instance-command-fast-1788885873410. AnalyticsContent.tsx:124 drives the warning from !meta.fields.isStageAuditLogged. I did not check which version production runs.

**Suggested fix:** Use stageField?.isAuditLogged !== false when stageStatus is 'OK', matching the writer's rule.

## D164 [minor] SERVER (unverified, from facade)
File: `packages/twenty-server/src/modules/analytics/facade/crm-analytics-facade.service.ts` line 318

**Problem:** countImportedApplications ignores the page filters, but its result is shown inside the filtered New applications figure with nothing saying it is workspace-wide.

**Scenario:** Filter Overview to one track holding 3,000 people. The figure reads 120 new applications, then '42,371 imported, dates unknown', which is more imported applications than the track has contacts. A reader takes 42,371 as that track's figure. Filtering by source or status gives the same number.

**Evidence:** Line 318 counts every non-deleted _application row and takes no filter. The call at metrics service ~1442 passes only state and run. AnalyticsFiguresRow.tsx:213-216 shows it under the filtered figure with no scope wording. Contract line 471 says 'Total only', which settles that it has no breakdown, not how it should read under a filter.

**Suggested fix:** When a person filter is active, hide the note or word it as a whole-CRM total, for example 'CRM total: 42,371 imported, dates unknown'.

## D165 [minor] SERVER (unverified, from snapshot)
File: `packages/twenty-server/src/modules/analytics/services/crm-analytics-metrics.service.ts` line 749

**Problem:** isTrackImplied only recognises positions in the config map. An unmapped program under the UNMAPPED track, or program NONE under track NONE, counts as two dimensions, so snapshot metrics report SNAPSHOT_FILTER_COMBINATION even though the 'position' rows answer the filter exactly.

**Scenario:** The CRM has a position option X that is not in the track config. On Tracks and programs, click the program row X. Its parentKey is 'UNMAPPED', so the filter becomes trackKey='UNMAPPED', programKey='X'. TRACK_KEY_BY_POSITION.get('X') is undefined, which is not 'UNMAPPED', so isTrackImplied is false and dimensions has two entries, returning null. Every TOTAL_CONTACTS, ACTIVE_PEOPLE and STAGE_COUNT chart on Trends then says 'Keep only one of Track, Program or Source', although the user clicked one row. Stored rows dimension='position', dimension_key='X' hold the right numbers, and the same click on a mapped program works.

**Evidence:** crm-analytics-metrics.service.ts:749-751 compares only the map result. Category SQL at about line 506 gives unmapped positions parent_key 'UNMAPPED'. getAnalyticsCategoryClickFilter.ts:24 sets trackKey: row.parentKey. crm-analytics-meta.service.ts:265-270 lists unmapped programs under UNMAPPED. resolveSeriesTrackKeys (about line 2124) already maps an unknown program to UNMAPPED and NONE to NONE, but buildSeriesGroups keeps the filter unchanged when programKey is set, so it does not rescue this case. Found by reading the code; not run.

**Suggested fix:** Compute the implied track the way resolveSeriesTrackKeys does: programKey === 'NONE' ? 'NONE' : (TRACK_KEY_BY_POSITION.get(programKey) ?? 'UNMAPPED'), and compare that with filter.trackKey. Share one helper between the two places.

## D166 [minor] SERVER (unverified, from snapshot)
File: `packages/twenty-server/src/modules/analytics/services/crm-analytics-metrics.service.ts` line 2495

**Problem:** A snapshot dated D holds the state at 02:30 on D, because the cron is '30 2 * * *', and the reader takes max(snapshot_date) inside each bucket. A period's total therefore omits everything added after 02:30 on its last day. The same job takes the snapshot that does reflect the period's end, but that row is dated the next day and falls in the next bucket.

**Scenario:** Zone UTC, MONTH. 200 people are created on 2026-11-30 at 10:00. The job at 2026-12-01 02:30 stores a snapshot dated Dec 1 that includes them, then builds the November report. Its TOTAL_CONTACTS bucket for November reads the Nov 30 snapshot, taken at 02:30 before they existed, so the frozen November total is 200 too low, while NEW_APPLICATIONS for November counts their submissions. The By-day line has the same shift: a 'Nov 30' contact total reflects the state at the end of Nov 29, one day behind the New applications point for Nov 30, and a stage move late on the last day lands in the next period.

**Evidence:** crm-analytics-cron-patterns constant: CRM_ANALYTICS_DAILY_CRON_PATTERN = '30 2 * * *'. crm-analytics-snapshot.service.ts:20-23 and 56 date the row with the local date of now(). readSnapshotBuckets' bucket_day uses max(sd.snapshot_date) per date_trunc bucket. The UI label 'from the last daily count in each period' and contract line 492 describe this selection, so the code follows the contract wording, but neither says the last count excludes most of the last day. No Decisions from testing entry settles it. Found by reading the code; not run.

**Suggested fix:** Make the snapshot date mean end of the previous local day, by storing (local today - 1) when the job runs just after midnight, or have the reader use the first snapshot of the next bucket when one exists. Either choice affects rerun rules and the seed tests, so the user should confirm it. If the current meaning stays, state it in the chart and report notes.

## D167 [minor] SERVER (unverified, from sync-sql)
File: `packages/twenty-server/src/modules/analytics/services/crm-analytics-sync.service.ts` line 76

**Problem:** Reconcile takes the person's last stage from the row with the latest happened_at, but merged timeline rows keep an old happensAt or carry a merge date later than the stage change. The row it picks can be stale, so reconcile adds a move the timeline already recorded, even though no timeline row was lost.

**Scenario:** Recruiter X moves NEW to CONTACTED at 10:00 (R1). A follow-up form with a null member moves CONTACTED to INTERESTED at 10:03 (R2). X moves INTERESTED to BEFORE_MEETING at 10:06, which merges into R1. Sync first reads at 10:07 and stores NEW>BEFORE_MEETING dated 10:00 and CONTACTED>INTERESTED dated 10:03. At 02:30 the latest row by happened_at is R2 (INTERESTED) while the person is at BEFORE_MEETING, so reconcile inserts INTERESTED>BEFORE_MEETING dated now(). Result: Entered BEFORE_MEETING counts 2 for one move and restored_count reports 1 with nothing lost. latest_entry picks the reconcile row, so the stage clock restarts up to a day late and shows as a lower bound. A read between the changes does not always avoid it: if X's stage merge is followed by a name-only merge at 10:08 and Y moved C to D at 10:06, the appended row dated 10:08 outranks Y's row, and reconcile adds C>D again.

**Evidence:** resolveTimelineActivityHappensAt is fixed at row creation, and the merge in timeline-activity.repository.ts:434 changes only properties and updatedAt. Lines 74-76 order by happened_at. Line 55 dates an appended row by the updatedAt of the latest merge, which may be a non-stage merge. Integration check R10 in analytics-tests/integration/checks/reconcile.cjs asserts this extra reconcile row as expected. Ordering by source_updated_at alone is not a fix: a later name-only merge on an old row would then win.

**Suggested fix:** Treat the person as in sync when any stored transition within the 10-minute merge window of the latest row already has the current stage key, using a NOT EXISTS beside the current mismatch check, and insert only otherwise. Update check R10.

## D168 [minor] SERVER (unverified, from sync-sql)
File: `packages/twenty-server/src/modules/analytics/services/crm-analytics-sync.service.ts` line 79

**Problem:** The only protection against a late timeline job is the 30-minute person.updated_at guard. When the job runs later than that, reconcile invents the move, then the timeline row arrives and is stored as well, so one move exists twice. Nothing later removes or discounts the duplicate.

**Scenario:** A bulk stage update or a worker outage backs up the entity-events queue. A person moves CONTACTED to ATTENDED at 01:50 and the timeline job runs at 02:40. Daily at 02:30 finds the row missing, sees updated_at is 40 minutes old, and inserts CONTACTED>ATTENDED (reconcile, 02:31). The next sync first-reads the timeline row and stores CONTACTED>ATTENDED (timeline, 01:50), because latest only joins the same source_id. Movement then shows Entered ATTENDED 2 and Left CONTACTED 2 for one move. latest_entry stays on the reconcile row, so the person shows as a lower-bound 'at least' clock even though an exact date is now stored. After an outage the two queues restart together, so reconcile can beat the backlog.

**Evidence:** Lines 71-79 have no check beyond updated_at. Line 48 limits latest to origin = 'timeline', and line 59 inserts any first-seen row. crm-analytics-metrics.service.ts:1193-1196 period_move counts both rows, because each has from_key different from to_key. Check R8 in integration/checks/reconcile.cjs asserts two timeline rows plus one reconcile row, but only checks the row counts. 'Decisions from testing' does not settle this.

**Suggested fix:** Stored rows never change, so discount at read time: in the transition CTE of build-crm-analytics-cte.util.ts, drop a reconcile row when a timeline row exists for the same person and to_stage with happened_at at or before the reconcile row and source_updated_at after it. That removes the double count and restores the exact stage clock.

## D169 [minor] SERVER (unverified, from sync-sql)
File: `packages/twenty-server/src/modules/analytics/services/crm-analytics-sync.service.ts` line 53

**Problem:** An appended row takes from_stage from the last stored stage of that same timeline row, not the person's previous stage. When another actor's row sits between, the from_stage is wrong, and Left counts go to the wrong stage.

**Scenario:** Member X moves NEW to CONTACTED (R1, read by sync). Member Y moves CONTACTED to ATTENDED (R2, read). X moves ATTENDED to SECOND_MEETING within 10 minutes, merging into R1. Line 53 stores CONTACTED>SECOND_MEETING, but the real move was ATTENDED>SECOND_MEETING. Movement shows Left CONTACTED 2 and Left ATTENDED 0 instead of 1 and 1, although Entered ATTENDED is 1 and that person has since left it.

**Evidence:** latest (lines 45-49) is keyed by source_id only, and line 53 uses l.to_stage. Metrics left_total at crm-analytics-metrics.service.ts:1201-1202 groups by from_key. The contract SQL has the same expression, and Y16 only tests a single row with no other actor, so the two-actor case is untested. 'Decisions from testing' does not settle this.

**Suggested fix:** For a row seen before, set from_stage to the person's latest stored to_stage, ordered as reconcile orders it, instead of the row's own last stage. Keep latest for the did-it-change guard.

## D170 [minor] SERVER (unverified, from overview)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsOverviewTab.tsx` line 96

**Problem:** When a date filter leaves totalContacts at 0, the tab returns the EMPTY panel 'No people match these filters'. That hides a non-zero New applications figure and the imported-people notice, and the message is untrue for imported people who were dropped only because their date is unknown.

**Scenario:** Filter is Last 7 days. No new Person rows were created that week, but 5 imported people resubmitted the application form. The server returns totalContacts 0, newApplications 5 and importedExcludedByDate 1200. The page shows only 'No people match these filters', so the 5 applications and the contract's notice '1200 imported people have no known application date and are not shown' never appear.

**Evidence:** computeOverview scopes people by created_at >= tracking start (buildCurrentStateDateConditions) but counts submissions by submittedAt with no date scope, so the two can disagree. The early return at line 96 comes before the notices at line 106. Contract section 8 lists 'Date filter on' as a state triggered by importedExcludedByDate > 0. The EMPTY_FUNNEL panel already has an imported-people explanation, and EMPTY has none.

**Suggested fix:** Show EMPTY only when totalContacts, importedExcludedByDate and newApplications are all zero or null. Otherwise render the figures with the notice, or add the imported explanation and count to the panel.

## D171 [minor] SERVER (unverified, from overview)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsFiguresRow.tsx` line 215

**Problem:** The imported applications note ignores every filter but sits under a filtered figure with nothing saying so, so it reads as belonging to the current selection.

**Scenario:** With Track = Robotics and Last 7 days, the tile reads '12, Nov 2 to Nov 8, 1,200 imported, dates unknown'. The 1,200 is the workspace total across all tracks, but a reader takes it as Robotics imports. Status = Left gives the same line.

**Evidence:** facade countImportedApplications counts all of _application with no person link, and computeOverview:1449 passes no filter. Contract section 6 requires a total only, but the row already has hasActiveFilter available and does not use it here.

**Suggested fix:** When hasActiveFilter is true, word the note as '1,200 imported in total, dates unknown, not filtered', or hide it.

## D172 [minor] SERVER (unverified, from overview)
File: `packages/twenty-front/src/modules/crm-analytics/utils/buildStageTotalsChartRows.ts` line 53

**Problem:** A MAIN stage with no limit, in practice Signed, is drawn as a 'Within limit' segment, in the color the legend calls Within limit, although it has no limit. The tooltip code at line 82 already treats this case separately.

**Scenario:** With 50 people in Signed (limitDays null, pastLimitCount null), withinLimit = 50 and the bar is accent colored. The legend beside the chart says accent means 'Within limit', and the chart's aria label says the same, so Signed reads as 50 people within a limit that does not exist. Hovering shows 'People 50', which disagrees with the legend.

**Evidence:** buildMainRow always emits the withinLimit segment. Only the tooltip branches on isDefined(row.pastLimitCount). AnalyticsHorizontalBarChart builds its legend from every segment label, and stage SIGNED has limitDays null in crm-analytics-config.constant.ts.

**Suggested fix:** When pastLimitCount is null, emit a segment keyed and labeled 'People' with a neutral or distinct color, so it does not join the Within limit legend entry.

## D173 [minor] SERVER (unverified, from overview)
File: `packages/twenty-front/src/modules/crm-analytics/utils/buildStageTotalsChartRows.ts` line 104

**Problem:** The 'N inactive' figure includes inactive people in OTHER stages such as Interested, but buildOtherRow drops inactiveCount, so the inactive shown in the stage chart adds up to less than the figure.

**Scenario:** 500 imported people sit unmoved across MAIN stages and 40 sit unmoved in Interested. The server returns inactivePeople 540 and an Interested row with inactiveCount 40. The figure reads '540 inactive', but the bars and tooltips account for only 500, and the Interested tooltip shows just 'People 40'.

**Evidence:** readStageClockTotals sums inactive over all active stages, and buildActiveConditionSql admits kind OTHER. buildStageTotals sets inactiveCount for every configured stage (metrics service line 1530). buildOtherRow reads only row.count, and AnalyticsStageTotalsTable has no inactive column.

**Suggested fix:** Add an Inactive tooltip row, and optionally a segment, to buildOtherRow when row.inactiveCount > 0, matching buildMainRow.

## D174 [minor] SERVER (unverified, from categories)
File: `packages/twenty-server/src/modules/analytics/services/crm-analytics-metrics.service.ts` line 1904

**Problem:** Category New applications inner-joins submissions to category_member, so applications with no linked person appear in no row, while Overview counts them. Nothing tells the reader the rows fall short.

**Scenario:** No filters, with 100 Internship Application submissions in the range, 15 of them with personId NULL (the form wrote null, or the person was later destroyed). Overview shows New applications 100. The Sources view, whose code comment says its rows add up, sums to 85. There is no 'No person' row and no note. A monthly report shows the same gap between newApplications and its track rows.

**Evidence:** Line 1904 is `FROM submission sub JOIN category_member cm ON cm.person_id = sub.person_id`. computeNewApplications (line 976) skips the scope join when there is no person filter (buildSubmissionScopeJoinSql, line 1354), so null-person rows count there. Contract 'Decisions from testing' says applications with no person still count, and the facade comment at crm-analytics-facade.service.ts:298 says the same. category_member only ever holds person_ids from scope, so a NULL person_id can never match.

**Suggested fix:** In the unfiltered case, return the count of submissions with no person in the categories payload and add a note under the table such as '{n} applications have no linked person'. Alternatively, add a separate row for them to the Sources and Tracks views. Keep them out of filtered views, as Overview does.

## D175 [minor] SERVER (unverified, from categories)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsCategoryCharts.tsx` line 382

**Problem:** With a status filter on, the heatmap, scatter, answer cards and number table show rates and cohort counts that ignore status, beside People and Active that follow it. Only the 'Which converts best?' card says so.

**Scenario:** Set Status = Exited on Tracks & sources. The AI row shows People 40, Active 0, People who applied 300, Overall 12%, and step rates over all 300. The heatmap note, scatter note, Best converting and Biggest drop cards, and 'All the numbers' table carry no caveat. The scatter plots x = 40 (exited only) against y = the all-status rate, so a reader takes 12% as the rate of people who left.

**Evidence:** readFunnelGroups (metrics service line 1769) applies withoutStatusFilter, while readCategoryPeople passes the status through. AnalyticsCategoryCharts.tsx:260 adds 'Rates ignore the status filter.' only to rateNote, used by the card at line 366. The notes at lines 382 and 395 are fixed text. AnalyticsCategoryTable receives no filter prop at all. Contract 'Decisions from testing', Status filter, says the page says so where other rates show.

**Suggested fix:** Append the same status sentence to the heatmap and scatter notes and show it under the answer cards. Pass the status to the number table, or set a note on its 'All the numbers' card, covering both the rate columns and People who applied.

## D176 [minor] SERVER (unverified, from categories)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsCategoriesTab.tsx` line 105

**Problem:** The empty check looks only at people, so a date range holding real applications from existing people shows 'No people match these filters' and hides those counts.

**Scenario:** Filter to Nov 1 to 7 and one source. Three imported people submit the Internship Application that week and no new person is created. Their rows return people 0, newApplications 3. Overview shows New applications 3, but this tab replaces everything with the EMPTY panel. The Overview 'People by track' and 'Top sources' cards do the same through hasPeople, which reads only the people segments, and say no one in this view has a track or source.

**Evidence:** computeCategories builds groupKeys from people, new applications and funnel groups (lines 1107-1111), so these rows are sent to the page. readCategoryPeople applies buildCurrentStateDateConditions, which drops people created before the range or before tracking start. readCategoryNewApplications has no date on scope. public-form.service.ts:214 upserts an existing person, so a resubmission adds a submission without a new createdAt. AnalyticsCategoriesTab.tsx:105 tests only `row.people === 0`.

**Suggested fix:** Treat the tab as empty only when people, newApplications and cohortSize are all zero or null. For the Overview card, also count rows with newApplications above zero when deciding hasPeople.

## D177 [minor] SERVER (unverified, from categories)
File: `packages/twenty-front/src/modules/crm-analytics/utils/getAnalyticsCategoryChartRows.ts` line 19

**Problem:** The chart level is chosen from the new filter but applied to the previous payload, so clicking a track briefly draws every program of every track as one ranked list.

**Scenario:** No filters, Tracks and programs view. Click the AI track. Until the query returns, up to the 15 second read limit, useCrmAnalyticsQuery still gives the old unfiltered payload, while filter.trackKey is already set. programRows then holds all programs in the payload, up to 39. People bars, rate bars, heatmap and scatter redraw with them, and the Largest and Best converting cards name programs from other tracks under the chip for AI. A second click in that window filters to a program the user never saw under AI.

**Evidence:** Lines 19-23 return programRows whenever trackKey or programKey is set and programRows is non-empty. The server always sends program rows with an unfiltered payload (orderedRows, metrics service lines 1155-1163). useCrmAnalyticsQuery returns data ?? previousData, as noted in L18. AnalyticsCategoriesTab passes the current filter with the retained payload. The view is dimmed by isRefetching, but it still shows and accepts clicks on rows from another level. L19 covers the period labels, not this.

**Suggested fix:** Choose the level from the payload's own filter, by returning the applied filter in the payload or holding the filter that produced it, so a retained payload keeps its old level until the new one arrives.

## D178 [minor] SERVER (unverified, from meta)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsSyncLine.tsx` line 37

**Problem:** The last-sync line works out its relative time from the browser clock, not the server's meta.asOf, so a wrong client clock makes the line untrue.

**Scenario:** The server sets lastSuccessfulSyncAt = 12:00:00 and asOf = 12:02:00. A laptop clock 5 minutes slow reads 11:57:00, so the line says 'Last updated in 3 minutes.' A laptop clock 2 hours fast shows 'Last updated about 2 hours ago' with no stale banner, because isStale is false on the server. The header then contradicts the page's own stale state.

**Evidence:** beautifyPastDateRelativeToNow (twenty-front/src/utils/date-utils.ts:96-115) uses new Date() and calls formatDistanceToNow with addSuffix. Its 30-second 'now' branch uses Math.abs, but past that a future date prints 'in ...'. The server computes isStale from its own now() (crm-analytics-meta.service.ts:141, 176, 193-195). The sibling getAnalyticsDailyCountWarning.ts:21 compares against asOf, so the two sync messages use different clocks.

**Suggested fix:** Correct for skew: pass the date shifted by (Date.now() - new Date(meta.asOf).getTime(), measured when meta arrives) to the formatter, or at least clamp a future lastSuccessfulSyncAt to 'just now'. AnalyticsSyncLine needs asOf as a prop for this.

## D179 [minor] SERVER (unverified, from meta)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsSyncLine.tsx` line 37

**Problem:** The relative time is formatted without the user's locale, so the sentence is translated but the time inside it stays English.

**Scenario:** A user with CRM locale fr-FR sees the translated catalog string around an English time, such as 'Derniere mise a jour 12 minutes ago.', on every Analytics screen. English users are not affected.

**Evidence:** beautifyPastDateRelativeToNow takes a locale as its second argument and passes it to date-fns; with none, date-fns uses en-US. AnalyticsSyncLine.tsx:37 passes only the date. EmailThreadMessageSender.tsx:57, AiChatMessage.tsx:317 and LogConsoleTimeCell.tsx:47 all pass localeCatalog.

**Suggested fix:** Read localeCatalog the way those components do and pass it as the second argument. The 'just now' comparison on line 38 still works because t`now` is unchanged.

## D180 [minor] SERVER (unverified, from meta)
File: `packages/twenty-front/src/modules/crm-analytics/utils/getAnalyticsDailyCountWarning.ts` line 32

**Problem:** The banner says the daily count 'has not run since' the last fully clean daily row, but a run whose count and reconcile succeeded and only a later step failed is also not 'ok'. The banner then states something false.

**Scenario:** The reports step throws every night, for example a 120-second statement timeout on one report, or trimLog fails. Each night's timeline read, reconcile and snapshot succeed, so today's daily_snapshot rows exist, yet the row is closed as 'failed'. Once the last 'ok' row is over 26 hours old, the page says 'The daily count has not run since Nov 6. Trends and reports may be missing.' The count did run last night and trends are complete; only reports are behind. The reader is pointed at the wrong problem.

**Evidence:** crm-analytics-workspace-daily.job.ts:142 sets status 'failed' if any step failed, and steps run on after a failure (lines 113-139). crm-analytics-meta.service.ts:167-172 reads lastReconciliationAt only from rows with status 'ok', as contract section 5 requires. That rule is fine for the field; the wrong part is the banner wording built on it. The payload has no field for a daily run that finished with a failed step, so the page cannot tell the cases apart.

**Suggested fix:** Keep lastReconciliationAt as it is and change the wording to something true for both cases, such as 'The daily job has not finished cleanly since {date}. Trends and reports may be incomplete.' If a sharper message is wanted, add the last daily attempt's status to meta, which means changing the types file on both server and front.

## D181 [minor] SERVER (unverified, from metrics-entry)
File: `packages/twenty-server/src/modules/analytics/services/crm-analytics-metrics.service.ts` line 1367

**Problem:** resolveNewApplicationRanges does not clamp a future dateTo to localToday, so a running count is compared with a full previous span of the whole requested length. Trend buckets do clamp this date.

**Scenario:** Today is 2027-03-08 and tracking started in 2026. A custom range of 2027-03-01 to 2027-03-31 gives dayCount 31, current Mar 1 to 31 with only 8 days of data, and previous Jan 29 to Feb 28, 31 full days. With 40 and 150 applications, the Overview tile shows 40 and a change of -110 for a month that is one quarter over. A wholly future range such as Apr 1 to Apr 30 shows 0 against the 30 days before it. The label also reads 'Mar 1 to Mar 31', and getCategories reuses the same range.

**Evidence:** Line 1367 is `const to = dateTo ?? context.localToday`, and line 1373 counts days from that value. computeCrmAnalyticsTrendBuckets uses `dateTo < localToday ? dateTo : localToday`. AnalyticsFilterBar.tsx isToDateAllowed sets no upper limit, so the UI can send a future date. AnalyticsFiguresRow.tsx:161-164 subtracts previous from current without a check. getFiguresWithTrackedPrevious only nulls a previous span that starts before tracking.

**Suggested fix:** Set `to` to the earlier of dateTo and localToday before computing dayCount and the previous span, and return that clamped `to`. For a range wholly in the future, return a null previous value instead of using the existing `requestedFrom > to` fallback, which would count today.

## D182 [minor] SERVER (unverified, from metrics-entry)
File: `packages/twenty-server/src/modules/analytics/services/crm-analytics-metrics.service.ts` line 751

**Problem:** isTrackImplied recognizes only programs in the config, so an unmapped program under the UNMAPPED track counts as two dimensions. Snapshot series then return SNAPSHOT_FILTER_COMBINATION, although the position dimension answers the query exactly.

**Scenario:** On Categories, click a program row under Unmapped. getAnalyticsCategoryClickFilter sends trackKey 'UNMAPPED' and programKey as the raw value. TRACK_KEY_BY_POSITION.get(raw) is undefined, which does not equal 'UNMAPPED', so isTrackImplied is false and resolveSnapshotDimension returns null. TOTAL_CONTACTS, ACTIVE_PEOPLE and STAGE_COUNT lines go unavailable with 'Keep only one of Track, Program or Source', although the user chose one row. The same click on a mapped program works. Mapped position values are provisional, so unmapped rows are likely on real data.

**Evidence:** Line 751 is `TRACK_KEY_BY_POSITION.get(filter.programKey) === filter.trackKey`. resolveSeriesTrackKeys at about line 2126 already treats a missing mapping as UNMAPPED_CATEGORY_KEY. The snapshot SQL in crm-analytics-snapshot.service.ts writes position rows under the raw value, so `dimension = 'position', dimension_key = raw` holds the right count. getAnalyticsCategoryClickFilter.ts sets `trackKey: row.parentKey, programKey: row.key`.

**Suggested fix:** Compare with the same fallback: `(TRACK_KEY_BY_POSITION.get(filter.programKey) ?? UNMAPPED_CATEGORY_KEY) === filter.trackKey`. Unmapped programs then resolve to the position dimension.

## D183 [minor] SERVER (unverified, from series-cohort-movement)
File: `packages/twenty-server/src/modules/analytics/services/crm-analytics-metrics.service.ts` line 749

**Problem:** isTrackImplied only recognises mapped positions, so a program under the Unmapped track counts as two dimensions and every snapshot series goes unavailable.

**Scenario:** On Categories, click an unmapped program row. The filter becomes trackKey UNMAPPED plus programKey RAW_VALUE. TOTAL_CONTACTS, ACTIVE_PEOPLE and STAGE_COUNT return SNAPSHOT_FILTER_COMBINATION. The Overview sparklines vanish, and the Trends charts say 'Keep only one of Track, Program or Source' although the user clicked one row.

**Evidence:** getAnalyticsCategoryClickFilter.ts sends { trackKey: row.parentKey, programKey: row.key }. Line 751 compares TRACK_KEY_BY_POSITION.get(programKey), which is undefined for an unmapped position, with 'UNMAPPED', so isTrackImplied is false and dimensions.length is 2. The snapshot stores 'position' rows for raw values, so the data exists. resolveSeriesTrackKeys (line 2126) already applies the ?? UNMAPPED fallback. Confirms note [U03-filters].

**Suggested fix:** Compare (TRACK_KEY_BY_POSITION.get(filter.programKey) ?? UNMAPPED_CATEGORY_KEY) === filter.trackKey in isTrackImplied.

## D184 [minor] SERVER (unverified, from series-cohort-movement)
File: `packages/twenty-server/src/modules/analytics/services/crm-analytics-metrics.service.ts` line 2088

**Problem:** Under a program filter, the TRACK series keeps the track's name but holds only that program's people, so the label says more than the value.

**Scenario:** Filter to program MACHINE_LEARNING_ENGINEERING_INTERN. 'New applications by track' draws one line, and its legend and table column read 'Artificial Intelligence & Software Engineering', with a value of, say, 3 for the week. The whole track had 40. A reader of the legend or table takes 3 as the track's count, and only the filter chip hints otherwise.

**Evidence:** resolveSeriesTrackKeys returns the program's parent track (line 2123), so groupLabel is the track label from buildCategoryLabel (line 2080). The filter stays the unchanged page filter with programKey (lines 2088-2090), so readNewApplicationBuckets and readFunnelGroups scope to the program. The label reaches the legend and table through getLineLabel in AnalyticsTrendTrackCharts.tsx:88.

**Suggested fix:** When programKey is set, use the program's label as groupLabel (from positionsAppliedFor options) while keeping groupKey as the track so the color stays.

## D185 [minor] SERVER (unverified, from series-cohort-movement)
File: `packages/twenty-server/src/modules/analytics/services/crm-analytics-metrics.service.ts` line 2030

**Problem:** One failing series fails the whole bundle, because all series share one transaction with no per-series isolation, so unrelated and already computed series are lost.

**Scenario:** Overview sends NEW_APPLICATIONS, ACTIVE_PEOPLE, TOTAL_CONTACTS and OVERALL_CONVERSION together. If the funnel statement for OVERALL_CONVERSION hits the 8 second limit, or the 15 second budget ends during the 5 track funnel statements on Trends, the query rejects. 'New applications over time' or 'New applications by track' then shows an error though its statements were cheap or already finished. Retry repeats it. This needs a slow database: the contract records Overview and the monthly conversion trend under 1 second at 43,000 people, so it was not seen in practice. No series can be mislabeled, since nothing partial is returned.

**Evidence:** computeSeriesBundle has no try/catch. buildPageReadRunner rethrows, and Postgres aborts the transaction after a timeout, so later statements cannot run either. The report path isolates each metric (crm-analytics-report.service.ts:335-353). The Trends small-chart bundle puts MEDIAN_DAYS, the STAY_CTES query, with the five other charts.

**Suggested fix:** Wrap each series in SAVEPOINT and ROLLBACK TO on a statement timeout, return that series with a new unavailableReason, and stop early with the remaining series marked once the budget is spent.

## D186 [minor] SERVER (unverified, from series-cohort-movement)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsOverviewCharts.tsx` line 138

**Problem:** Under a date filter, the Active people and Total contacts tiles count only people created in range, while their sparklines from the same series count the whole pipeline, imported people included.

**Scenario:** Choose Last 30 days with 5,000 imported people and 40 new ones. The Active people tile reads 40, as does Total contacts if all are active. The sparkline beside it and its tooltip read 'Active people 5,012' for each week. The tab's own note says imported people are not shown, but the line under the figure is mostly them.

**Evidence:** Figures use buildCurrentStateDateConditions ('p.created_at >= $2' plus the range, service line 321). readSnapshotBuckets (service line 2450) applies dateFrom and dateTo only to bucket choice through computeCrmAnalyticsTrendBuckets, since stored snapshot rows have no created-at dimension. AnalyticsFiguresRow draws both for the same tile with no caveat.

**Suggested fix:** Hide the ACTIVE_PEOPLE and TOTAL_CONTACTS sparklines when dateFrom or dateTo is set, or state in the tooltip that the line is the whole pipeline regardless of the date filter.

## D187 [minor] SERVER (unverified, from series-cohort-movement)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsMovementTable.tsx` line 29

**Problem:** In a frozen report, the 'Now' column shows the count when the report was generated, not the current count.

**Scenario:** Open the March monthly report in June. The 'What moved this period?' table shows Now = 120 for Contacted. That is the count on the night of April 1, while the live count may be 300. The same report's stuck card says 'as of when this report was made', but this column and its note do not. A backfilled report's value also falls well after its own period.

**Evidence:** computeMovement reads count_now from scope at run time (service lines 1203-1205), and contract line 503 makes it current state at generated_at. AnalyticsReportView.tsx:511 reuses AnalyticsMovementTable unchanged, whose header is t`Now`, and the note at line 509 does not mention it. The contract settles the value, not this label.

**Suggested fix:** Give AnalyticsMovementTable a label prop, such as 'At report date' from the report view, or add the as-of wording to the report card's note.

## D188 [minor] SERVER (unverified, from series-cohort-movement)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsReportView.tsx` line 510

**Problem:** The report's movement empty state can never show, because computeMovement always returns one row per configured stage.

**Scenario:** A weekly report for a week with no stage moves shows the card with 12 stage rows of '0 | 0' and no bars, not a statement that nobody moved. The Trends tab and the PDF both show a 'no one moved' message for the same data.

**Evidence:** computeMovement maps over CRM_ANALYTICS_CONFIG.stages (service line 1220), so report.movement.length is never 0. AnalyticsTrendsTab.tsx:299 uses hasMovement (enteredInPeriod or leftInPeriod above 0), and AnalyticsPdfTrendsSection.tsx:252 filters to moved rows. This card also has no emptyMessage.

**Suggested fix:** Use isEmpty={!report.movement.some((row) => row.enteredInPeriod > 0 || row.leftInPeriod > 0)} with an emptyMessage such as 'No one changed stage in this period.'

## D189 [minor] SERVER (unverified, from api)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsFilterBar.tsx` line 272

**Problem:** The server now rejects dates after 2100-12-31, but the date input's commit check has no upper limit. A mistyped far-future year therefore errors the whole tab instead of being held back like a too-early year.

**Scenario:** Choose Custom dates and type 12/31/2206 in To date. isToDateAllowed passes because the pattern matches, the year is at least the tracking year and the date is after dateFrom. After the 600 ms idle commit, every tab query carries dateTo 2206-12-31. parseCrmAnalyticsLocalDate throws 'Invalid analytics dateTo', so the tab shows its error panel and toast until the user corrects the date.

**Evidence:** AnalyticsFilterBar.tsx:272-274 only checks COMPLETE_DATE_PATTERN and year >= the tracking year. The To input gets no max, because latestDate is not passed at lines 351-357. parse-crm-analytics-filter.util.ts:27 and 124 reject values above MAXIMUM_LOCAL_DATE. AnalyticsOverviewTab.tsx:77 renders the ERROR panel on any query error. The comment at AnalyticsFilterBar.tsx:172 shows this check exists to stop incomplete typed years reaching the server. Traced by reading; not run.

**Suggested fix:** Add an upper year bound to isCompleteDateInReach that matches the server's 2100-12-31, or a smaller sensible limit, so such a draft is not committed.

## D190 [minor] SERVER (unverified, from api)
File: `packages/twenty-server/src/modules/analytics/services/crm-analytics-database.service.ts` line 58

**Problem:** A page statement that hits the 8 second statement_timeout before the 15 second budget ends is rethrown as a raw database error. It surfaces as INTERNAL_SERVER_ERROR and is captured as an exception, not as the clean TIMEOUT busy error.

**Scenario:** Under load, the first heavy Overview statement starts about 200 ms into the read and is cancelled by Postgres at about 8.2 s (code 57014). Date.now() is below the deadline, so the catch rethrows the raw error. generateGraphQLErrorFromError wraps it as INTERNAL_SERVER_ERROR with the message 'canceling statement due to statement timeout' and the friendly text 'An error occurred.' The user does not see 'Analytics is busy right now', and each occurrence is reported as a 500-class exception. The same slow statement at about 15 s gets the clean TIMEOUT error.

**Evidence:** crm-analytics-database.service.ts:57-59: `throw Date.now() >= deadline ? buildPageReadBusyError() : error`. generate-graphql-error-from-error.util.ts builds an INTERNAL_SERVER_ERROR for any non-HttpException. shouldCaptureException skips only BaseGraphQLError codes in graphQLErrorCodesToFilter, and that list contains TIMEOUT (global-exception-handler.util.ts:41). crm-analytics-report.service.ts:42-55 already recognises code 57014 for jobs. The 'Query planner' decision in the contract records reads hitting this limit at 43,000 people, so the path is reachable. Traced by reading; executeRawQuery wrapping not fully followed, and not run.

**Suggested fix:** In the runner's catch, also return buildPageReadBusyError() when the error is a statement timeout (code 57014), reusing the check the report service already has, for example by moving isStatementTimeout to a shared util.

## D191 [minor] SERVER (unverified, from path-report-build)
File: `packages/twenty-server/src/modules/analytics/services/crm-analytics-report.service.ts` line 161

**Problem:** Provisional reports for periods before a moved-later tracking start are never rebuilt, yet they keep promising a rebuild. Only periods after the current tracking start are candidates.

**Scenario:** Reports are built on the default start of 2026-10-27 with isProvisional true, including weeks 2026-11-02 and 2026-11-09. After the audit, CRM_ANALYTICS_TRACKING_START_AT moves to 2026-11-15 and isProvisional goes false. Those two weeks are not candidates, so they stay in the rail for good. They still show 'It will be rebuilt once they are confirmed', with old definitions and the old tracking date.

**Evidence:** computeCrmAnalyticsReportPeriods only lists periods from computeFirstPeriodStart(firstFullLocalDate) on (compute-crm-analytics-report-periods.util.ts:208-212), and existingRows only subtract from that list. No code deletes or re-marks stored rows outside it. listReports returns every row. The banner is at AnalyticsReportView.tsx:417-421, and the PDF's matching provisional text is at AnalyticsPdfFirstPage.tsx:158-166. CLAUDE.md lists tracking start as a value the user confirms after the audit, so this move is expected.

**Suggested fix:** Once isProvisional is false, handle stored provisional rows before the first current period: delete them or mark them as superseded. Alternatively, have the view drop the rebuild promise when periodStart is before the current tracking start.

## D192 [minor] SERVER (unverified, from path-report-build)
File: `packages/twenty-server/src/modules/analytics/services/crm-analytics-report.service.ts` line 187

**Problem:** One period's persistent failure stops every newer period. buildMissingReports has no per-period isolation, and the queue is oldest first, so the same period is retried first on every run. The cap of 8 does not cause starvation alone; it drains in time.

**Scenario:** At high volume, a statement that only MONTH reports run keeps passing the 120 second job limit: computeCohorts, or the monthly OVERALL_CONVERSION series whose range reaches back 24 months. The oldest missing MONTH report sorts first, and buildReport throws (series timeouts are rethrown at line 346). The loop ends, nothing later is attempted, and tomorrow the same MONTH period is first again. Weekly reports, which could succeed, are never built while it keeps failing. This needs a repeating failure and comes from reading the code; it was not run.

**Evidence:** Line 187 awaits buildReport inside the loop with no try/catch. comparePeriods sorts by periodEnd, then MONTH before WEEK. runStep('reports') in crm-analytics-workspace-daily.job.ts:133 only records the failure. Nothing skips a failing period on the next run.

**Suggested fix:** Catch per period and log it, then continue with the remaining periods within the time budget. Rethrow or record the first failure after the loop, so the step still reads as failed. The failing report stays unstored and is retried on the next run.

## D193 [minor] SERVER (unverified, from path-report-build)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsReportView.tsx` line 426

**Problem:** The funnel card note says people who applied in this period are not rated yet, but a monthly report's step rates do include them once their step window has closed. The label disagrees with the value.

**Scenario:** November monthly report, generated Dec 1 at 02:30, with a 14-day first step window. Someone who applied on Nov 3 has a window ending Nov 17, so they count in eligible and reachedNext for the first step's rate. Everyone who applied up to about Nov 16 is rated there. The note says the reverse, so a reader assumes the ledger's rates exclude November applicants.

**Evidence:** cohortDateRange is { from: null, to: range.to } (crm-analytics-report.service.ts:229), which includes the period's own applicants. computeFunnel passes no windowsClosedAt, so eligibility is window_end <= now() per step (crm-analytics-metrics.service.ts:365-367, 388). Only the overall 90-day rate and the weekly report's first step (14-day window against a 7-day period) truly exclude the period's own people. The same claim is in the comment at crm-analytics-report.service.ts:227.

**Suggested fix:** Reword the note, for example: 'Counts people across all applications since tracking started, up to the end of this period. A rate only includes people whose time for that step has passed when the report was made.'

## D194 [minor] SERVER (unverified, from path-concurrency-limits)
File: `packages/twenty-server/src/modules/analytics/services/crm-analytics-database.service.ts` line 58

**Problem:** A page statement that hits the 8 second limit before the 15 second deadline is not treated as a timeout. It reaches the user as a generic 500 and reaches Sentry as 'Data validation error.'

**Scenario:** An Overview read has used 3 s when its next statement runs into the 8 s limit, so the error arrives at 11 s, before the 15 s deadline. Postgres raises 57014. The catch sees Date.now() < deadline and rethrows the wrapped error. The GraphQL response has message 'Data validation error.', code INTERNAL_SERVER_ERROR and friendly text 'An error occurred.', and a Sentry event is captured. The same slow statement late in a read, once the limit has shrunk, gives the clear busy message and no Sentry event. So one overload shows two different messages, and the operator is told it is a data validation problem.

**Evidence:** ClientQueryExecutor.execute wraps every error in computeTwentyOrmException. POSTGRESQL_ERROR_CODES has QUERY_CANCELED '57014', so it is in KNOWN_POSTGRES_ERROR_CODES and becomes new PostgresException('Data validation error.', errorCode) (compute-twenty-orm-exception.util.ts:133-136). use-graphql-error-handler.hook.ts sends non-BaseGraphQLError errors to generateGraphQLErrorFromError, and shouldCaptureException returns true for it. Line 58 only tests Date.now() >= deadline. The contract says the 8 second limit was actually hit at 43,000 people before the planner fix, so this is a reachable path.

**Suggested fix:** In the catch, also convert a canceled query: throw Date.now() >= deadline || isQueryCanceledError(error) ? buildPageReadBusyError() : error. isQueryCanceledError already exists in workspace-query-runner/utils and reads .code, which PostgresException keeps.

## D195 [minor] SERVER (unverified, from path-concurrency-limits)
File: `packages/twenty-server/src/modules/analytics/services/crm-analytics-database.service.ts` line 79

**Problem:** A read whose client has gone away keeps its place in the queue, then takes a slot and runs in full. Filter or tab changes therefore push the view the user is looking at past the 10 second wait, and it fails as busy.

**Scenario:** A large workspace where each analytics query takes about 3 s. On Overview a filter change sends 5 queries (overview, funnel, series, two categories). The user clicks three chips within 2 s, so 15 reads are queued and 2 run at a time, about 22 s to drain in order. The first two clicks' 10 reads are for filters no longer on screen, but they still run. The third click's 5 reads would not start for 15 to 21 s, so each hits PAGE_READ_SLOT_WAIT_MS and gets the busy error. AnalyticsOverviewTab replaces the tab with 'This view could not load', although the only load was the user's own abandoned requests. Switching from Overview to Trends mid-load has the same effect. Traced by reading the code; not run.

**Evidence:** runPageTransaction takes only workspaceId and work. git grep for signal, AbortController, req.destroyed and 'close' under modules/analytics finds nothing, and the resolver passes no request object. pageReadWaiters is strict FIFO with a 10 s timer from arrival, and a granted waiter always runs. useCrmAnalyticsQuery re-queries on every variable change with fetchPolicy cache-and-network, and AnalyticsOverviewTab and its children send 5 queries for one filter.

**Suggested fix:** Pass the request's abort state into runPageTransaction, for example from the GraphQL context req 'close' event. Remove the waiter from pageReadWaiters when the client disconnects, and skip work if it has already gone when the slot is granted. Check it again in buildPageReadRunner so a running read stops at its next statement.

## D196 [minor] SERVER (unverified, from path-concurrency-limits)
File: `packages/twenty-server/src/modules/analytics/services/crm-analytics-database.service.ts` line 90

**Problem:** A page transaction runs at the default READ COMMITTED, so its statements read different database snapshots. Figures in one response can therefore disagree with each other.

**Scenario:** An Overview read is running. readStageClockTotals counts stuckPeople = 5. A recruiter then moves one stuck person, or the 15 minute sync appends a transition. readStuckRows then returns total = 4. The response shows the Stuck figure as 5 and pastLimitCount summing to 5 beside a stuck list saying 4, with one asOf. The same applies to computeCategories (people, overlap and funnel statements) and to computeFunnel (rows against cohortExcludedUnmapped). A refresh corrects it. Traced by reading the code; not run.

**Evidence:** Line 90 runs only SET TRANSACTION READ ONLY, and runInRollbackSafeTransaction issues a plain BEGIN. computeOverview runs readStageCounts, readStageClockTotals and readStuckRows as separate statements (metrics service 1391-1406). crm-analytics-snapshot.service.ts:25 already puts its totals in one statement for this reason, so a person created meanwhile cannot cause a false mismatch. The page path has no equivalent.

**Suggested fix:** Change the first statement to SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY, so every statement in a page read uses one snapshot. It must stay the first statement in the transaction. A read-only transaction takes no write locks, so the CRM pool is not affected.

## D197 [minor] SERVER (unverified, from path-jobs-and-failure)
File: `packages/twenty-server/src/modules/analytics/services/crm-analytics-database.service.ts` line 193

**Problem:** The job connection removes the client-side query limit and sets no replacement, so the 120 second limit exists only on the database server. If the server becomes unreachable without closing the socket, the job waits forever and holds the shared workspaceQueue.

**Scenario:** During a sync or daily statement, a network drop or hard failure of the database host leaves the socket open with no FIN or RST. The server can no longer enforce statement_timeout, and the client has no timer or keepalive, so the await never settles. BullMQ keeps renewing the lock because the event loop is alive, so the job never counts as stalled. workspaceQueue has concurrency 1, so member updates, trash cleanup, app installs and deferred migration actions wait until the worker is restarted. No new sync_log row is written, so the only sign is the page's stale banner. This needs a silent network failure, so a same-host Docker database restart, which closes the socket, should not trigger it. Traced by reading the code; not run.

**Evidence:** Line 193 sets query_timeout: undefined. node_modules/pg/lib/client.js:512-518 arms the read timer only from query_timeout, and client.js:51 defaults keepAlive to false. message-queue-worker-config.constant.ts:148-156 sets workspaceQueue to concurrency 1 with boundedShutdownDrain false, so worker.close() also waits for the active job. The CRM pools keep a 10 second client limit; only this connection has none.

**Suggested fix:** Widen the limit instead of removing it: query_timeout: JOB_STATEMENT_TIMEOUT_MS + 10000, and add keepAlive: true. The server-side timeout still fires first in normal cases, so timeout handling and the integration check that sleeps past 10 seconds should be unaffected.

## D198 [minor] SERVER (unverified, from path-jobs-and-failure)
File: `packages/twenty-server/src/modules/analytics/services/crm-analytics-report.service.ts` line 346

**Problem:** buildTrendSeries treats only statement timeouts as retryable. Any other SQL error, including a transient one, is logged as a warning and the report is stored without that trend line. The row counts as existing, so the line stays missing permanently.

**Scenario:** During the Monday 02:30 daily job, the MEDIAN_DAYS series statement fails once with a transient database error, such as SQLSTATE 53100 'could not resize shared memory segment' or a full temp-file disk. The other statements succeed, the report is inserted and the reports step records ok. Later runs treat that period as existing and never rebuild it while isProvisional stays true, so that week's report has no median-days chart for good. If the same error had hit the funnel statement, the report would not have been stored and the next night would have rebuilt it whole. The specific error is an example; the code path was traced by reading, not run.

**Evidence:** Lines 345-353 rethrow only when isStatementTimeout (code 57014 or that message) is true, and otherwise warn and continue. buildMissingReports inserts the result and passes existing periods to computeCrmAnalyticsReportPeriods, which filters them out. The method comment accepts a lost line as frozen and says only a timeout rebuilds the report whole. A lost connection is not affected, because the following INSERT also fails.

**Suggested fix:** Rethrow every database error, for example error instanceof QueryFailedError, as well as timeouts, so nothing is stored and the next run rebuilds the report whole. Keep the warn-and-skip path only for non-database errors, if that tolerance is still wanted.

## D199 [minor] SERVER (unverified, from path-counting)
File: `packages/twenty-server/src/modules/analytics/facade/crm-analytics-facade.service.ts` line 303

**Problem:** A destroyed person's applications start counting again, because the person foreign key is SET_NULL and the relation treats a null personId as an application with no person.

**Scenario:** Week W has 20 submissions. Recruiting soft-deletes 5 spam people, so New applications for W reads 15, as the settled rule says. After the default 14 days those people are destroyed, their personId becomes NULL, and W reads 20 again with nobody touching it. A frozen report still says 15. An unfiltered tile also disagrees with any person-filtered view, because the scope join drops those rows.

**Evidence:** The WHERE clause is `s."personId" IS NULL OR p."deletedAt" IS NULL`. setup-forms.mjs:188-198 creates the relation with no delete action. generate-morph-or-relation-flat-field-metadata-pair.util.ts:36 sets RelationOnDeleteAction.SET_NULL. Decisions from testing says a soft-deleted person's applications do not count. Not run; traced by reading.

**Suggested fix:** A null personId cannot tell 'never linked' from 'destroyed', so a stored marker or a user decision is needed. For example, count null-person rows only for forms that can legitimately write null (public-form.service.ts:229), or record the rule in the contract if the rise is accepted.

## D200 [minor] SERVER (unverified, from path-counting)
File: `packages/twenty-server/src/modules/analytics/services/crm-analytics-metrics.service.ts` line 1192

**Problem:** Movement counts one real move twice when a reconcile row and a late timeline row both record it, because period_move counts raw rows with no check against the person's previous stage.

**Scenario:** A person with an earlier transition moves A to B at 01:55. The timeline job is held up by a backlog. The 02:30 daily reconcile sees updated_at older than 30 minutes and inserts A to B with origin reconcile. The timeline row is written at 02:40, and the 02:52 sync has no latest row for that source_id, so it inserts A to B again. Entered B and Left A each show 2 for one move, and the report's Entered comparison inherits this. The note 'One person can move more than once' does not cover it, since the person moved once.

**Evidence:** crm-analytics-sync.service.ts:46-49 limits `latest` to origin = 'timeline' and matches by source_id, and line 59 inserts when l.source_id IS NULL. Reconcile rows have a null source_id, so the unique index does not stop this. computeMovement uses count(*) over period_move. Stay CTEs drop the repeat through lag, so only movement is wrong. This confirms the [sync-sql] note.

**Suggested fix:** In period_move, compute lag(to_key) per person over all transitions ordered by happened_at, and drop rows whose to_key equals the previous to_key before applying the period filter. Stored rows stay untouched.

## D201 [minor] SERVER (unverified, from path-counting)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsFiguresRow.tsx` line 213

**Problem:** The 'imported, dates unknown' line shows the whole workspace total inside a tile that is otherwise filtered, so it reads as belonging to the filtered group.

**Scenario:** Filter Track = Robotics. The New applications tile shows 12 for Robotics, then '4,800 imported, dates unknown'. The reader takes 4,800 as Robotics imports, though that count ignores track, program, source, status and dates.

**Evidence:** computeOverview (metrics service line 1449) calls countImportedApplications with only state and run. The facade SQL is a bare count with deletedAt IS NULL. AnalyticsFiguresRow receives hasActiveFilter but does not use it on this line.

**Suggested fix:** Hide the line when hasActiveAnalyticsFilter is true, or word it as 'all imported, whole CRM, dates unknown' whenever a filter is active.

## D202 [minor] SERVER (unverified, from path-counting)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsOverviewCharts.tsx` line 79

**Problem:** Under a date filter, the Total contacts and Active people tiles count only people created in range, but their sparklines come from snapshots that count everyone, including imported people.

**Scenario:** Filter Nov 1 to Nov 30 with 5,000 imported people. The tile shows Total contacts 40, noted 'People matching these filters', and the page notice says imported people are not shown. The sparkline beside it hovers at 'Total contacts 5,040' for the same weeks. Active people differs the same way.

**Evidence:** buildCurrentStateDateConditions adds p.created_at >= $2 and the range to scope for the figures. readSnapshotBuckets uses the dates only to pick bucket days, and daily_snapshot has no created-date dimension. readSparkline passes the same filter with no note. Other path reviewers noted the same mismatch at the server end.

**Suggested fix:** When dateFrom or dateTo is set, leave out the Total contacts and Active people sparklines, or add a note on the tile that the line covers everyone in the CRM.

## D203 [minor] SERVER (unverified, from path-counting)
File: `packages/twenty-front/src/modules/crm-analytics/utils/buildAnalyticsReportTrendCharts.ts` line 48

**Problem:** The report view titles its chart 'Drop-off rate over time', but the series measures only the first stage, so the label claims more than the value.

**Scenario:** A report shows a line at 60% titled 'Drop-off rate over time'. That is the share who did not leave New within the window, not drop-off across the pipeline, and it can differ widely from the later steps in the funnel on the same report. The PDF of the same report and the Trends tab both title it 'Drop-off from New'.

**Evidence:** REPORT_TREND_METRICS includes DROP_OFF, and computeReportSeries calls resolveTrendStageKey(metric, null), which returns ENTRY_STAGE_KEY. AnalyticsPdfTrendsSection.tsx:450 and AnalyticsTrendsTab.tsx:82 use the stage name. The series carries stageKey, but getSeriesLabel takes only the metric.

**Suggested fix:** Pass the series stageKey and the report's funnel rows to getSeriesLabel and title it 'Drop-off from {stage}', as the PDF does.

## D204 [minor] SERVER (unverified, from path-crm-to-metric)
File: `packages/twenty-server/src/modules/analytics/services/crm-analytics-sync.service.ts` line 76

**Problem:** Reconcile takes a person's last known stage by happened_at, but a first-seen merged timeline row keeps the happensAt of the row's first change, so a stage move merged into an older row sorts before an earlier real move. Reconcile then sees a false mismatch and adds a move that never happened, which also corrupts the movement, stage clock and median numbers.

**Scenario:** Recruiter M1 edits a person's phone at 10:00, creating timeline row R1 with no stage diff, which the sync ignores. A form or API write (null member, never merged) moves A to B at 10:02, creating R2. M1 moves B to C at 10:05, which merges into R1, so R1 is now diff B to C with happensAt still 10:00. Sync stores R1 (B to C, happened 10:00) and R2 (A to B, happened 10:02), whatever the sync timing, because R1 had no stage key before the merge. The person is really in C. At 02:30 reconcile reads the last row by happened_at, which is R2 with to_stage B, compares it with C, and inserts a false reconcile row B to C dated now(). Results: movement counts Entered C twice and Left B twice. latest_entry picks the reconcile row, so the stage clock restarts at 02:30 with isLowerBound true, and a person past the 14-day limit is shown 16 hours in stage and drops out of Stuck until day 15. Stays become C 10:00 to 10:02, then B open until the reconcile row, so the real C stay is lost from medians. first_move also returns from_key B instead of A. Two members give the same result: M1 A to B, M2 B to C, M1 C to D with no sync between stores R1 A to D at t0 and R2 B to C at t0+1, then a false C to D.

**Evidence:** timeline-activity.repository.ts:240-253 merges into a row of the same member and type created in the last 10 minutes, updating properties but not happensAt; workspace-mutation-query-builder.ts withUpdatedAtMaintenance bumps only updatedAt. crm-analytics-sync.service.ts:53-55 stores first-seen rows with c.happened_at. Lines 74-76 order by t.happened_at DESC first. Stored source_updated_at for R1 is 10:05, later than R2's, so it reflects the real write order. Contract section 6 'Merged rows' accepts a happensAt up to 10 minutes early for a single chain, but not the false reconcile row that follows when another actor's row falls inside that gap. build-crm-analytics-cte.util.ts:72 first_move and STAY_CTES in crm-analytics-metrics.service.ts:450 order by the same column. Traced by reading only; not run.

**Suggested fix:** In the reconcile LATERAL, order by t.source_updated_at DESC, t.happened_at DESC. Stored rows only get a new source_updated_at when their stage changes, because non-stage merges insert nothing, and reconcile rows carry now(), so this reads the true last write. Optionally stay and first_move ordering could use the same tie logic, but the reconcile fix removes the false row and its effect on movement and the stage clock.

## D205 [minor] SERVER (unverified, from path-dates-and-zones)
File: `packages/twenty-front/src/modules/crm-analytics/utils/buildAnalyticsSeriesBuckets.ts` line 51

**Problem:** The NEW_APPLICATIONS bucket that contains tracking start is drawn and tabled as a complete period. isPartial only means 'holds today', and no chart, tooltip or table marks the bucket as partly tracked.

**Scenario:** Tracking starts Tue 2026-10-27. Trends, By month, viewed in December: the table row and chart read 'Oct 2026: 4' and 'Nov 2026: 120', with no caveat and no lighter mark. October covers only Oct 27 to 31, so the line shows a steep rise that is not real. The summary text and the Change column refuse this comparison, but the point stays plain. The same applies to the week of Oct 26 in the Overview line and sparkline, and to the first report's trend chart and PDF.

**Evidence:** compute-crm-analytics-report-periods.util.ts:161 sets isPartial only for start === currentBucketStart. crm-analytics-metrics.service.ts:2342-2352 keeps the bucket's own value when bucketStart equals firstTrackedBucketStart. The note above readPreviousValue (metrics 2299) says such a count would read as a real, low total. isAnalyticsPeriodFullyTracked is used only for change text (summarizeAnalyticsTrendSeries.ts, AnalyticsTrendTable.tsx:113). It is not used by buildAnalyticsSeriesBuckets, buildWeeklyLineChartBuckets, buildAnalyticsSparkline, the table's 'in progress' tag (AnalyticsTrendTable.tsx:248) or AnalyticsLineChart's tooltip note (line 288).

**Suggested fix:** For running-count metrics, treat a bucket that fails isAnalyticsPeriodFullyTracked as partial when building chart buckets and table rows. Draw it lighter with a tooltip such as 'Only partly tracked', or have the server send a separate flag on the point.

## D206 [minor] SERVER (unverified, from path-dates-and-zones)
File: `packages/twenty-server/src/modules/analytics/services/crm-analytics-metrics.service.ts` line 1367

**Problem:** resolveNewApplicationRanges does not clamp dateTo to localToday, and the custom date input has no upper limit. A future dateTo therefore compares a running count with a full previous span of the same length. Trend buckets clamp the same filter.

**Scenario:** Viewed 2026-12-08 with custom dates Dec 1 to Dec 31. The tile reads 'Dec 1 to Dec 31' with a count from 8 real days, for example 30. Previous is Oct 31 to Nov 30, a full 31 days and fully tracked, so not nulled, for example 120. The tile shows '-90 against the previous period'. With both dates in the future, such as Dec 20 to Dec 31, current is 0 against part of a period and shows another false fall. getCategories shows the same unclamped range.

**Evidence:** Line 1367 is `const to = dateTo ?? context.localToday`, and dayCount and previous are computed from it (1373-1380). compute-crm-analytics-report-periods.util.ts:131 clamps with `dateTo < localToday ? dateTo : localToday` for trends. AnalyticsFilterBar.tsx:280-282 isToDateAllowed has no upper bound and line 351 passes no latestDate. AnalyticsOverviewTab.tsx:30-42 only nulls previous when it starts before tracking. Other reviewers' notes [U08-overview], [overview] and [U02-number-rules] point at the same line.

**Suggested fix:** In resolveNewApplicationRanges, use the earlier of dateTo and context.localToday for `to`, keeping the existing clamp of from to to, and pass latestDate as today to the To input.

## D207 [minor] SERVER (unverified, from path-dates-and-zones)
File: `packages/twenty-front/src/modules/crm-analytics/components/AnalyticsTrendsTab.tsx` line 120

**Problem:** The toolbar note says dates widen to whole periods on the whole tab, but 'What moved this period?' uses the exact filter dates. Cards side by side on the tab cover different spans under a note that says they do not.

**Scenario:** Trends, By week, custom dates Wed Nov 4 to Fri Nov 6. The toolbar reads 'Dates widen to whole weeks on this tab.' The line charts and cohort heatmap cover Nov 2 to Nov 8, but Movement counts only moves from Nov 4 to Nov 6. A move on Mon Nov 3 is left out, so a reader who trusts the toolbar takes the movement bars as the whole week. Only the card's info-icon note gives the true dates.

**Evidence:** getDateWideningNote (AnalyticsTrendsTab.tsx:108-124) applies to the tab. crm-analytics-metrics.service.ts:2228-2233 resolveMovementRange returns filter.dateFrom and filter.dateTo unchanged, while computeTrendCohorts (2190-2198) and computeTrendSeries (2284-2287) use whole buckets.

**Suggested fix:** Word the note so it excludes Movement, for example 'Charts and groups widen to whole weeks; moves use the exact dates', or show the movement dates in that card's visible text.

## D208 [minor] SERVER (plausible, from filter-sql)
File: `packages/twenty-server/src/modules/analytics/services/crm-analytics-metrics.service.ts` line 298

**Problem:** The source key NONE means 'no source', but a stored value of NONE would use the same key. Rows and snapshots would merge the two groups, while the filter keeps only the empty one, so the figures would disagree. The logic holds for any literal NONE, but nothing shows such a value exists.

**Scenario:** Only if a live applicantSource option or stored value is literally NONE. With 10 people on NONE and 6 with no source, the row labelled 'No source' shows 16. Clicking it, or choosing a NONE option in the filter bar, sets sourceKey 'NONE', which filters to COALESCE(p.source,'') = '', so figures show 6 and the 10 cannot be selected. The stored line under that filter reads dimension_key 'NONE', which holds 16. If no such value exists, none of this happens.

**Evidence:** Each step was traced by reading; not run. Line 502 uses COALESCE(NULLIF(s.source,''),'NONE') for rows, snapshot service line 42 uses the same for stored rows, and lines 298-299 branch to the empty-only condition. buildCategoryLabel line 1930 and getAnalyticsCategoryLabel.ts:17 label the key 'No source'. crm-analytics-meta.service.ts:272-274 passes option values through as filter keys. The trigger is unproven: forms/internship-application.json lists 18 source options, none NONE, with OTHER as the catch-all, and no seed, demo, test or doc in the repo uses a literal NONE source. FLOLABS.md:57 says 21 options, so three are not visible in the repo. That wording also points to a SELECT field, so the facade's TEXT allowance probably does not apply in production. Contract lines 199, 373 and 490 define NONE as the no-value key but do not address a literal value. The 'Unknown source' decision says filtering uses the raw value, which a literal NONE would not. Only sections 6 and 7 of docs/analytics/production-audit.sql can settle this, and that audit has not been run, so it can be neither confirmed nor ruled out. Not in large-review-findings.md, whose L14 is a different NONE issue about the click hint.

**Suggested fix:** Add a before-merge checklist item to look for a literal NONE in sections 6 and 7 of the audit, for whoever has production access. If one exists, the smallest fix is to change line 299 to COALESCE(NULLIF(p.source,''),'NONE') = 'NONE', so row, filter and stored line agree without touching stored data. Telling the two groups apart needs a reserved sentinel, which changes contract sections 3 and 6, the tests and old snapshot rows, so the user should decide that. If no literal NONE exists, no code change is needed.
