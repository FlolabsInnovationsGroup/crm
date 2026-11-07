'use strict';
// The defaults are provisional (contract section 1), so the paths the audit will switch
// on are proved here: reminders and aliases, a non-UTC zone, no stage limits, no success
// stage, the signed figure. The config object is altered and restored by the harness.
const { createMetricsReader } = require('../lib/metrics-adapter.cjs');

const REMINDER = 'CONTACTED_REMINDER_1';
const ALIAS = 'RENAMED_CONTACTED';

const summarize = (rows) =>
  rows.map(({ from_stage: from, to_stage: to, origin }) => `${from}>${to} ${origin}`);

module.exports = {
  title: 'Altered config: settings the audit may change',
  run: async ({ harness, loader, query, newWorkspace, daysAgo, minutesAgo, transitionsOf, withAlteredConfig, requirement, now }) => {
    const requires = [requirement('CrmAnalyticsMetricsService')];

    const addReminderAndAlias = (config) => {
      config.stages
        .find((stage) => stage.stageKey === 'CONTACTED')
        .rawValues.push(
          { rawValue: REMINDER, isReminder: true },
          { rawValue: ALIAS, isReminder: false },
        );
    };

    const newWorkspaceWithReminder = async () => {
      const workspace = await newWorkspace({ extraStageValues: [REMINDER, ALIAS] });

      workspace.vars.set('CRM_ANALYTICS_TRACKING_START_AT', daysAgo(60).toISOString());

      return workspace;
    };

    await harness.check({ id: 'C1', title: 'Reminder: nests under its stage, top rows still sum, clock and stay do not restart', requires }, async (t) => {
      await withAlteredConfig(addReminderAndAlias, async (altered) => {
        const reader = createMetricsReader({ loader, services: altered });
        const workspace = await newWorkspaceWithReminder();
        const { insertPerson, insertStageChange } = workspace.fixtures;

        const onReminder = await insertPerson({ firstName: 'On', lastName: 'Reminder', stage: REMINDER, createdAt: daysAgo(30) });

        await insertStageChange({ personId: onReminder, before: 'NEW', after: 'CONTACTED', happensAt: daysAgo(20) });
        await insertStageChange({ personId: onReminder, before: 'CONTACTED', after: REMINDER, happensAt: daysAgo(2) });

        const leftAfterReminder = await insertPerson({ stage: 'NOT_INTERESTED', createdAt: daysAgo(30) });

        await insertStageChange({ personId: leftAfterReminder, before: 'NEW', after: 'CONTACTED', happensAt: daysAgo(25) });
        await insertStageChange({ personId: leftAfterReminder, before: 'CONTACTED', after: REMINDER, happensAt: daysAgo(20) });
        await insertStageChange({ personId: leftAfterReminder, before: REMINDER, after: 'NOT_INTERESTED', happensAt: daysAgo(10) });

        await insertPerson({ stage: 'CONTACTED', createdAt: daysAgo(5) });
        await altered.get('CrmAnalyticsWorkspaceSyncJob').handle({ workspaceId: workspace.workspaceId });

        const overview = await reader.getOverview(workspace.workspaceId);
        const funnel = await reader.getFunnel(workspace.workspaceId);
        const contacted = funnel.rows.find((row) => row.stageKey === 'CONTACTED');

        t.equal('CONTACTED total includes the reminder', overview.stageTotals.find((row) => row.rowKey === 'CONTACTED')?.count, 2);
        t.equal('nested rows', overview.stageTotals.filter((row) => row.parentStageKey === 'CONTACTED').map((row) => [row.rowKey, row.rowKind, row.count]), [
          ['CONTACTED:CONTACTED', 'NESTED', 1],
          [`CONTACTED:${REMINDER}`, 'NESTED', 1],
          [`CONTACTED:${ALIAS}`, 'NESTED', 0],
        ]);
        t.equal('top rows sum', overview.stageTotals.filter((row) => row.rowKind !== 'NESTED').reduce((total, row) => total + row.count, 0), overview.figures.totalContacts);
        t.equal('clock runs from entering the stage, not the reminder', overview.stuck.rows.map((row) => [row.personId, row.stageKey, row.daysInStage]), [[onReminder, 'CONTACTED', 20]]);
        t.equal('stay spans the reminder', [contacted?.medianDays, contacted?.completedStays], [15, 1]);
        t.equal('reminder is a stage key, no funnel gap', contacted?.entered, 3);
      });
    });

    await harness.check({ id: 'C2', title: 'Alias: a renamed value makes no false reconcile row, a real change still does', requires }, async (t) => {
      await withAlteredConfig(addReminderAndAlias, async (altered) => {
        const workspace = await newWorkspaceWithReminder();
        const { insertPerson, insertStageChange } = workspace.fixtures;
        const renamed = await insertPerson({ stage: ALIAS, createdAt: daysAgo(30), updatedAt: daysAgo(2) });

        await insertStageChange({ personId: renamed, before: 'NEW', after: 'CONTACTED', happensAt: daysAgo(20) });

        const moved = await insertPerson({ stage: 'ATTENDED', createdAt: daysAgo(30), updatedAt: minutesAgo(120) });

        await insertStageChange({ personId: moved, before: 'NEW', after: ALIAS, happensAt: daysAgo(20) });
        await altered.get('CrmAnalyticsWorkspaceDailyJob').handle({ workspaceId: workspace.workspaceId });
        await altered.get('CrmAnalyticsWorkspaceDailyJob').handle({ workspaceId: workspace.workspaceId });

        const rows = await transitionsOf(workspace.workspaceId);

        t.equal('alias holder has no reconcile row', summarize(rows.filter((row) => row.person_id === renamed)), ['NEW>CONTACTED timeline']);
        t.equal('real change is reconciled once', summarize(rows.filter((row) => row.person_id === moved)), [
          `NEW>${ALIAS} timeline`,
          `${ALIAS}>ATTENDED reconcile`,
        ]);
      });
    });

    // A zone whose local date differs from UTC at this very moment.
    const utcHour = now.getUTCHours();
    const zone = utcHour >= 10
      ? { name: 'Pacific/Kiritimati', offsetHours: 14 }
      : { name: 'Pacific/Pago_Pago', offsetHours: -11 };
    const localDateOf = (date) =>
      new Date(date.getTime() + zone.offsetHours * 3_600_000).toISOString().slice(0, 10);

    await harness.check({ id: 'C3', title: `Non-UTC zone (${zone.name}): snapshot date and filters use the local date`, requires }, async (t) => {
      await withAlteredConfig((config) => {
        config.reportingTimeZone = zone.name;
      }, async (altered) => {
        const reader = createMetricsReader({ loader, services: altered });
        const workspace = await newWorkspace();
        const { insertPerson, insertForm, insertSubmission } = workspace.fixtures;

        workspace.vars.set('CRM_ANALYTICS_TRACKING_START_AT', daysAgo(60).toISOString());

        const form = await insertForm({ name: 'Internship Application' });
        const personId = await insertPerson({ stage: 'NEW', createdAt: daysAgo(3) });

        await insertSubmission({ formId: form, personId, submittedAt: daysAgo(3) });
        await altered.get('CrmAnalyticsWorkspaceDailyJob').handle({ workspaceId: workspace.workspaceId });

        const [{ snapshot_date: snapshotDate }] = await query(
          `SELECT min(snapshot_date)::text AS snapshot_date FROM analytics.daily_snapshot WHERE workspace_id = $1`,
          [workspace.workspaceId],
        );

        t.equal('snapshot is the local date', snapshotDate, localDateOf(now));
        t.ok('and differs from the UTC date, so this check means something', snapshotDate !== now.toISOString().slice(0, 10), snapshotDate);

        const localCreated = localDateOf(daysAgo(3));
        const onlyThatDay = { dateFrom: localCreated, dateTo: localCreated };
        const overview = await reader.getOverview(workspace.workspaceId, onlyThatDay);
        const dayBefore = new Date(`${localCreated}T00:00:00Z`);

        dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);

        const beforeDate = dayBefore.toISOString().slice(0, 10);
        const missed = await reader.getOverview(workspace.workspaceId, { dateFrom: beforeDate, dateTo: beforeDate });
        const trends = await reader.getTrends(workspace.workspaceId, 'NEW_APPLICATIONS', null, { period: 'DAY' });

        t.equal('date filter is inclusive on the local day', overview.figures.totalContacts, 1);
        t.equal('day before is empty', missed.figures.totalContacts, 0);
        t.equal('new applications on the local day', overview.figures.newApplications, 1);
        t.equal('daily bucket is the local date', trends.series.find((point) => point.bucketStart === localCreated)?.value, 1);
      });
    });

    await harness.check({ id: 'C4', title: `Non-UTC zone (${zone.name}): week bucket and report periods start on the local Monday`, requires: [...requires, requirement('CrmAnalyticsReportService')] }, async (t) => {
      await withAlteredConfig((config) => {
        config.reportingTimeZone = zone.name;
      }, async (altered) => {
        const workspace = await newWorkspace();
        const localToday = new Date(`${localDateOf(now)}T00:00:00Z`);
        const mondayOfLocalWeek = new Date(localToday.getTime() - ((localToday.getUTCDay() + 6) % 7) * 86_400_000);
        const firstLocalMonday = new Date(mondayOfLocalWeek.getTime() - 14 * 86_400_000);
        // That Monday's local midnight as an instant.
        const trackingStart = new Date(firstLocalMonday.getTime() - zone.offsetHours * 3_600_000);

        workspace.vars.set('CRM_ANALYTICS_TRACKING_START_AT', trackingStart.toISOString());
        await workspace.fixtures.insertPerson({ stage: 'NEW', createdAt: new Date(trackingStart.getTime() + 3_600_000) });
        await altered.get('CrmAnalyticsWorkspaceDailyJob').handle({ workspaceId: workspace.workspaceId });

        const rows = await query(
          `SELECT period_type, period_start::text AS period_start FROM analytics.report WHERE workspace_id = $1 ORDER BY period_start`,
          [workspace.workspaceId],
        );

        t.equal('two finished local weeks', rows.map((row) => [row.period_type, row.period_start]), [
          ['WEEK', firstLocalMonday.toISOString().slice(0, 10)],
          ['WEEK', new Date(firstLocalMonday.getTime() + 7 * 86_400_000).toISOString().slice(0, 10)],
        ]);
      });
    });

    await harness.check({ id: 'C5', title: 'No stage limits at all: list falls back to the longest stays, hasLimits false, valid SQL', requires }, async (t) => {
      await withAlteredConfig((config) => {
        for (const stage of config.stages) stage.limitDays = null;
      }, async (altered) => {
        const reader = createMetricsReader({ loader, services: altered });
        const workspace = await newWorkspace();

        workspace.vars.set('CRM_ANALYTICS_TRACKING_START_AT', daysAgo(60).toISOString());

        const older = await workspace.fixtures.insertPerson({ stage: 'NEW', createdAt: daysAgo(30) });
        const newer = await workspace.fixtures.insertPerson({ stage: 'NEW', createdAt: daysAgo(3) });

        await altered.get('CrmAnalyticsWorkspaceSyncJob').handle({ workspaceId: workspace.workspaceId });

        const { stuck, figures } = await reader.getOverview(workspace.workspaceId);

        t.equal('hasLimits', stuck.hasLimits, false);
        t.equal('longest stay first, no days over limit', stuck.rows.map((row) => [row.personId, row.daysInStage, row.daysOverLimit]), [
          [older, 30, null],
          [newer, 3, null],
        ]);
        t.equal('no one is past a limit', figures.stuckPeople, 0);
      });
    });

    await harness.check({ id: 'C6', title: 'No success stage: overall is null and every query stays valid', requires }, async (t) => {
      await withAlteredConfig((config) => {
        for (const stage of config.stages) stage.isSuccess = false;
      }, async (altered) => {
        const reader = createMetricsReader({ loader, services: altered });
        const workspace = await newWorkspace();

        workspace.vars.set('CRM_ANALYTICS_TRACKING_START_AT', daysAgo(200).toISOString());
        await workspace.fixtures.insertPerson({ stage: 'SIGNED_PAID', createdAt: daysAgo(100) });
        await altered.get('CrmAnalyticsWorkspaceDailyJob').handle({ workspaceId: workspace.workspaceId });

        const funnel = await reader.getFunnel(workspace.workspaceId);
        const overview = await reader.getOverview(workspace.workspaceId);
        const overallTrend = await reader.getTrends(workspace.workspaceId, 'OVERALL_CONVERSION', null, { period: 'WEEK' });
        const active = await reader.getOverview(workspace.workspaceId, { status: 'ACTIVE' });
        const success = await reader.getOverview(workspace.workspaceId, { status: 'SUCCESS' });

        t.equal('overall', [funnel.overall.finalStageKey, funnel.overall.rate, funnel.overall.soFarRate], [null, null, null]);
        t.equal('trend has no number', overallTrend.series.filter((point) => point.value !== null), []);
        t.equal('figures', overview.figures.activePeople, 1);
        t.equal('status filters run', [active.figures.totalContacts, success.figures.totalContacts], [1, 0]);
      });
    });

    await harness.check({ id: 'C7', title: 'Signed figure switched on counts both raw values', requires }, async (t) => {
      await withAlteredConfig((config) => {
        config.showSignedFigure = true;
      }, async (altered) => {
        const reader = createMetricsReader({ loader, services: altered });
        const workspace = await newWorkspace();

        workspace.vars.set('CRM_ANALYTICS_TRACKING_START_AT', daysAgo(60).toISOString());
        await workspace.fixtures.insertPerson({ stage: 'SIGNED_PAID', createdAt: daysAgo(5) });
        await workspace.fixtures.insertPerson({ stage: 'SIGNED_NON_PAID', createdAt: daysAgo(5) });
        await workspace.fixtures.insertPerson({ stage: 'NEW', createdAt: daysAgo(5) });
        await altered.get('CrmAnalyticsWorkspaceSyncJob').handle({ workspaceId: workspace.workspaceId });

        t.equal('signedPeople', (await reader.getOverview(workspace.workspaceId)).figures.signedPeople, 2);
      });
    });

  },
};
