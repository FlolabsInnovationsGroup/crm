'use strict';
// Edges from the CTEs and settings into the metrics. Each value is hand-calculated from
// the seeds in lib/seed.cjs, then read both at the CTE and in the real payload.
const { toIso } = require('../lib/sinks.cjs');
const { seedBaseline, seedDistinct } = require('../lib/seed.cjs');
const { createTapReader, monthStart, toDate, weekStart } = require('../lib/taps.cjs');

const rowOf = (rows, field, key) => rows.find((row) => row[field] === key);
const stageOf = (rows, key) => rowOf(rows, 'stageKey', key);
const categoryOf = (categories, parentKey, key) =>
  categories.rows.find((row) => row.parentKey === parentKey && row.key === key);
const medianOf = (values) => {
  const sorted = [...values].sort((first, second) => first - second);
  const middle = (sorted.length - 1) / 2;

  return (sorted[Math.floor(middle)] + sorted[Math.ceil(middle)]) / 2;
};

module.exports = {
  title: 'CTEs to metrics',
  run: async ({ context, createScope }) => {
    const { edge, fixture } = createScope({
      requirements: () => [
        context.requirement('CrmAnalyticsMetricsService'),
        context.requirement('CrmAnalyticsMetaService'),
        context.requirement('CrmAnalyticsReportService'),
        context.requirement('CrmAnalyticsWorkspaceDailyJob'),
        context.resolverRequirement,
      ],
    });

    const prepare = async (workspace) => {
      const { collect, tapOf } = createTapReader(context);
      const { page } = context;
      const payloads = {};

      await context.runSync(workspace);
      await context.runDaily(workspace);

      return {
        workspace,
        payloads,
        overview: await page.overview(workspace),
        funnel: await page.funnel(workspace),
        track: await page.categories(workspace, 'TRACK_PROGRAM'),
        source: await page.categories(workspace, 'SOURCE'),
        tapOverview: tapOf(await collect(() => page.overview(workspace))),
        tapFunnel: tapOf(await collect(() => page.funnel(workspace))),
      };
    };

    const small = await fixture('baseline workspace', async () => prepare(await seedBaseline(context)));
    const distinct = await fixture('distinct-number workspace', async () => prepare(await seedDistinct(context)));
    const needs = [small, distinct];
    const check = (from, to, work, options = {}) => edge(from, to, work, { needs, ...options });

    // ---- current state
    await check('cte.scope', 'metric.totalContacts', async (t) => {
      const [{ total }] = await small.tapOverview('scope', 'SELECT count(*)::int AS total FROM scope');

      t.equal('scope rows', total, 7);
      t.equal('figure', small.overview.figures.totalContacts, total);
    });

    await check('cte.scope', 'metric.activePeople', async (t) => {
      const [{ total }] = await small.tapOverview('scope', `SELECT count(*)::int AS total FROM scope WHERE current_kind IN ('MAIN', 'OTHER') AND current_key <> 'SIGNED'`);

      t.equal('ada, ben, cat, eve', small.overview.figures.activePeople, total);
      t.equal('hand count', total, 4);
    });

    await check('config.stages', 'metric.activePeople', async (t) => {
      t.equal('signed and exited are not active', distinct.overview.figures.activePeople, 12);

      await context.withAlteredConfig(
        (config) => {
          config.stages.find(({ stageKey }) => stageKey === 'CONTACTED').kind = 'EXIT';
        },
        async ({ page }) => {
          t.equal('a stage turned exit leaves the figure', (await page.overview(small.workspace)).figures.activePeople, 3);
        },
      );
    });

    await check('cte.scope', 'metric.signedPeople', async (t) => {
      await context.withAlteredConfig(
        (config) => {
          config.showSignedFigure = true;
        },
        async ({ page }) => {
          t.equal('both raw signed values', (await page.overview(distinct.workspace)).figures.signedPeople, 2);
        },
      );
    });

    await check('config.showSignedFigure', 'metric.signedPeople', (t) => {
      t.equal('off by default', distinct.overview.figures.signedPeople, null);
    });

    await check('cte.submission', 'metric.newApplications', (t) => {
      t.equal('last 7 local days', distinct.overview.figures.newApplications, 5);
      t.equal('the 7 days before', distinct.overview.figures.newApplicationsPrevious, 2);
    });

    await check('api.filter.dateRange', 'metric.newApplications', async (t) => {
      const from = toDate(context.daysAgo(11));
      const to = toDate(context.daysAgo(9));
      const { figures } = await context.page.overview(small.workspace, { dateFrom: from, dateTo: to });

      t.equal('ben, in range', figures.newApplications, 1);
      t.equal('nothing in the 3 days before', figures.newApplicationsPrevious, 0);
      t.equal('range reported', [figures.newApplicationsFrom, figures.newApplicationsTo], [from, to]);
    });

    await check('cte.scope', 'metric.newApplications', async (t) => {
      const linkedIn = await context.page.overview(small.workspace, { sourceKey: 'LINKEDIN' });
      const exited = await context.page.overview(small.workspace, { status: 'EXITED' });

      t.equal('ada only', linkedIn.figures.newApplications, 1);
      t.equal('ben is out of this filter', linkedIn.figures.newApplicationsPrevious, 0);
      t.equal('no exited applicant', exited.figures.newApplications, 0);
    });

    await check('facade.importedApplications', 'metric.importedApplications', async (t) => {
      t.equal('nine rows', distinct.overview.figures.importedApplications, 9);

      const workspace = await context.createWorkspace();

      await context.runSync(workspace);
      t.equal('no object, unknown', (await context.page.overview(workspace)).figures.importedApplications, null);
    });

    await check('cte.scope', 'metric.importedExcludedByDate', async (t) => {
      const filtered = await context.page.overview(small.workspace, { dateFrom: toDate(context.daysAgo(5)) });

      t.equal('eve', filtered.importedExcludedByDate, 1);
      t.equal('nothing hidden without a date filter', small.overview.importedExcludedByDate, 0);
    });

    await check('cte.scope', 'metric.stageTotals', (t) => {
      const { stageTotals, figures } = distinct.overview;
      const topRows = stageTotals.filter((row) => row.rowKind !== 'NESTED');

      t.equal('NEW', rowOf(stageTotals, 'rowKey', 'NEW').count, 5);
      t.equal('CONTACTED', rowOf(stageTotals, 'rowKey', 'CONTACTED').count, 6);
      t.equal('top rows sum to total contacts', topRows.reduce((total, row) => total + row.count, 0), figures.totalContacts);
    });

    await check('config.stages', 'metric.stageTotals', (t) => {
      const { stageTotals } = distinct.overview;

      t.equal('parent', rowOf(stageTotals, 'rowKey', 'SIGNED').count, 2);
      t.equal('nested raw value', rowOf(stageTotals, 'rowKey', 'SIGNED:SIGNED_PAID'), {
        rowKey: 'SIGNED:SIGNED_PAID',
        label: 'SIGNED_PAID',
        rowKind: 'NESTED',
        parentStageKey: 'SIGNED',
        count: 1,
        pastLimitCount: null,
      });
      t.equal('one raw value has no nested row', rowOf(stageTotals, 'rowKey', 'NEW:NEW'), undefined);
    });

    await check('facade.crmState.stage', 'metric.stageTotals', async (t) => {
      const field = distinct.workspace.flatMaps.flatFieldMetadataMaps.byUniversalIdentifier['person-stage-uid'];
      const option = field.options.find(({ value }) => value === 'SIGNED_PAID');

      option.label = 'Signed, paid';

      try {
        const { stageTotals } = await context.page.overview(distinct.workspace);

        t.equal('option label', rowOf(stageTotals, 'rowKey', 'SIGNED:SIGNED_PAID').label, 'Signed, paid');
      } finally {
        option.label = 'SIGNED_PAID';
      }
    });

    await check('cte.stage_age', 'metric.stageTotals', (t) => {
      const { stageTotals } = distinct.overview;

      t.equal('NEW: old2', rowOf(stageTotals, 'rowKey', 'NEW').pastLimitCount, 1);
      t.equal('CONTACTED: r2 to r7', rowOf(stageTotals, 'rowKey', 'CONTACTED').pastLimitCount, 6);
      t.equal('no limit on the success stage', rowOf(stageTotals, 'rowKey', 'SIGNED').pastLimitCount, null);
    });

    await check('cte.stage_age', 'metric.stuckList', (t) => {
      const { stuck } = distinct.overview;
      const [first] = stuck.rows;

      t.equal('total', stuck.total, 8);
      t.equal('most days over limit first', distinct.workspace.keyOf.get(first.personId), 'old2');
      t.equal('days in stage', first.daysInStage, 100);
      t.equal('days over limit', first.daysOverLimit, 86);
      t.equal('entered at creation', toIso(first.stageEnteredAt), toIso(context.daysAgo(100)));
    });

    await check('facade.displayNames', 'metric.stuckList', (t) => {
      const ada = rowOf(small.overview.stuck.rows, 'personId', small.workspace.people.ada);

      t.equal('live name', ada.displayName, 'Ada Stone');
    });

    await check('cte.stage_age', 'metric.stuckPeople', async (t) => {
      const [{ total }] = await distinct.tapOverview('stage_age', 'SELECT count(*)::int AS total FROM stage_age WHERE NOT is_inactive AND days_in_stage > limit_days');

      t.equal('r1 to r7 and old2', total, 8);
      t.equal('figure', distinct.overview.figures.stuckPeople, total);
    });

    await check('cte.stage_age', 'metric.inactivePeople', async (t) => {
      const [{ total }] = await distinct.tapOverview('stage_age', 'SELECT count(*)::int AS total FROM stage_age WHERE is_inactive');

      t.equal('imp', total, 1);
      t.equal('figure', distinct.overview.figures.inactivePeople, total);
    });

    await check('cte.stage_age', 'metric.stuckByStage', async (t) => {
      const [item] = await context.page.reports(small.workspace);
      const report = await context.page.report(small.workspace, item.periodType, item.periodStart);

      t.equal('NEW: ada', stageOf(report.stuckByStage, 'NEW').count, 1);
      t.equal('CONTACTED: ben', stageOf(report.stuckByStage, 'CONTACTED').count, 1);
      t.equal('only stages with a limit', stageOf(report.stuckByStage, 'SIGNED'), undefined);
      t.equal('counts only', Object.keys(report.stuckByStage[0]).sort(), ['count', 'label', 'stageKey']);
    });

    // ---- funnel, NEW step of the distinct workspace: 16 entered, 13 eligible, 7, 2, 4, 3
    const newRow = () => stageOf(distinct.funnel.rows, 'NEW');
    const stepTotal = async () => (await distinct.tapFunnel('step_total', `SELECT * FROM step_total WHERE stage_key = 'NEW'`))[0];

    await check('cte.step_total', 'metric.entered', async (t) => {
      t.equal('entered', newRow().entered, (await stepTotal()).entered);
      t.equal('hand count', newRow().entered, 16);
    });

    await check('cte.step_total', 'metric.eligible', async (t) => {
      t.equal('eligible', newRow().eligible, (await stepTotal()).eligible);
      t.equal('hand count', newRow().eligible, 13);
    });

    await check('cte.step_total', 'metric.reachedNext', async (t) => {
      t.equal('reached', newRow().reachedNext, (await stepTotal()).reached_next);
      t.equal('hand count', newRow().reachedNext, 7);
    });

    await check('cte.step_total', 'metric.exited', async (t) => {
      t.equal('exited', newRow().exited, (await stepTotal()).exited);
      t.equal('hand count', newRow().exited, 2);
    });

    await check('metric.eligible', 'metric.timedOut', (t) => {
      t.equal('late, old1, old2, old3', newRow().timedOut, 4);
    });

    await check('metric.reachedNext', 'metric.timedOut', (t) => {
      t.equal('eligible minus reached minus exited', newRow().timedOut, newRow().eligible - newRow().reachedNext - newRow().exited);
    });

    await check('metric.exited', 'metric.timedOut', (t) => {
      const row = stageOf(distinct.funnel.rows, 'CONTACTED');

      t.equal('CONTACTED: r2 to r7, none exited', row.timedOut, 6);
      t.equal('exited', row.exited, 0);
    });

    await check('metric.entered', 'metric.inWindow', (t) => {
      t.equal('w1 to w3', newRow().inWindow, 3);
    });

    await check('metric.eligible', 'metric.inWindow', (t) => {
      t.equal('entered minus eligible', newRow().inWindow, newRow().entered - newRow().eligible);
    });

    await check('metric.reachedNext', 'metric.stepRate', (t) => {
      t.equal('a fraction', newRow().stepRate, 7 / 13);
    });

    await check('metric.eligible', 'metric.stepRate', (t) => {
      t.equal('null when nobody is eligible', stageOf(distinct.funnel.rows, 'SIGNED').stepRate, null);
    });

    await check('cte.step_total', 'metric.soFarRate', async (t) => {
      t.equal('reached so far', (await stepTotal()).reached_so_far, 9);
      t.equal('rate', newRow().soFarRate, 9 / 16);
    });

    await check('metric.entered', 'metric.soFarRate', (t) => {
      t.equal('over entered, not eligible', stageOf(distinct.funnel.rows, 'CONTACTED').soFarRate, 3 / 9);
    });

    await check('metric.eligible', 'metric.dropOffRate', (t) => {
      t.equal('over eligible', newRow().dropOffRate, 6 / 13);
    });

    await check('metric.reachedNext', 'metric.dropOffRate', (t) => {
      t.equal('CONTACTED', stageOf(distinct.funnel.rows, 'CONTACTED').dropOffRate, 6 / 8);
    });

    await check('config.minimumSample', 'metric.isUnderMinimum', async (t) => {
      t.equal('13 is under 30', newRow().isUnderMinimum, true);

      await context.withAlteredConfig(
        (config) => {
          config.minimumSample = 13;
        },
        async ({ page }) => {
          t.equal('13 meets 13', stageOf((await page.funnel(distinct.workspace)).rows, 'NEW').isUnderMinimum, false);
        },
      );
    });

    await check('metric.eligible', 'metric.isUnderMinimum', async (t) => {
      await context.withAlteredConfig(
        (config) => {
          config.minimumSample = 5;
        },
        async ({ page }) => {
          const { rows } = await page.funnel(distinct.workspace);

          t.equal('13 eligible', stageOf(rows, 'NEW').isUnderMinimum, false);
          t.equal('2 eligible', stageOf(rows, 'BEFORE_MEETING').isUnderMinimum, true);
        },
      );
    });

    await check('cte.completed_stay', 'metric.medianDays', (t) => {
      t.equal('NEW: 5 x7, 10 x2, 30, 50, 95', newRow().medianDays, 5);
      t.equal('CONTACTED: one stay of 5', stageOf(distinct.funnel.rows, 'CONTACTED').medianDays, 5);
      t.equal('no completed stay is unknown, not 0', stageOf(distinct.funnel.rows, 'SIGNED').medianDays, null);
      t.equal('baseline: 5 and 10', stageOf(small.funnel.rows, 'NEW').medianDays, 7.5);
    });

    await check('cte.completed_stay', 'metric.completedStays', (t) => {
      t.equal('NEW', newRow().completedStays, 12);
      t.equal('CONTACTED', stageOf(distinct.funnel.rows, 'CONTACTED').completedStays, 1);
      t.equal('SIGNED', stageOf(distinct.funnel.rows, 'SIGNED').completedStays, 0);
    });

    await check('metric.stepRate', 'metric.lowestStep', async (t) => {
      t.equal('nobody at the minimum', distinct.funnel.lowestStepStageKey, null);

      await context.withAlteredConfig(
        (config) => {
          config.minimumSample = 5;
        },
        async ({ page }) => {
          t.equal('first step excluded while another qualifies', (await page.funnel(distinct.workspace)).lowestStepStageKey, 'CONTACTED');
        },
      );
      await context.withAlteredConfig(
        (config) => {
          config.minimumSample = 10;
        },
        async ({ page }) => {
          t.equal('the first step when alone', (await page.funnel(distinct.workspace)).lowestStepStageKey, 'NEW');
        },
      );
    });

    const overallTotal = async () => (await distinct.tapFunnel('overall_total', 'SELECT * FROM overall_total'))[0];

    await check('cte.overall_total', 'metric.overallEligible', async (t) => {
      t.equal('old1, old2, old3', distinct.funnel.overall.eligible, (await overallTotal()).eligible);
      t.equal('hand count', distinct.funnel.overall.eligible, 3);
    });

    await check('cte.overall_total', 'metric.overallReached', async (t) => {
      t.equal('old1 only: old3 signed too late', distinct.funnel.overall.reached, (await overallTotal()).reached);
      t.equal('hand count', distinct.funnel.overall.reached, 1);
    });

    await check('metric.overallReached', 'metric.overallRate', (t) => {
      t.equal('fraction', distinct.funnel.overall.rate, 1 / 3);
    });

    await check('metric.overallEligible', 'metric.overallRate', (t) => {
      t.equal('null when nobody is 90 days old', small.funnel.overall.rate, null);
    });

    await check('cte.overall_total', 'metric.overallSoFarRate', (t) => {
      t.equal('old1 and old3 over 16', distinct.funnel.overall.soFarRate, 2 / 16);
    });

    await check('cte.overall_total', 'metric.cohortSize', async (t) => {
      t.equal('cohort size', distinct.funnel.cohortSize, (await overallTotal()).entered);
      t.equal('hand count', distinct.funnel.cohortSize, 16);
    });

    const unmapped = await fixture('people whose stage is unmapped in different ways', async () => {
      const workspace = await context.createWorkspace();
      const { insertPerson, insertStageChange } = workspace.fixtures;

      workspace.setTrackingStart(context.daysAgo(45));

      const moved = await insertPerson({ stage: 'LEGACY_TEST', createdAt: context.daysAgo(30) });
      const never = await insertPerson({ stage: 'LEGACY_TEST', createdAt: context.daysAgo(30) });
      const imported = await insertPerson({ stage: 'LEGACY_TEST', createdAt: context.daysAgo(200) });
      const noStage = await insertPerson({ stage: null, createdAt: context.daysAgo(30) });

      await insertStageChange({ personId: moved, before: 'NEW', after: 'LEGACY_TEST', happensAt: context.daysAgo(20) });
      await context.runSync(workspace);

      const { collect, tapOf } = createTapReader(context);
      const tap = tapOf(await collect(() => context.page.funnel(workspace)));

      return {
        funnel: await context.page.funnel(workspace),
        ids: { imported, moved, never, noStage },
        tap,
      };
    });

    await check('cte.mapped_mover', 'metric.cohortExcludedUnmapped', async (t) => {
      const movers = (await unmapped.tap('mapped_mover', 'SELECT person_id FROM mapped_mover')).map(({ person_id: id }) => id);

      t.equal('a person with a mapped stage in history is not excluded', movers, [unmapped.ids.moved]);
      t.equal('only the never mapped one is excluded', unmapped.funnel.cohortExcludedUnmapped, 1);
    }, { needs: [unmapped] });

    await check('cte.cohort', 'metric.cohortExcludedUnmapped', async (t) => {
      const cohort = (await unmapped.tap('cohort', 'SELECT person_id FROM cohort')).map(({ person_id: id }) => id);

      t.equal('an imported person is not in the cohort to begin with', cohort.includes(unmapped.ids.imported), false);
    }, { needs: [unmapped] });

    await check('cte.scope', 'metric.cohortExcludedUnmapped', async (t) => {
      const rows = await unmapped.tap('scope', `SELECT person_id FROM scope WHERE COALESCE(raw_stage, '') <> '' AND current_key IS NULL`);

      t.equal('no stage is not unmapped', rows.some(({ person_id: id }) => id === unmapped.ids.noStage), false);
      t.ok('the never mapped person is', rows.some(({ person_id: id }) => id === unmapped.ids.never), rows);
    }, { needs: [unmapped] });

    // ---- categories
    await check('cte.category_member', 'metric.categoryPeople', (t) => {
      t.equal('track', categoryOf(small.track, null, 'BUSINESS').people, 3);
      t.equal('program', categoryOf(small.track, 'BUSINESS', 'FINANCE_INTERN').people, 2);
      t.equal('source', categoryOf(small.source, null, 'LINKEDIN').people, 2);
      t.equal('no value', categoryOf(small.source, null, 'NONE').people, 3);
    });

    await check('cte.scope', 'metric.categoryPeople', (t) => {
      t.equal('dan exited, so not active', categoryOf(small.track, null, 'BUSINESS').activePeople, 2);
    });

    await check('cte.category_member', 'metric.categoryNewApplications', (t) => {
      t.equal('ada, under each of her rows', [
        categoryOf(small.track, null, 'BUSINESS').newApplications,
        categoryOf(small.track, 'BUSINESS', 'FINANCE_INTERN').newApplications,
        categoryOf(small.source, null, 'LINKEDIN').newApplications,
      ], [1, 1, 1]);
    });

    await check('cte.submission', 'metric.categoryNewApplications', async (t) => {
      const filtered = await context.page.categories(small.workspace, 'TRACK_PROGRAM', {
        dateFrom: toDate(context.daysAgo(31)),
        dateTo: toDate(context.daysAgo(9)),
      });

      t.equal("ben's, in the range", categoryOf(filtered, null, 'AI_SOFTWARE').newApplications, 1);
    });

    await check('cte.step_total', 'metric.categoryRates', (t) => {
      const business = categoryOf(small.track, null, 'BUSINESS').stepRates;
      const ai = categoryOf(small.track, null, 'AI_SOFTWARE').stepRates;

      t.equal('ada and dan eligible, nobody reached', stageOf(business, 'NEW'), { stageKey: 'NEW', eligible: 2, rate: 0, soFarRate: 0 });
      t.equal('ben eligible and reached; cat too recent', stageOf(ai, 'NEW'), { stageKey: 'NEW', eligible: 1, rate: 1, soFarRate: 1 / 2 });
    });

    await check('cte.overall_total', 'metric.categoryRates', (t) => {
      const row = categoryOf(distinct.track, null, 'BUSINESS');

      t.equal('cohort', row.cohortSize, 16);
      t.equal('eligible', row.overallEligible, 3);
      t.equal('rate', row.overallRate, 1 / 3);
      t.equal('so far', row.overallSoFarRate, 2 / 16);
    });

    await check('cte.person_position', 'metric.categoryOverlap', async (t) => {
      t.equal('cat, in several rows', small.track.peopleInSeveral, 1);
      t.equal('cat, in several tracks', small.track.peopleInSeveralTracks, 1);

      const workspace = await context.createWorkspace();

      await workspace.fixtures.insertPerson({ stage: 'NEW', positions: ['FINANCE_INTERN', 'MARKETING_INTERN'], createdAt: context.daysAgo(3) });
      await context.runSync(workspace);

      const sameTrack = await context.page.categories(workspace, 'TRACK_PROGRAM');

      t.equal('two positions', sameTrack.peopleInSeveral, 1);
      t.equal('one track', sameTrack.peopleInSeveralTracks, 0);
    });

    await check('cte.scope', 'metric.categoryOverlap', (t) => {
      t.equal('everyone in scope, those under NONE too', small.track.distinctPeople, 7);
      t.equal('source overlap is always 0', [small.source.distinctPeople, small.source.peopleInSeveral, small.source.peopleInSeveralTracks], [7, 0, 0]);
    });

    await check('facade.crmState.positionsAppliedFor', 'metric.categoryRows', async (t) => {
      const field = small.workspace.flatMaps.flatFieldMetadataMaps.byUniversalIdentifier['person-positionsAppliedFor-uid'];
      const option = field.options.find(({ value }) => value === 'FINANCE_INTERN');

      option.label = 'Finance intern';

      try {
        const categories = await context.page.categories(small.workspace, 'TRACK_PROGRAM');

        t.equal('program label', categoryOf(categories, 'BUSINESS', 'FINANCE_INTERN').label, 'Finance intern');
      } finally {
        option.label = 'FINANCE_INTERN';
      }

      t.equal('unknown position is flagged', categoryOf(small.track, 'UNMAPPED', 'LEGACY_POSITION').isUnmapped, true);
      t.equal('known position is not', categoryOf(small.track, 'BUSINESS', 'FINANCE_INTERN').isUnmapped, false);
    });

    await check('facade.crmState.applicantSource', 'metric.categoryRows', async (t) => {
      const field = small.workspace.flatMaps.flatFieldMetadataMaps.byUniversalIdentifier['person-applicantSource-uid'];
      const { options } = field;

      field.options = options
        .filter(({ value }) => value !== 'WEBSITE')
        .map((option) => (option.value === 'LINKEDIN' ? { ...option, label: 'LinkedIn' } : option));

      try {
        const categories = await context.page.categories(small.workspace, 'SOURCE');

        // Which key the flagged row carries is an open question the seed layer reports.
        const flagged = categories.rows.filter(({ isUnmapped }) => isUnmapped);

        t.equal('source label', categoryOf(categories, null, 'LINKEDIN').label, 'LinkedIn');
        t.equal('a value no option lists gets one flagged row', flagged.map(({ people }) => people), [1]);
        t.equal('the listed one is not flagged', categoryOf(categories, null, 'LINKEDIN').isUnmapped, false);
      } finally {
        field.options = options;
      }

      t.equal('no source', categoryOf(small.source, null, 'NONE').label, 'No source');
    });

    await check('config.tracks', 'metric.categoryRows', (t) => {
      const config = context.loader.real('src/modules/analytics/constants/crm-analytics-config.constant').CRM_ANALYTICS_CONFIG;

      t.equal('track label', categoryOf(small.track, null, 'BUSINESS').label, config.tracks.find(({ trackKey }) => trackKey === 'BUSINESS').label);
      t.equal('unknown', categoryOf(small.track, null, 'UNMAPPED').label, 'Unmapped');
      t.equal('no position', categoryOf(small.track, null, 'NONE').label, 'No position');
    });

    await check('metric.categoryPeople', 'metric.categoryRows', (t) => {
      const row = categoryOf(distinct.track, 'BUSINESS', 'FINANCE_INTERN');

      t.equal('people', row.people, 17);
      t.equal('active', row.activePeople, 12);
    });

    await check('metric.categoryNewApplications', 'metric.categoryRows', async (t) => {
      t.equal('counted', categoryOf(distinct.track, null, 'BUSINESS').newApplications, 5);

      const workspace = await context.createWorkspace({ forms: 'NONE' });

      await workspace.fixtures.insertPerson({ stage: 'NEW', positions: ['FINANCE_INTERN'], createdAt: context.daysAgo(3) });
      await context.runSync(workspace);

      const categories = await context.page.categories(workspace, 'TRACK_PROGRAM');

      t.equal('no form object is unknown, not 0', categoryOf(categories, null, 'BUSINESS').newApplications, null);
    });

    await check('metric.categoryRates', 'metric.categoryRows', (t) => {
      const row = categoryOf(distinct.track, null, 'BUSINESS');

      t.equal('one rate per step, in order', row.stepRates.map(({ stageKey }) => stageKey), distinct.track.stepStageKeys);
      t.equal('NEW', stageOf(row.stepRates, 'NEW'), { stageKey: 'NEW', eligible: 13, rate: 7 / 13, soFarRate: 9 / 16 });
    });

    // ---- cohort table and trends
    const smallTrend = (metric, options) => context.page.trends(small.workspace, metric, options);
    const distinctTrend = (metric, options) => context.page.trends(distinct.workspace, metric, options);
    const pointAt = (series, bucketStart) => rowOf(series, 'bucketStart', bucketStart);

    await check('cte.step_total', 'metric.cohortTable', async (t) => {
      const { cohorts } = await smallTrend('TOTAL_CONTACTS');
      const old = pointAt(cohorts, weekStart(context.daysAgo(30)));
      const recent = pointAt(cohorts, weekStart(context.daysAgo(3)));

      t.equal('mature cell', stageOf(old.cells, 'NEW'), { stageKey: 'NEW', entered: 3, eligible: 3, rate: 1 / 3, soFarRate: 1 / 3, isMature: true });
      t.equal('immature cell has no rate', stageOf(recent.cells, 'NEW'), { stageKey: 'NEW', entered: 1, eligible: 0, rate: null, soFarRate: 0, isMature: false });
    });

    await check('cte.overall_total', 'metric.cohortTable', async (t) => {
      const { cohorts } = await distinctTrend('TOTAL_CONTACTS', { filter: { period: 'MONTH' } });
      const row = pointAt(cohorts, monthStart(context.daysAgo(100)));

      t.equal('size', row.size, 3);
      t.equal('all three past 90 days', row.overallRate, 1 / 3);
      t.equal('so far', row.overallSoFarRate, 2 / 3);
    });

    await check('cte.overall_total', 'metric.trendOverallConversion', async (t) => {
      const { series } = await distinctTrend('OVERALL_CONVERSION', { filter: { period: 'MONTH' } });
      const oldPoint = pointAt(series, monthStart(context.daysAgo(100)));
      const recentPoint = pointAt(series, monthStart(context.daysAgo(40)));

      t.equal('mature', [oldPoint.value, oldPoint.size], [1 / 3, 3]);
      t.equal('still inside 90 days: stops, never 0', recentPoint.value, null);
      t.ok('with its size', recentPoint.size > 0, recentPoint);
    });

    await check('cte.step_total', 'metric.trendDropOff', async (t) => {
      const { series, stageKey } = await distinctTrend('DROP_OFF');
      const old = pointAt(series, weekStart(context.daysAgo(40)));
      const recent = pointAt(series, weekStart(context.daysAgo(5)));

      t.equal('default stage', stageKey, 'NEW');
      t.equal('r1 to r7, x1, x2, late', [old.value, old.size], [3 / 10, 10]);
      t.equal('too recent: stops, never 0', [recent.value, recent.size], [null, 3]);
    });

    const newApplicationAges = [1, 2, 3, 4, 5, 10, 11];
    const expectedByWeek = (ages) => {
      const counts = {};

      for (const age of ages) {
        const week = weekStart(context.daysAgo(age));

        counts[week] = (counts[week] ?? 0) + 1;
      }

      return counts;
    };

    await check('cte.submission', 'metric.trendNewApplications', async (t) => {
      const { series } = await distinctTrend('NEW_APPLICATIONS');
      const expected = expectedByWeek(newApplicationAges);

      for (const point of series) {
        t.equal(`week ${point.bucketStart}`, point.value, expected[point.bucketStart] ?? 0);
      }
    });

    await check('cte.scope', 'metric.trendNewApplications', async (t) => {
      const exited = await distinctTrend('NEW_APPLICATIONS', { filter: { status: 'EXITED' } });

      t.equal('x1 applied outside these buckets', exited.series.reduce((total, point) => total + point.value, 0), 0);

      const active = await distinctTrend('NEW_APPLICATIONS', { filter: { status: 'ACTIVE' } });

      t.equal('r1 to r7', active.series.reduce((total, point) => total + point.value, 0), 7);
    });

    const snapshotHistory = await fixture('two snapshots in one earlier week', async () => {
      const workspace = await context.createWorkspace();

      await workspace.fixtures.insertPerson({ stage: 'NEW', createdAt: context.daysAgo(3) });
      await context.runSync(workspace);
      await context.runDaily(workspace);

      const week = weekStart(context.daysAgo(14));
      const tuesday = toDate(new Date(`${week}T00:00:00.000Z`).getTime() + 86_400_000);

      await context.query(
        `INSERT INTO analytics.daily_snapshot (workspace_id, snapshot_date, dimension, dimension_key, stage, person_count)
         VALUES ($1, $2::date, 'all', '', 'NEW', 40), ($1, $3::date, 'all', '', 'NEW', 41)`,
        [workspace.workspaceId, week, tuesday],
      );

      return { tuesday, week, workspace };
    });

    await check('cte.bucket_day', 'metric.trendSnapshot', async (t) => {
      const { series } = await context.page.trends(snapshotHistory.workspace, 'TOTAL_CONTACTS');

      t.equal('the last snapshot of the bucket', pointAt(series, snapshotHistory.week).value, 41);
    }, { needs: [snapshotHistory] });

    await check('cte.matching_row', 'metric.trendSnapshot', async (t) => {
      const { series } = await context.page.trends(snapshotHistory.workspace, 'TOTAL_CONTACTS');

      t.equal('today', series.at(-1).value, 1);
      t.equal('no snapshot is unknown, not 0', pointAt(series, weekStart(context.daysAgo(35))).value, null);
    }, { needs: [snapshotHistory] });

    await check('cte.completed_stay', 'metric.trendMedianDays', async (t) => {
      const { series } = await smallTrend('MEDIAN_DAYS');
      const stays = [[25, 5], [20, 10]];
      const byWeek = {};

      for (const [endAge, days] of stays) {
        const week = weekStart(context.daysAgo(endAge));

        (byWeek[week] ??= []).push(days);
      }

      for (const [week, days] of Object.entries(byWeek)) {
        t.equal(`week ${week}`, [pointAt(series, week).value, pointAt(series, week).size], [medianOf(days), days.length]);
      }

      t.equal('no stay ended: unknown, not 0', pointAt(series, weekStart(context.daysAgo(10))).value, null);
    });

    await check('api.filter.period', 'metric.trendBuckets', async (t) => {
      const lengths = {};

      for (const period of ['DAY', 'WEEK', 'MONTH']) {
        lengths[period] = (await smallTrend('TOTAL_CONTACTS', { filter: { period } })).series.length;
      }

      t.equal('default bucket counts', lengths, { DAY: 30, WEEK: 12, MONTH: 12 });
    });

    await check('api.filter.dateRange', 'metric.trendBuckets', async (t) => {
      const { series } = await smallTrend('TOTAL_CONTACTS', {
        filter: { dateFrom: toDate(context.daysAgo(20)), dateTo: toDate(context.daysAgo(10)) },
      });

      t.equal('first', series[0].bucketStart, weekStart(context.daysAgo(20)));
      t.equal('last', series.at(-1).bucketStart, weekStart(context.daysAgo(10)));
    });

    await check('config.reportingTimeZone', 'metric.trendBuckets', async (t) => {
      const zone = 'Pacific/Kiritimati';
      const localToday = new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(new Date());

      await context.withAlteredConfig(
        (config) => {
          config.reportingTimeZone = zone;
        },
        async ({ page }) => {
          const { series, reportingTimeZone } = await page.trends(small.workspace, 'TOTAL_CONTACTS', { filter: { period: 'DAY' } });

          t.equal('reported', reportingTimeZone, zone);
          t.equal('the last bucket is the local today', series.at(-1).bucketStart, localToday);
        },
      );
    });

    await check('metric.trendBuckets', 'metric.trendSeries', async (t) => {
      const { series } = await smallTrend('TOTAL_CONTACTS');

      t.equal('only the current bucket is partial', series.filter((point) => point.isPartial).map((point) => point.bucketStart), [weekStart(context.now)]);
    });

    await check('metric.trendOverallConversion', 'metric.trendSeries', async (t) => {
      const daily = await distinctTrend('OVERALL_CONVERSION', { filter: { period: 'DAY' } });

      t.equal('no daily rates', [daily.series, daily.unavailableReason], [[], 'DAILY_RATE']);
    });

    await check('metric.trendDropOff', 'metric.trendSeries', async (t) => {
      const { series, unavailableReason } = await distinctTrend('DROP_OFF', { stageKey: 'CONTACTED' });

      t.equal('no reason', unavailableReason, null);
      t.equal('the asked stage: r1 of r1 to r7', pointAt(series, weekStart(context.daysAgo(40))).value, 6 / 7);
    });

    await check('metric.trendNewApplications', 'metric.trendSeries', async (t) => {
      const { series } = await distinctTrend('NEW_APPLICATIONS');
      const bucket = toDate(new Date(`${weekStart(context.daysAgo(90))}T00:00:00.000Z`).getTime() + 84 * 86_400_000);

      t.equal('x1, twelve weeks before this bucket', pointAt(series, bucket).previousValue, 1);

      const noForms = await context.createWorkspace({ forms: 'NONE' });

      await context.runSync(noForms);

      const unavailable = await context.page.trends(noForms, 'NEW_APPLICATIONS');

      t.equal('no form object', [unavailable.series, unavailable.unavailableReason], [[], 'NO_SUBMISSION_OBJECT']);
    });

    await check('metric.trendSnapshot', 'metric.trendSeries', async (t) => {
      const total = await smallTrend('TOTAL_CONTACTS');
      const active = await smallTrend('ACTIVE_PEOPLE');
      const stage = await smallTrend('STAGE_COUNT', { stageKey: 'CONTACTED' });
      const combination = await smallTrend('TOTAL_CONTACTS', { filter: { sourceKey: 'LINKEDIN', trackKey: 'BUSINESS' } });

      t.equal('total', total.series.at(-1).value, 7);
      t.equal('active', active.series.at(-1).value, 4);
      t.equal('one stage', stage.series.at(-1).value, 1);
      t.equal('two dimensions cannot be answered', [combination.series, combination.unavailableReason], [[], 'SNAPSHOT_FILTER_COMBINATION']);
    });

    await check('metric.trendMedianDays', 'metric.trendSeries', async (t) => {
      const { series, stageKey } = await distinctTrend('MEDIAN_DAYS', { stageKey: 'CONTACTED' });

      t.equal('the asked stage', stageKey, 'CONTACTED');
      t.equal('r1 left CONTACTED at age 30 after 5 days', pointAt(series, weekStart(context.daysAgo(30))).value, 5);
    });

    // ---- movement
    const moveFilter = () => ({ dateFrom: toDate(context.daysAgo(26)), dateTo: toDate(context.daysAgo(24)) });

    await check('cte.entered_total', 'metric.movement', async (t) => {
      const { movement } = await smallTrend('TOTAL_CONTACTS', { filter: moveFilter() });

      t.equal('ben', stageOf(movement.rows, 'CONTACTED').enteredInPeriod, 1);
    });

    await check('cte.left_total', 'metric.movement', async (t) => {
      const { movement } = await smallTrend('TOTAL_CONTACTS', { filter: moveFilter() });

      t.equal('ben', stageOf(movement.rows, 'NEW').leftInPeriod, 1);
    });

    await check('cte.current_total', 'metric.movement', async (t) => {
      const { movement } = await smallTrend('TOTAL_CONTACTS');

      t.equal('NEW now', stageOf(movement.rows, 'NEW').countNow, 3);
      t.equal('no move this week', stageOf(movement.rows, 'CONTACTED').enteredInPeriod, 0);
    });

    await check('api.filter.dateRange', 'metric.movement', async (t) => {
      const filter = moveFilter();
      const filtered = await smallTrend('TOTAL_CONTACTS', { filter });
      const open = await smallTrend('TOTAL_CONTACTS');

      t.equal('the range', [filtered.movement.from, filtered.movement.to], [filter.dateFrom, filter.dateTo]);
      t.equal('else the period containing today', [open.movement.from, open.movement.to], [weekStart(context.now), toDate(context.now)]);
    });

    // ---- comparisons
    const reportFor = async (workspace, period, start) => context.page.report(workspace, period, start);

    await check('metric.newApplications', 'metric.comparisons', async (t) => {
      const week = weekStart(context.daysAgo(10));
      const report = await reportFor(small.workspace, 'WEEK', week);
      const row = rowOf(report.comparisons, 'metricKey', 'NEW_APPLICATIONS');

      t.equal("ben's week", [row.current, row.previous, row.isSignificant], [1, 0, false]);
    });

    await check('metric.movement', 'metric.comparisons', async (t) => {
      const week = weekStart(context.daysAgo(25));
      const next = toDate(new Date(`${week}T00:00:00.000Z`).getTime() + 7 * 86_400_000);
      const current = await reportFor(small.workspace, 'WEEK', week);
      const following = await reportFor(small.workspace, 'WEEK', next);

      t.equal("ben's week", rowOf(current.comparisons, 'metricKey', 'ENTERED_CONTACTED').current, 1);
      t.equal('the week after sees it as previous', rowOf(following.comparisons, 'metricKey', 'ENTERED_CONTACTED').previous, 1);
    });

    const comparison = async (t, alter, expected, label) => {
      const workspace = await context.createWorkspace();
      const { insertForm, insertPerson, insertSubmission } = workspace.fixtures;

      workspace.setTrackingStart(context.daysAgo(30));

      const personId = await insertPerson({ stage: 'NEW', createdAt: context.daysAgo(25) });
      const formId = await insertForm({ name: 'Internship Application' });
      const finishedWeek = weekStart(context.daysAgo(7));
      const weekBefore = toDate(new Date(`${finishedWeek}T12:00:00.000Z`).getTime() - 7 * 86_400_000);

      for (let count = 0; count < 3; count += 1) {
        await insertSubmission({ formId, personId, submittedAt: new Date(`${finishedWeek}T12:00:00.000Z`) });
      }

      for (let count = 0; count < 2; count += 1) {
        await insertSubmission({ formId, personId, submittedAt: new Date(`${weekBefore}T12:00:00.000Z`) });
      }

      await context.withAlteredConfig(alter, async ({ page, runDaily, runSync }) => {
        await runSync(workspace);
        await runDaily(workspace);

        const report = await page.report(workspace, 'WEEK', finishedWeek);

        t.equal(label, rowOf(report.comparisons, 'metricKey', 'NEW_APPLICATIONS').isSignificant, expected);
      });
    };

    await check('config.significantChangeRatio', 'metric.comparisons', async (t) => {
      await comparison(t, (config) => { config.minimumSample = 2; config.significantChangeRatio = 0.5; }, true, '2 to 3 is 50%, at the ratio');
      await comparison(t, (config) => { config.minimumSample = 2; config.significantChangeRatio = 0.6; }, false, '2 to 3 is under 60%');
    });

    await check('config.minimumSample', 'metric.comparisons', async (t) => {
      await comparison(t, (config) => { config.minimumSample = 3; config.significantChangeRatio = 0.5; }, false, 'previous 2 is under the minimum of 3');
    });

    // ---- sync state, from log rows written here so each column can be told apart
    const logWorkspace = async () => {
      const workspace = await context.createWorkspace();

      await context.runSync(workspace);
      await context.query(`DELETE FROM analytics.sync_log WHERE workspace_id = $1`, [workspace.workspaceId]);

      // The database clock of this moment: these ages sit right at a 30 or 60 minute limit.
      workspace.insertLog = async ({ jobName, status, startedAge, finishedAge = startedAge, restored = 0 }) =>
        (
          await context.query(
            `INSERT INTO analytics.sync_log (workspace_id, job_name, started_at, finished_at, status, restored_count)
             VALUES ($1, $2, now() - $3 * interval '1 minute', now() - $4 * interval '1 minute', $5, $6)
             RETURNING started_at, finished_at`,
            [workspace.workspaceId, jobName, startedAge, finishedAge, status, restored],
          )
        )[0];

      return workspace;
    };

    await check('analytics.sync_log.finished_at', 'metric.syncState', async (t) => {
      const workspace = await logWorkspace();

      const syncRow = await workspace.insertLog({ jobName: 'sync', status: 'ok', startedAge: 12, finishedAge: 10 });
      const dailyRow = await workspace.insertLog({ jobName: 'daily', status: 'ok', startedAge: 22, finishedAge: 20 });

      const { sync } = await context.page.meta(workspace);

      t.equal('last success', sync.lastSuccessfulSyncAt, toIso(syncRow.finished_at));
      t.equal('last reconciliation', sync.lastReconciliationAt, toIso(dailyRow.finished_at));
    });

    await check('analytics.sync_log.started_at', 'metric.syncState', async (t) => {
      const workspace = await logWorkspace();

      const row = await workspace.insertLog({ jobName: 'sync', status: 'ok', startedAge: 12, finishedAge: 10 });

      t.equal('last attempt', (await context.page.meta(workspace)).sync.lastAttemptAt, toIso(row.started_at));
    });

    await check('analytics.sync_log.status', 'metric.syncState', async (t) => {
      const workspace = await logWorkspace();

      await workspace.insertLog({ jobName: 'sync', status: 'ok', startedAge: 30 });
      t.equal('ok', (await context.page.meta(workspace)).sync.lastAttemptStatus, 'OK');

      await workspace.insertLog({ jobName: 'sync', status: 'skipped', startedAge: 20 });
      t.equal('skipped', (await context.page.meta(workspace)).sync.lastAttemptStatus, 'SKIPPED');

      await workspace.insertLog({ jobName: 'sync', status: 'failed', startedAge: 10 });
      t.equal('failed', (await context.page.meta(workspace)).sync.lastAttemptStatus, 'FAILED');
    });

    await check('analytics.sync_log.job_name', 'metric.syncState', async (t) => {
      const workspace = await logWorkspace();

      const syncRow = await workspace.insertLog({ jobName: 'sync', status: 'ok', startedAge: 200 });

      await workspace.insertLog({ jobName: 'daily', status: 'ok', startedAge: 5 });

      const { sync } = await context.page.meta(workspace);

      t.equal('a daily success cannot hide a stopped sync', sync.isStale, true);
      t.equal('nor stand in for a sync', sync.lastSuccessfulSyncAt, toIso(syncRow.finished_at));
    });

    await check('analytics.sync_log.restored_count', 'metric.syncState', async (t) => {
      const workspace = await logWorkspace();

      t.equal('no daily yet is unknown', (await context.page.meta(workspace)).sync.restoredInLastReconciliation, null);
      await workspace.insertLog({ jobName: 'daily', status: 'ok', startedAge: 5, restored: 4 });
      t.equal('restored', (await context.page.meta(workspace)).sync.restoredInLastReconciliation, 4);
    });

    await check('analytics.sync_log.workspace_id', 'metric.syncState', async (t) => {
      const workspace = await logWorkspace();
      const meta = await context.page.meta(workspace);

      t.equal('another workspace has rows, this one sees none', meta.sync.lastAttemptAt, null);
      t.equal('page state', meta.state, 'NEVER_SYNCED');
    });

    await check('config.staleAfterMinutes', 'metric.syncState', async (t) => {
      const fresh = await logWorkspace();
      const stale = await logWorkspace();

      await fresh.insertLog({ jobName: 'sync', status: 'ok', startedAge: 59 });
      await stale.insertLog({ jobName: 'sync', status: 'ok', startedAge: 61 });

      t.equal('59 minutes', (await context.page.meta(fresh)).sync.isStale, false);
      t.equal('61 minutes', (await context.page.meta(stale)).sync.isStale, true);
    });

    await check('config.runningLimitMinutes', 'metric.syncState', async (t) => {
      const young = await logWorkspace();
      const killed = await logWorkspace();

      await young.insertLog({ jobName: 'sync', status: 'ok', startedAge: 40 });
      await young.insertLog({ jobName: 'sync', status: 'running', startedAge: 29, finishedAge: null });
      await killed.insertLog({ jobName: 'sync', status: 'running', startedAge: 31, finishedAge: null });

      t.equal('a young running row is ignored', (await context.page.meta(young)).sync.lastAttemptStatus, 'OK');
      t.equal('an old one was killed', (await context.page.meta(killed)).sync.lastAttemptStatus, 'FAILED');
    });

    await check('facade.crmState.stage', 'metric.pageState', async (t) => {
      const noField = await context.createWorkspace({ personFields: 'NONE' });

      await context.runSync(noField);

      const meta = await context.page.meta(noField);

      t.equal('state', meta.state, 'NO_STAGE_FIELD');
      t.equal('field status', meta.fields.stage, 'MISSING');
    });

    await check('settings.isDisabled', 'metric.pageState', async (t) => {
      const workspace = await context.createWorkspace();

      await context.runSync(workspace);
      workspace.vars.set('CRM_ANALYTICS_DISABLED', true);

      t.equal('state', (await context.page.meta(workspace)).state, 'DISABLED');
      t.equal('payload', await context.page.overview(workspace), null);
    });

    await check('metric.syncState', 'metric.pageState', async (t) => {
      const workspace = await logWorkspace();

      t.equal('no success yet', (await context.page.meta(workspace)).state, 'NEVER_SYNCED');
      await workspace.insertLog({ jobName: 'sync', status: 'ok', startedAge: 5 });
      t.equal('a success', (await context.page.meta(workspace)).state, 'READY');
    });
  },
};
