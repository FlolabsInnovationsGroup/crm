'use strict';
// One test per payload edge, driven by the graph: a new payload node with no expected
// value here fails, so a field cannot join the API without being checked.
const { createSinkReader, toIso } = require('../lib/sinks.cjs');
const { seedBaseline, seedDistinct } = require('../lib/seed.cjs');

const TRACK_LABEL = 'Business Management, Growth & Entrepreneurship';

module.exports = {
  title: 'Metrics to GraphQL payload fields',
  run: async ({ context, createScope, graph }) => {
    const { edge, fixture } = createScope({
      requirements: () => [
        context.requirement('CrmAnalyticsMetricsService'),
        context.requirement('CrmAnalyticsMetaService'),
        context.requirement('CrmAnalyticsWorkspaceDailyJob'),
        context.resolverRequirement,
      ],
    });

    const prepare = async (workspace) => {
      await context.runSync(workspace);
      await context.runDaily(workspace);

      return { workspace, flat: await createSinkReader(context).readPages(workspace) };
    };

    const small = await fixture('baseline workspace', async () => prepare(await seedBaseline(context)));
    const distinct = await fixture('distinct-number workspace', async () => prepare(await seedDistinct(context)));

    const logRow = async (workspace, jobName) =>
      (await context.query(
        `SELECT * FROM analytics.sync_log WHERE workspace_id = $1 AND job_name = $2 ORDER BY started_at DESC LIMIT 1`,
        [workspace.workspaceId, jobName],
      ))[0];

    // [workspace, flattened path, hand-calculated value]. distinct's numbers all differ.
    const expectations = () => ({
      'payload.base.trackingStartedAt': [small, 'overview.trackingStartedAt', small.workspace.trackingStart.toISOString()],
      'payload.base.reportingTimeZone': [small, 'funnel.reportingTimeZone', 'UTC'],
      'payload.base.minimumSample': [small, 'categoriesTrack.minimumSample', 30],

      'payload.meta.state': [small, 'meta.state', 'READY'],
      'payload.meta.isProvisional': [small, 'meta.isProvisional', true],
      'payload.meta.showSignedFigure': [small, 'meta.showSignedFigure', false],
      'payload.meta.sync.lastAttemptStatus': [small, 'meta.sync.lastAttemptStatus', 'OK'],
      'payload.meta.sync.isStale': [small, 'meta.sync.isStale', false],
      'payload.meta.sync.restoredInLastReconciliation': [small, 'meta.sync.restoredInLastReconciliation', 0],
      'payload.meta.fields.stage': [small, 'meta.fields.stage', 'OK'],
      'payload.meta.fields.isStageAuditLogged': [small, 'meta.fields.isStageAuditLogged', true],
      'payload.meta.fields.positionsAppliedFor': [small, 'meta.fields.positionsAppliedFor', 'OK'],
      'payload.meta.fields.applicantSource': [small, 'meta.fields.applicantSource', 'OK'],
      'payload.meta.fields.hasFormSubmissionObject': [small, 'meta.fields.hasFormSubmissionObject', true],
      'payload.meta.fields.hasApplicationObject': [small, 'meta.fields.hasApplicationObject', true],
      'payload.meta.stages[].stageKey': [small, 'meta.stages[SIGNED].stageKey', 'SIGNED'],
      'payload.meta.stages[].label': [small, 'meta.stages[BEFORE_MEETING].label', 'Before meeting'],
      'payload.meta.stages[].kind': [small, 'meta.stages[NO_ANSWER].kind', 'EXIT'],
      'payload.meta.stages[].rank': [small, 'meta.stages[SIGNED].rank', 7],
      'payload.meta.stages[].limitDays': [small, 'meta.stages[NEW].limitDays', 14],
      'payload.meta.stages[].windowDays': [small, 'meta.stages[SIGNED].windowDays', null],
      'payload.meta.stages[].isSuccess': [small, 'meta.stages[SIGNED].isSuccess', true],
      'payload.meta.tracks[].key': [small, 'meta.tracks[BUSINESS].key', 'BUSINESS'],
      'payload.meta.tracks[].label': [small, 'meta.tracks[BUSINESS].label', TRACK_LABEL],
      'payload.meta.programs[].key': [small, 'meta.programs[FINANCE_INTERN].key', 'FINANCE_INTERN'],
      'payload.meta.programs[].label': [small, 'meta.programs[FINANCE_INTERN].label', 'FINANCE_INTERN'],
      'payload.meta.programs[].trackKey': [small, 'meta.programs[LEGACY_POSITION].trackKey', 'UNMAPPED'],
      'payload.meta.sources[].key': [small, 'meta.sources[LINKEDIN].key', 'LINKEDIN'],
      'payload.meta.sources[].label': [small, 'meta.sources[LINKEDIN].label', 'LINKEDIN'],

      'payload.overview.importedExcludedByDate': [small, 'overview.importedExcludedByDate', 0],
      'payload.overview.figures.totalContacts': [distinct, 'overview.figures.totalContacts', 17],
      'payload.overview.figures.activePeople': [distinct, 'overview.figures.activePeople', 12],
      'payload.overview.figures.newApplications': [distinct, 'overview.figures.newApplications', 5],
      'payload.overview.figures.newApplicationsPrevious': [distinct, 'overview.figures.newApplicationsPrevious', 2],
      'payload.overview.figures.newApplicationsFrom': [distinct, 'overview.figures.newApplicationsFrom', context.daysAgo(6).toISOString().slice(0, 10)],
      'payload.overview.figures.newApplicationsTo': [distinct, 'overview.figures.newApplicationsTo', context.now.toISOString().slice(0, 10)],
      'payload.overview.figures.importedApplications': [distinct, 'overview.figures.importedApplications', 9],
      'payload.overview.figures.stuckPeople': [distinct, 'overview.figures.stuckPeople', 8],
      'payload.overview.figures.inactivePeople': [distinct, 'overview.figures.inactivePeople', 1],
      'payload.overview.figures.signedPeople': [distinct, 'overview.figures.signedPeople', null],
      'payload.overview.stageTotals[].rowKey': [distinct, 'overview.stageTotals[SIGNED:SIGNED_NON_PAID].rowKey', 'SIGNED:SIGNED_NON_PAID'],
      'payload.overview.stageTotals[].label': [distinct, 'overview.stageTotals[NOT_INTERESTED].label', 'Not interested'],
      'payload.overview.stageTotals[].rowKind': [distinct, 'overview.stageTotals[SIGNED:SIGNED_NON_PAID].rowKind', 'NESTED'],
      'payload.overview.stageTotals[].parentStageKey': [distinct, 'overview.stageTotals[SIGNED:SIGNED_NON_PAID].parentStageKey', 'SIGNED'],
      'payload.overview.stageTotals[].count': [distinct, 'overview.stageTotals[NOT_INTERESTED].count', 3],
      'payload.overview.stageTotals[].pastLimitCount': [distinct, 'overview.stageTotals[CONTACTED].pastLimitCount', 6],
      'payload.overview.stuck.rows[].personId': [distinct, 'overview.stuck.rows[old2].personId', distinct.workspace.people.old2],
      'payload.overview.stuck.rows[].displayName': [distinct, 'overview.stuck.rows[old2].displayName', 'old2 Sample'],
      'payload.overview.stuck.rows[].stageKey': [distinct, 'overview.stuck.rows[r1].stageKey', 'BEFORE_MEETING'],
      'payload.overview.stuck.rows[].stageLabel': [distinct, 'overview.stuck.rows[r1].stageLabel', 'Before meeting'],
      'payload.overview.stuck.rows[].stageEnteredAt': [distinct, 'overview.stuck.rows[r1].stageEnteredAt', toIso(context.daysAgo(30))],
      'payload.overview.stuck.rows[].daysInStage': [distinct, 'overview.stuck.rows[r1].daysInStage', 30],
      'payload.overview.stuck.rows[].daysOverLimit': [distinct, 'overview.stuck.rows[r1].daysOverLimit', 16],
      'payload.overview.stuck.rows[].isLowerBound': [distinct, 'overview.stuck.rows[r1].isLowerBound', false],
      'payload.overview.stuck.total': [distinct, 'overview.stuck.total', 8],
      'payload.overview.stuck.hasLimits': [distinct, 'overview.stuck.hasLimits', true],

      'payload.funnel.cohortSize': [distinct, 'funnel.cohortSize', 16],
      'payload.funnel.cohortExcludedUnmapped': [small, 'funnel.cohortExcludedUnmapped', 1],
      'payload.funnel.overall.finalStageKey': [distinct, 'funnel.overall.finalStageKey', 'SIGNED'],
      'payload.funnel.overall.windowDays': [distinct, 'funnel.overall.windowDays', 90],
      'payload.funnel.overall.eligible': [distinct, 'funnel.overall.eligible', 3],
      'payload.funnel.overall.reached': [distinct, 'funnel.overall.reached', 1],
      'payload.funnel.overall.rate': [distinct, 'funnel.overall.rate', 1 / 3],
      'payload.funnel.overall.soFarRate': [distinct, 'funnel.overall.soFarRate', 2 / 16],
      'payload.funnel.overall.isUnderMinimum': [distinct, 'funnel.overall.isUnderMinimum', true],
      'payload.funnel.rows[].stageKey': [distinct, 'funnel.rows[NEW].stageKey', 'NEW'],
      'payload.funnel.rows[].label': [distinct, 'funnel.rows[SECOND_MEETING].label', 'Second meeting'],
      'payload.funnel.rows[].windowDays': [distinct, 'funnel.rows[NEW].windowDays', 14],
      'payload.funnel.rows[].entered': [distinct, 'funnel.rows[NEW].entered', 16],
      'payload.funnel.rows[].eligible': [distinct, 'funnel.rows[NEW].eligible', 13],
      'payload.funnel.rows[].reachedNext': [distinct, 'funnel.rows[NEW].reachedNext', 7],
      'payload.funnel.rows[].timedOut': [distinct, 'funnel.rows[NEW].timedOut', 4],
      'payload.funnel.rows[].exited': [distinct, 'funnel.rows[NEW].exited', 2],
      'payload.funnel.rows[].inWindow': [distinct, 'funnel.rows[NEW].inWindow', 3],
      'payload.funnel.rows[].stepRate': [distinct, 'funnel.rows[NEW].stepRate', 7 / 13],
      'payload.funnel.rows[].soFarRate': [distinct, 'funnel.rows[NEW].soFarRate', 9 / 16],
      'payload.funnel.rows[].dropOffRate': [distinct, 'funnel.rows[NEW].dropOffRate', 6 / 13],
      'payload.funnel.rows[].isUnderMinimum': [distinct, 'funnel.rows[NEW].isUnderMinimum', true],
      'payload.funnel.rows[].medianDays': [distinct, 'funnel.rows[NEW].medianDays', 5],
      'payload.funnel.rows[].completedStays': [distinct, 'funnel.rows[NEW].completedStays', 12],
      'payload.funnel.lowestStepStageKey': [distinct, 'funnel.lowestStepStageKey', null],

      'payload.categories.groupBy': [small, 'categoriesSource.groupBy', 'SOURCE'],
      'payload.categories.distinctPeople': [small, 'categoriesTrack.distinctPeople', 7],
      'payload.categories.peopleInSeveral': [small, 'categoriesTrack.peopleInSeveral', 1],
      'payload.categories.peopleInSeveralTracks': [small, 'categoriesTrack.peopleInSeveralTracks', 1],
      'payload.categories.stepStageKeys': [small, 'categoriesTrack.stepStageKeys[6]', 'AGREEMENT_SENT'],
      'payload.categories.rows[].key': [small, 'categoriesTrack.rows[BUSINESS/FINANCE_INTERN].key', 'FINANCE_INTERN'],
      'payload.categories.rows[].parentKey': [small, 'categoriesTrack.rows[BUSINESS/FINANCE_INTERN].parentKey', 'BUSINESS'],
      'payload.categories.rows[].label': [small, 'categoriesTrack.rows[/BUSINESS].label', TRACK_LABEL],
      'payload.categories.rows[].isUnmapped': [small, 'categoriesTrack.rows[/UNMAPPED].isUnmapped', true],
      'payload.categories.rows[].people': [distinct, 'categoriesTrack.rows[/BUSINESS].people', 17],
      'payload.categories.rows[].activePeople': [distinct, 'categoriesTrack.rows[/BUSINESS].activePeople', 12],
      'payload.categories.rows[].newApplications': [distinct, 'categoriesTrack.rows[/BUSINESS].newApplications', 5],
      'payload.categories.rows[].cohortSize': [distinct, 'categoriesTrack.rows[/BUSINESS].cohortSize', 16],
      'payload.categories.rows[].overallEligible': [distinct, 'categoriesTrack.rows[/BUSINESS].overallEligible', 3],
      'payload.categories.rows[].overallRate': [distinct, 'categoriesTrack.rows[/BUSINESS].overallRate', 1 / 3],
      'payload.categories.rows[].overallSoFarRate': [distinct, 'categoriesTrack.rows[/BUSINESS].overallSoFarRate', 2 / 16],
      'payload.categories.rows[].stepRates[].stageKey': [distinct, 'categoriesSource.rows[/LINKEDIN].stepRates[NEW].stageKey', 'NEW'],
      'payload.categories.rows[].stepRates[].eligible': [distinct, 'categoriesSource.rows[/LINKEDIN].stepRates[NEW].eligible', 13],
      'payload.categories.rows[].stepRates[].rate': [distinct, 'categoriesSource.rows[/LINKEDIN].stepRates[NEW].rate', 7 / 13],
      'payload.categories.rows[].stepRates[].soFarRate': [distinct, 'categoriesSource.rows[/LINKEDIN].stepRates[NEW].soFarRate', 9 / 16],
    });

    const customChecks = {
      'payload.base.asOf': async (t) => {
        const { asOf } = await context.page.funnel(small.workspace);

        t.ok('the database clock, as an ISO string', new Date(asOf) >= context.now && toIso(asOf) === asOf, asOf);
      },
      'payload.meta.sync.lastSuccessfulSyncAt': async (t) => {
        const { sync } = await context.page.meta(small.workspace);

        t.equal('the sync row', sync.lastSuccessfulSyncAt, toIso((await logRow(small.workspace, 'sync')).finished_at));
      },
      'payload.meta.sync.lastReconciliationAt': async (t) => {
        const { sync } = await context.page.meta(small.workspace);

        t.equal('the daily row', sync.lastReconciliationAt, toIso((await logRow(small.workspace, 'daily')).finished_at));
      },
      'payload.meta.sync.lastAttemptAt': async (t) => {
        const { sync } = await context.page.meta(small.workspace);

        t.equal('the sync row', sync.lastAttemptAt, toIso((await logRow(small.workspace, 'sync')).started_at));
      },
      'payload.trends.metric': async (t) => {
        t.equal('as asked', (await context.page.trends(small.workspace, 'DROP_OFF')).metric, 'DROP_OFF');
      },
      'payload.trends.stageKey': async (t) => {
        t.equal('as asked', (await context.page.trends(small.workspace, 'STAGE_COUNT', { stageKey: 'CONTACTED' })).stageKey, 'CONTACTED');
        t.equal('default stage', (await context.page.trends(small.workspace, 'STAGE_COUNT')).stageKey, 'NEW');
        t.equal('not used', (await context.page.trends(small.workspace, 'TOTAL_CONTACTS', { stageKey: 'CONTACTED' })).stageKey, null);
      },
      'payload.trends.period': async (t) => {
        t.equal('as asked', (await context.page.trends(small.workspace, 'TOTAL_CONTACTS', { filter: { period: 'MONTH' } })).period, 'MONTH');
      },
      'payload.trends.unavailableReason': async (t) => {
        t.equal('none', (await context.page.trends(small.workspace, 'TOTAL_CONTACTS')).unavailableReason, null);
        t.equal('daily rate', (await context.page.trends(small.workspace, 'DROP_OFF', { filter: { period: 'DAY' } })).unavailableReason, 'DAILY_RATE');
      },
      'payload.trends.movement.from': async (t) => {
        const from = context.daysAgo(26).toISOString().slice(0, 10);
        const { movement } = await context.page.trends(small.workspace, 'TOTAL_CONTACTS', { filter: { dateFrom: from } });

        t.equal('range start', movement.from, from);
      },
      'payload.trends.movement.to': async (t) => {
        const to = context.daysAgo(10).toISOString().slice(0, 10);
        const { movement } = await context.page.trends(small.workspace, 'TOTAL_CONTACTS', { filter: { dateTo: to } });

        t.equal('range end', movement.to, to);
      },
    };

    const trendExpectation = (node) => {
      const week = (age) => {
        const date = new Date(`${context.daysAgo(age).toISOString().slice(0, 10)}T00:00:00.000Z`);

        date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));

        return date.toISOString().slice(0, 10);
      };
      const thisWeek = week(0);

      return {
        'payload.trends.series[].bucketStart': [small, `trends.TOTAL_CONTACTS.series[${thisWeek}].bucketStart`, thisWeek],
        'payload.trends.series[].value': [small, `trends.TOTAL_CONTACTS.series[${thisWeek}].value`, 7],
        'payload.trends.series[].previousValue': [small, `trends.TOTAL_CONTACTS.series[${thisWeek}].previousValue`, null],
        'payload.trends.series[].size': [small, `trends.DROP_OFF.series[${week(30)}].size`, 3],
        'payload.trends.series[].isPartial': [small, `trends.TOTAL_CONTACTS.series[${thisWeek}].isPartial`, true],
        'payload.trends.cohorts[].bucketStart': [small, `trends.cohorts[${week(30)}].bucketStart`, week(30)],
        'payload.trends.cohorts[].size': [small, `trends.cohorts[${week(30)}].size`, 3],
        'payload.trends.cohorts[].overallRate': [small, `trends.cohorts[${week(30)}].overallRate`, null],
        'payload.trends.cohorts[].overallSoFarRate': [small, `trends.cohorts[${week(30)}].overallSoFarRate`, 0],
        'payload.trends.cohorts[].cells[].stageKey': [small, `trends.cohorts[${week(30)}].cells[NEW].stageKey`, 'NEW'],
        'payload.trends.cohorts[].cells[].entered': [small, `trends.cohorts[${week(30)}].cells[CONTACTED].entered`, 1],
        'payload.trends.cohorts[].cells[].eligible': [small, `trends.cohorts[${week(30)}].cells[NEW].eligible`, 3],
        'payload.trends.cohorts[].cells[].rate': [small, `trends.cohorts[${week(30)}].cells[NEW].rate`, 1 / 3],
        'payload.trends.cohorts[].cells[].soFarRate': [small, `trends.cohorts[${week(3)}].cells[NEW].soFarRate`, 0],
        'payload.trends.cohorts[].cells[].isMature': [small, `trends.cohorts[${week(3)}].cells[NEW].isMature`, false],
        'payload.trends.movement.rows[].stageKey': [small, 'trends.movement.rows[NEW].stageKey', 'NEW'],
        'payload.trends.movement.rows[].label': [small, 'trends.movement.rows[NOT_INTERESTED].label', 'Not interested'],
        'payload.trends.movement.rows[].enteredInPeriod': [small, 'trends.movement.rows[NEW].enteredInPeriod', 0],
        'payload.trends.movement.rows[].leftInPeriod': [small, 'trends.movement.rows[NEW].leftInPeriod', 0],
        'payload.trends.movement.rows[].countNow': [small, 'trends.movement.rows[NEW].countNow', 3],
      }[node];
    };

    const payloadEdges = graph.edges.filter(
      ({ from, to }) => to.startsWith('payload.') && !to.startsWith('payload.report') && !from.startsWith('analytics.report'),
    );

    for (const { from, to, field } of payloadEdges) {
      await edge(from, to, async (t) => {
        if (customChecks[to] !== undefined) {
          await customChecks[to](t);

          return;
        }

        const expectation = expectations()[to] ?? trendExpectation(to);

        if (expectation === undefined) {
          t.fail(`No expected value for ${to}. A new payload field needs one here.`);

          return;
        }

        const [source, flatPath, expected] = expectation;

        t.ok(`${flatPath} exists`, source.flat.has(flatPath));
        t.equal(flatPath, source.flat.get(flatPath), expected);
      }, { needs: [small, distinct], field });
    }
  },
};
