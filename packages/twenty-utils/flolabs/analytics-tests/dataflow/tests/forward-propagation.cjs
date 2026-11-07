'use strict';
// Change one input at the source and state the whole difference: every sink that should
// move, with its value, and through the exact comparison, nothing else. All numbers are
// hand-calculated from the baseline in lib/seed.cjs under contract section 6.
const { assertDifference, createSinkReader, diffCaptures, normalizeCapture, toIso } = require('../lib/sinks.cjs');
const { seedBaseline } = require('../lib/seed.cjs');
const { toDate, weekStart } = require('../lib/taps.cjs');

const DAY_MS = 86_400_000;
// Scenarios use a workspace each. Three at a time keeps the layer inside its time limit.
const SCENARIO_CONCURRENCY = 3;

const addDays = (date, days) => toDate(new Date(`${date}T00:00:00.000Z`).getTime() + days * DAY_MS);

const median = (values) => {
  const sorted = [...values].sort((first, second) => first - second);
  const middle = (sorted.length - 1) / 2;

  return (sorted[Math.floor(middle)] + sorted[Math.ceil(middle)]) / 2;
};

const paths = (prefix, entries) =>
  Object.fromEntries(Object.entries(entries).map(([key, value]) => [`${prefix}${key}`, value]));

const gone = (before, prefix) =>
  Object.fromEntries(
    [...before.entries()].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => [key, [value, undefined]]),
  );

module.exports = {
  title: 'Forward propagation: one input, every sink',
  run: async ({ context, createScope }) => {
    const { fixture, test } = createScope({
      requirements: () => [
        context.requirement('CrmAnalyticsMetricsService'),
        context.requirement('CrmAnalyticsMetaService'),
        context.requirement('CrmAnalyticsReportService'),
        context.requirement('CrmAnalyticsWorkspaceSyncJob'),
        context.requirement('CrmAnalyticsWorkspaceDailyJob'),
        context.resolverRequirement,
      ],
    });

    const sinks = createSinkReader(context);

    const weekOf = (age) => weekStart(context.daysAgo(age));
    const thisWeek = () => weekOf(0);

    // Stay ends move median and size in the week the stay ended. [end age, days]
    const medianDifference = (staysBefore, staysAfter) => {
      const summarize = (stays) => {
        const byWeek = {};

        for (const [endAge, days] of stays) {
          (byWeek[weekOf(endAge)] ??= []).push(days);
        }

        return byWeek;
      };
      const before = summarize(staysBefore);
      const after = summarize(staysAfter);
      const difference = {};

      for (const week of new Set([...Object.keys(before), ...Object.keys(after)])) {
        const valueBefore = before[week] === undefined ? null : median(before[week]);
        const valueAfter = after[week] === undefined ? null : median(after[week]);
        const sizeBefore = before[week]?.length ?? 0;
        const sizeAfter = after[week]?.length ?? 0;

        if (valueBefore !== valueAfter) {
          difference[`trends.MEDIAN_DAYS.series[${week}].value`] = [valueBefore, valueAfter];
        }

        if (sizeBefore !== sizeAfter) {
          difference[`trends.MEDIAN_DAYS.series[${week}].size`] = [sizeBefore, sizeAfter];
        }
      }

      return difference;
    };

    // Submissions in the week buckets of the NEW_APPLICATIONS line. Ages of the rows counted.
    const volumeDifference = (agesBefore, agesAfter) => {
      const count = (ages) => {
        const byWeek = {};

        for (const age of ages) {
          byWeek[weekOf(age)] = (byWeek[weekOf(age)] ?? 0) + 1;
        }

        return byWeek;
      };
      const before = count(agesBefore);
      const after = count(agesAfter);
      const difference = {};

      for (const week of new Set([...Object.keys(before), ...Object.keys(after)])) {
        if ((before[week] ?? 0) !== (after[week] ?? 0)) {
          difference[`trends.NEW_APPLICATIONS.series[${week}].value`] = [before[week] ?? 0, after[week] ?? 0];
        }
      }

      return difference;
    };

    const seedAndRun = async () => {
      const workspace = await seedBaseline(context);

      await context.runSync(workspace);
      await context.runDaily(workspace);

      return workspace;
    };

    // Snapshots and reports are frozen on purpose. A separate test proves that; here they
    // are opened again so the change has a way into them.
    const reopenFrozenRows = async ({ workspaceId }) => {
      await context.query(`DELETE FROM analytics.daily_snapshot WHERE workspace_id = $1`, [workspaceId]);
      await context.query(`DELETE FROM analytics.report WHERE workspace_id = $1`, [workspaceId]);
    };

    const assertReports = (t, reportsBefore, reportsAfter, { allowed = [], spots = {} }) => {
      const difference = diffCaptures(reportsBefore, reportsAfter);

      for (const key of Object.keys(difference)) {
        const part = key.split('.').slice(3).join('.');

        if (!allowed.some((prefix) => part.startsWith(prefix))) {
          t.fail(`reports: ${key} must not change, moved ${JSON.stringify(difference[key])}`);
        }
      }

      for (const [key, expected] of Object.entries(spots)) {
        t.equal(`reports: ${key}`, difference[key], expected);
      }
    };

    const captureOf = async (workspace) => normalizeCapture(await sinks.capture(workspace), workspace);

    const reference = await fixture('reference capture of the baseline', async () => {
      const workspace = await seedAndRun();

      return { capture: await captureOf(workspace), reports: await sinks.readReports(workspace) };
    });

    const queued = [];

    // A scenario with prepare needs its own "before". The rest start from the reference.
    const runScenario = async (t, { prepare, mutate, expected, reports = {}, replay }) => {
      const workspace = await seedBaseline(context);

      await context.runSync(workspace);

      let before = reference.capture;
      let reportsBefore = reference.reports;
      let prepared;

      if (prepare !== undefined) {
        prepared = await prepare(workspace);
        await context.runSync(workspace);
        await context.runDaily(workspace);
        before = await captureOf(workspace);
        reportsBefore = await sinks.readReports(workspace);
        await reopenFrozenRows(workspace);
      }

      const note = await mutate(workspace, prepared);

      await context.runSync(workspace);
      await context.runDaily(workspace);

      const after = await captureOf(workspace);

      assertDifference(t, 'sinks', diffCaptures(before, after), expected({ before, note, workspace }));
      assertReports(t, reportsBefore, await sinks.readReports(workspace), typeof reports === 'function' ? reports({ note, workspace }) : reports);

      if (replay !== undefined) {
        await context.runSync(workspace);
        await context.runDaily(workspace);
        t.equal('replaying the jobs moves only this', diffCaptures(after, await captureOf(workspace)), replay);
      }
    };

    const scenario = (name, definition) => {
      queued.push(() => test(name, (t) => runScenario(t, definition), { needs: [reference] }));
    };

    const independent = (name, work) => {
      queued.push(() => test(name, work, { needs: [reference] }));
    };

    const reportKey = (type, start, part) => `reports.${type}.${start}.${part}`;
    const STAGE_REPORT_PARTS = ['funnel.', 'categories.', 'movement[', 'stuckByStage[', 'comparisons[', 'cohorts['];

    // Ada moves NEW to CONTACTED `age` days ago, written now.
    const moveAda = (age) => async (workspace) => {
      const personId = workspace.people.ada;
      const updatedAt = context.minutesAgo(1);
      const happensAt = context.daysAgo(age);
      const sourceId = await workspace.fixtures.insertStageChange({
        personId,
        before: 'NEW',
        after: 'CONTACTED',
        happensAt,
        updatedAt,
      });

      await workspace.fixtures.setPersonStage({ personId, stage: 'CONTACTED', updatedAt });

      return { happensAt, sourceId, updatedAt };
    };

    const adaTransition = ({ happensAt, updatedAt }) =>
      paths('transitions[ada NEW>CONTACTED].', {
        origin: [undefined, 'timeline'],
        sourceId: [undefined, true],
        happenedAt: [undefined, toIso(happensAt)],
        sourceUpdatedAt: [undefined, toIso(updatedAt)],
      });

    const adaSnapshotMove = {
      'snapshot.all[|NEW]': [3, 2],
      'snapshot.all[|CONTACTED]': [1, 2],
      'snapshot.source[LINKEDIN|NEW]': [2, 1],
      'snapshot.source[LINKEDIN|CONTACTED]': [undefined, 1],
      'snapshot.position[FINANCE_INTERN|NEW]': [2, 1],
      'snapshot.position[FINANCE_INTERN|CONTACTED]': [undefined, 1],
      'snapshot.track[BUSINESS|NEW]': [2, 1],
      'snapshot.track[BUSINESS|CONTACTED]': [undefined, 1],
    };

    const movementNow = {
      'trends.movement.rows[NEW].countNow': [3, 2],
      'trends.movement.rows[CONTACTED].countNow': [1, 2],
    };

    scenario('FP-01 person.stage and diff.stage, inside the window: one transition, funnel, totals, overview, categories, snapshot, trends, reports', {
      mutate: moveAda(20),
      replay: {},
      expected: ({ note }) => ({
        ...adaTransition(note),
        ...paths('overview.stageTotals', {
          '[NEW].count': [3, 2],
          '[NEW].pastLimitCount': [1, 0],
          '[CONTACTED].count': [1, 2],
          '[CONTACTED].pastLimitCount': [1, 2],
        }),
        ...paths('overview.stuck.rows[ada].', {
          stageKey: ['NEW', 'CONTACTED'],
          stageLabel: ['New', 'Contacted'],
          stageEnteredAt: [toIso(context.daysAgo(30)), toIso(context.daysAgo(20))],
          daysInStage: [30, 20],
          daysOverLimit: [16, 6],
        }),
        ...paths('funnel.rows[NEW].', {
          reachedNext: [1, 2],
          timedOut: [1, 0],
          stepRate: [1 / 3, 2 / 3],
          soFarRate: [1 / 4, 2 / 4],
          dropOffRate: [2 / 3, 1 / 3],
          medianDays: [7.5, 10],
          completedStays: [2, 3],
        }),
        ...paths('funnel.rows[CONTACTED].', { entered: [1, 2], eligible: [1, 2], timedOut: [1, 2] }),
        ...paths('categoriesTrack.rows[/BUSINESS].stepRates', {
          '[NEW].rate': [0, 1 / 2],
          '[NEW].soFarRate': [0, 1 / 3],
          '[CONTACTED].eligible': [0, 1],
          '[CONTACTED].rate': [null, 0],
          '[CONTACTED].soFarRate': [null, 0],
        }),
        ...paths('categoriesTrack.rows[BUSINESS/FINANCE_INTERN].stepRates', {
          '[NEW].rate': [0, 1],
          '[NEW].soFarRate': [0, 1 / 2],
          '[CONTACTED].eligible': [0, 1],
          '[CONTACTED].rate': [null, 0],
          '[CONTACTED].soFarRate': [null, 0],
        }),
        ...paths('categoriesSource.rows[/LINKEDIN].stepRates', {
          '[NEW].rate': [0, 1],
          '[NEW].soFarRate': [0, 1 / 2],
          '[CONTACTED].eligible': [0, 1],
          '[CONTACTED].rate': [null, 0],
          '[CONTACTED].soFarRate': [null, 0],
        }),
        ...adaSnapshotMove,
        ...movementNow,
        [`trends.STAGE_COUNT.series[${thisWeek()}].value`]: [3, 2],
        [`trends.DROP_OFF.series[${weekOf(30)}].value`]: [2 / 3, 1 / 3],
        ...paths(`trends.cohorts[${weekOf(30)}].cells`, {
          '[NEW].rate': [1 / 3, 2 / 3],
          '[NEW].soFarRate': [1 / 3, 2 / 3],
          '[CONTACTED].entered': [1, 2],
          '[CONTACTED].eligible': [1, 2],
        }),
        ...medianDifference([[25, 5], [20, 10]], [[25, 5], [20, 10], [20, 10]]),
      }),
      reports: () => {
        const moveWeek = weekOf(20);
        const benSameWeek = weekOf(25) === moveWeek ? 1 : 0;
        const nextWeek = addDays(moveWeek, 7);
        const lastWeek = weekOf(7);

        return {
          allowed: STAGE_REPORT_PARTS,
          spots: {
            [reportKey('WEEK', moveWeek, 'movement[CONTACTED].enteredInPeriod')]: [benSameWeek, benSameWeek + 1],
            [reportKey('WEEK', moveWeek, 'movement[NEW].leftInPeriod')]: [1 + benSameWeek, 2 + benSameWeek],
            [reportKey('WEEK', moveWeek, 'comparisons[ENTERED_CONTACTED].current')]: [benSameWeek, benSameWeek + 1],
            [reportKey('WEEK', nextWeek, 'comparisons[ENTERED_CONTACTED].previous')]: [benSameWeek, benSameWeek + 1],
            [reportKey('WEEK', lastWeek, 'funnel.rows[NEW].reachedNext')]: [1, 2],
            [reportKey('WEEK', lastWeek, 'movement[CONTACTED].countNow')]: [1, 2],
            [reportKey('WEEK', lastWeek, 'stuckByStage[NEW].count')]: [1, 0],
            [reportKey('WEEK', lastWeek, 'stuckByStage[CONTACTED].count')]: [1, 2],
          },
        };
      },
    });

    scenario('FP-02 timelineActivity.happensAt, the same move after the window: reached so far, not reachedNext, and too recent for the next step', {
      mutate: moveAda(10),
      expected: ({ before, note }) => ({
        ...adaTransition(note),
        'overview.figures.stuckPeople': [2, 1],
        'overview.stuck.total': [2, 1],
        ...gone(before, 'overview.stuck.rows[ada]'),
        ...paths('overview.stageTotals', {
          '[NEW].count': [3, 2],
          '[NEW].pastLimitCount': [1, 0],
          '[CONTACTED].count': [1, 2],
        }),
        ...paths('funnel.rows[NEW].', { soFarRate: [1 / 4, 2 / 4], medianDays: [7.5, 10], completedStays: [2, 3] }),
        ...paths('funnel.rows[CONTACTED].', { entered: [1, 2], inWindow: [0, 1] }),
        'categoriesTrack.rows[/BUSINESS].stepRates[NEW].soFarRate': [0, 1 / 3],
        'categoriesTrack.rows[/BUSINESS].stepRates[CONTACTED].soFarRate': [null, 0],
        'categoriesTrack.rows[BUSINESS/FINANCE_INTERN].stepRates[NEW].soFarRate': [0, 1 / 2],
        'categoriesTrack.rows[BUSINESS/FINANCE_INTERN].stepRates[CONTACTED].soFarRate': [null, 0],
        'categoriesSource.rows[/LINKEDIN].stepRates[NEW].soFarRate': [0, 1 / 2],
        'categoriesSource.rows[/LINKEDIN].stepRates[CONTACTED].soFarRate': [null, 0],
        ...adaSnapshotMove,
        ...movementNow,
        [`trends.STAGE_COUNT.series[${thisWeek()}].value`]: [3, 2],
        ...paths(`trends.cohorts[${weekOf(30)}].cells`, {
          '[NEW].soFarRate': [1 / 3, 2 / 3],
          '[CONTACTED].entered': [1, 2],
          '[CONTACTED].rate': [0, null],
          '[CONTACTED].isMature': [true, false],
        }),
        ...medianDifference([[25, 5], [20, 10]], [[25, 5], [20, 10], [10, 20]]),
      }),
      reports: { allowed: STAGE_REPORT_PARTS },
    });

    scenario('FP-03 person.positionsAppliedFor moves only position and track rows', {
      mutate: async ({ people, table }) => {
        await context.query(
          `UPDATE ${table('person')} SET "positionsAppliedFor" = ARRAY['AI_AGI_INTERN']::${table('person_positionsAppliedFor_enum')}[] WHERE id = $1`,
          [people.ada],
        );
      },
      expected: () => ({
        ...paths('categoriesTrack.rows[/BUSINESS].', {
          people: [3, 2],
          activePeople: [2, 1],
          newApplications: [1, 0],
          cohortSize: [3, 2],
          'stepRates[NEW].eligible': [2, 1],
        }),
        ...paths('categoriesTrack.rows[BUSINESS/FINANCE_INTERN].', {
          people: [2, 1],
          activePeople: [2, 1],
          newApplications: [1, 0],
          cohortSize: [2, 1],
          'stepRates[NEW].eligible': [1, 0],
          'stepRates[NEW].rate': [0, null],
        }),
        ...paths('categoriesTrack.rows[/AI_SOFTWARE].', {
          people: [2, 3],
          activePeople: [2, 3],
          newApplications: [0, 1],
          cohortSize: [2, 3],
          'stepRates[NEW].eligible': [1, 2],
          'stepRates[NEW].rate': [1, 1 / 2],
          'stepRates[NEW].soFarRate': [1 / 2, 1 / 3],
        }),
        ...paths('categoriesTrack.rows[AI_SOFTWARE/AI_AGI_INTERN].', {
          people: [2, 3],
          activePeople: [2, 3],
          newApplications: [0, 1],
          cohortSize: [2, 3],
          'stepRates[NEW].eligible': [1, 2],
          'stepRates[NEW].rate': [1, 1 / 2],
          'stepRates[NEW].soFarRate': [1 / 2, 1 / 3],
        }),
        'snapshot.position[FINANCE_INTERN|NEW]': [2, 1],
        'snapshot.position[AI_AGI_INTERN|NEW]': [1, 2],
        'snapshot.track[BUSINESS|NEW]': [2, 1],
        'snapshot.track[AI_SOFTWARE|NEW]': [1, 2],
      }),
      reports: () => ({
        allowed: ['categories.'],
        spots: { [reportKey('WEEK', weekOf(7), 'categories.rows[/BUSINESS].people')]: [3, 2] },
      }),
    });

    scenario('FP-04 person.applicantSource moves only source rows', {
      mutate: async ({ people, table }) => {
        await context.query(`UPDATE ${table('person')} SET "applicantSource" = 'REFERRAL' WHERE id = $1`, [people.ada]);
      },
      expected: () => ({
        ...paths('categoriesSource.rows[/LINKEDIN].', {
          people: [2, 1],
          activePeople: [2, 1],
          newApplications: [1, 0],
          cohortSize: [2, 1],
          'stepRates[NEW].eligible': [1, 0],
          'stepRates[NEW].rate': [0, null],
        }),
        ...paths('categoriesSource.rows[/REFERRAL].', {
          people: [1, 2],
          activePeople: [1, 2],
          newApplications: [0, 1],
          cohortSize: [1, 2],
          'stepRates[NEW].eligible': [1, 2],
          'stepRates[NEW].rate': [1, 1 / 2],
          'stepRates[NEW].soFarRate': [1, 1 / 2],
        }),
        'snapshot.source[LINKEDIN|NEW]': [2, 1],
        'snapshot.source[REFERRAL|NEW]': [undefined, 1],
      }),
    });

    scenario('FP-05 person.createdAt before tracking start: out of the cohort, inactive instead of stuck, counts untouched', {
      mutate: async ({ people, table }) => {
        await context.query(`UPDATE ${table('person')} SET "createdAt" = $2 WHERE id = $1`, [people.ada, context.daysAgo(200)]);
      },
      expected: ({ before }) => ({
        'overview.figures.stuckPeople': [2, 1],
        'overview.figures.inactivePeople': [1, 2],
        'overview.stageTotals[NEW].pastLimitCount': [1, 0],
        'overview.stuck.total': [2, 1],
        ...gone(before, 'overview.stuck.rows[ada]'),
        'funnel.cohortSize': [4, 3],
        ...paths('funnel.rows[NEW].', {
          entered: [4, 3],
          eligible: [3, 2],
          timedOut: [1, 0],
          stepRate: [1 / 3, 1 / 2],
          soFarRate: [1 / 4, 1 / 3],
          dropOffRate: [2 / 3, 1 / 2],
        }),
        'categoriesTrack.rows[/BUSINESS].cohortSize': [3, 2],
        'categoriesTrack.rows[/BUSINESS].stepRates[NEW].eligible': [2, 1],
        ...paths('categoriesTrack.rows[BUSINESS/FINANCE_INTERN].', {
          cohortSize: [2, 1],
          'stepRates[NEW].eligible': [1, 0],
          'stepRates[NEW].rate': [0, null],
        }),
        ...paths('categoriesSource.rows[/LINKEDIN].', {
          cohortSize: [2, 1],
          'stepRates[NEW].eligible': [1, 0],
          'stepRates[NEW].rate': [0, null],
        }),
        ...paths(`trends.cohorts[${weekOf(30)}].`, {
          size: [3, 2],
          'cells[NEW].entered': [3, 2],
          'cells[NEW].eligible': [3, 2],
          'cells[NEW].rate': [1 / 3, 1 / 2],
          'cells[NEW].soFarRate': [1 / 3, 1 / 2],
        }),
        [`trends.DROP_OFF.series[${weekOf(30)}].value`]: [2 / 3, 1 / 2],
        [`trends.DROP_OFF.series[${weekOf(30)}].size`]: [3, 2],
        [`trends.OVERALL_CONVERSION.series[${weekOf(30)}].size`]: [3, 2],
      }),
      reports: { allowed: ['funnel.', 'categories.', 'stuckByStage[', 'cohorts['] },
    });

    const softDeleteBen = {
      expected: ({ before }) => ({
        'overview.figures.totalContacts': [7, 6],
        'overview.figures.activePeople': [4, 3],
        'overview.figures.stuckPeople': [2, 1],
        'overview.figures.newApplicationsPrevious': [1, 0],
        'overview.stageTotals[CONTACTED].count': [1, 0],
        'overview.stageTotals[CONTACTED].pastLimitCount': [1, 0],
        'overview.stuck.total': [2, 1],
        ...gone(before, 'overview.stuck.rows[ben]'),
        ...volumeDifference([2, 10], [2]),
        'funnel.cohortSize': [4, 3],
        ...paths('funnel.rows[NEW].', {
          entered: [4, 3],
          eligible: [3, 2],
          reachedNext: [1, 0],
          stepRate: [1 / 3, 0],
          soFarRate: [1 / 4, 0],
          dropOffRate: [2 / 3, 1],
          medianDays: [7.5, 10],
          completedStays: [2, 1],
        }),
        ...paths('funnel.rows[CONTACTED].', {
          entered: [1, 0],
          eligible: [1, 0],
          timedOut: [1, 0],
          stepRate: [0, null],
          soFarRate: [0, null],
          dropOffRate: [1, null],
        }),
        'categoriesTrack.distinctPeople': [7, 6],
        ...['/AI_SOFTWARE', 'AI_SOFTWARE/AI_AGI_INTERN'].reduce(
          (entries, row) => ({
            ...entries,
            ...paths(`categoriesTrack.rows[${row}].`, {
              people: [2, 1],
              activePeople: [2, 1],
              cohortSize: [2, 1],
              'stepRates[NEW].eligible': [1, 0],
              'stepRates[NEW].rate': [1, null],
              'stepRates[NEW].soFarRate': [1 / 2, 0],
              'stepRates[CONTACTED].eligible': [1, 0],
              'stepRates[CONTACTED].rate': [0, null],
              'stepRates[CONTACTED].soFarRate': [0, null],
            }),
          }),
          {},
        ),
        'categoriesSource.distinctPeople': [7, 6],
        ...gone(before, 'categoriesSource.rows[/REFERRAL]'),
        'snapshot.all[|CONTACTED]': [1, undefined],
        'snapshot.source[REFERRAL|CONTACTED]': [1, undefined],
        'snapshot.position[AI_AGI_INTERN|CONTACTED]': [1, undefined],
        'snapshot.track[AI_SOFTWARE|CONTACTED]': [1, undefined],
        [`trends.TOTAL_CONTACTS.series[${thisWeek()}].value`]: [7, 6],
        [`trends.ACTIVE_PEOPLE.series[${thisWeek()}].value`]: [4, 3],
        [`trends.DROP_OFF.series[${weekOf(30)}].value`]: [2 / 3, 1],
        [`trends.DROP_OFF.series[${weekOf(30)}].size`]: [3, 2],
        [`trends.OVERALL_CONVERSION.series[${weekOf(30)}].size`]: [3, 2],
        ...medianDifference([[25, 5], [20, 10]], [[20, 10]]),
        ...paths(`trends.cohorts[${weekOf(30)}].`, {
          size: [3, 2],
          'cells[NEW].entered': [3, 2],
          'cells[NEW].eligible': [3, 2],
          'cells[NEW].rate': [1 / 3, 0],
          'cells[NEW].soFarRate': [1 / 3, 0],
          'cells[CONTACTED].entered': [1, 0],
          'cells[CONTACTED].eligible': [1, 0],
          'cells[CONTACTED].rate': [0, null],
          'cells[CONTACTED].soFarRate': [0, null],
        }),
        'trends.movement.rows[CONTACTED].countNow': [1, 0],
      }),
    };

    scenario('FP-06 person.deletedAt removes the person from every count, applications too, and leaves transitions', {
      mutate: async ({ fixtures, people }) => {
        await fixtures.softDeletePerson({ personId: people.ben, deletedAt: context.daysAgo(1) });
      },
      expected: softDeleteBen.expected,
      reports: () => ({
        allowed: [...STAGE_REPORT_PARTS, 'newApplications'],
        spots: {
          [reportKey('WEEK', weekOf(10), 'newApplications')]: [1, 0],
          [reportKey('WEEK', weekOf(10), 'comparisons[NEW_APPLICATIONS].current')]: [1, 0],
        },
      }),
    });

    independent('FP-07 person.deletedAt restored: every sink returns and no fake move appears', async (t) => {
      const workspace = await seedAndRun();
      const before = await sinks.capture(workspace);

      await workspace.fixtures.softDeletePerson({ personId: workspace.people.ben, deletedAt: context.daysAgo(1) });
      await reopenFrozenRows(workspace);
      await context.runSync(workspace);
      await context.runDaily(workspace);

      t.ok('it did leave', (await context.page.overview(workspace)).figures.totalContacts === 6);

      await workspace.fixtures.softDeletePerson({ personId: workspace.people.ben, deletedAt: null });
      await reopenFrozenRows(workspace);
      await context.runSync(workspace);
      await context.runDaily(workspace);

      t.equal('back to the baseline, transitions included', diffCaptures(before, await sinks.capture(workspace)), {});
    });

    scenario('FP-08 timelineActivity.updatedAt: a merge appends one row dated by the merge, the stored row stays, and the move reaches every sink', {
      prepare: async (workspace) => {
        const personId = workspace.people.ada;
        const rowId = await workspace.fixtures.insertStageChange({
          personId,
          before: 'NEW',
          after: 'CONTACTED',
          happensAt: context.daysAgo(20),
          updatedAt: context.daysAgo(2),
        });

        await workspace.fixtures.setPersonStage({ personId, stage: 'CONTACTED', updatedAt: context.daysAgo(2) });

        return { rowId };
      },
      mutate: async (workspace, { rowId }) => {
        const updatedAt = context.daysAgo(1);

        await workspace.fixtures.mergeStageChange({ rowId, after: 'BEFORE_MEETING', updatedAt });
        await workspace.fixtures.setPersonStage({ personId: workspace.people.ada, stage: 'BEFORE_MEETING', updatedAt });

        return { rowId, updatedAt };
      },
      expected: ({ before, note }) => ({
        ...paths('transitions[ada CONTACTED>BEFORE_MEETING].', {
          origin: [undefined, 'timeline'],
          sourceId: [undefined, true],
          happenedAt: [undefined, toIso(note.updatedAt)],
          sourceUpdatedAt: [undefined, toIso(note.updatedAt)],
        }),
        'overview.figures.stuckPeople': [2, 1],
        'overview.stuck.total': [2, 1],
        ...gone(before, 'overview.stuck.rows[ada]'),
        'overview.stageTotals[CONTACTED].count': [2, 1],
        'overview.stageTotals[CONTACTED].pastLimitCount': [2, 1],
        'overview.stageTotals[BEFORE_MEETING].count': [0, 1],
        ...paths('funnel.rows[CONTACTED].', { soFarRate: [0, 1 / 2], medianDays: [null, 19], completedStays: [0, 1] }),
        ...paths('funnel.rows[BEFORE_MEETING].', { entered: [0, 1], inWindow: [0, 1], soFarRate: [null, 0] }),
        ...['categoriesTrack.rows[/BUSINESS]', 'categoriesTrack.rows[BUSINESS/FINANCE_INTERN]', 'categoriesSource.rows[/LINKEDIN]'].reduce(
          (entries, row) => ({
            ...entries,
            [`${row}.stepRates[CONTACTED].soFarRate`]: [0, 1],
            [`${row}.stepRates[BEFORE_MEETING].soFarRate`]: [null, 0],
          }),
          {},
        ),
        'snapshot.all[|CONTACTED]': [2, 1],
        'snapshot.all[|BEFORE_MEETING]': [undefined, 1],
        'snapshot.source[LINKEDIN|CONTACTED]': [1, undefined],
        'snapshot.source[LINKEDIN|BEFORE_MEETING]': [undefined, 1],
        'snapshot.position[FINANCE_INTERN|CONTACTED]': [1, undefined],
        'snapshot.position[FINANCE_INTERN|BEFORE_MEETING]': [undefined, 1],
        'snapshot.track[BUSINESS|CONTACTED]': [1, undefined],
        'snapshot.track[BUSINESS|BEFORE_MEETING]': [undefined, 1],
        [`trends.MEDIAN_DAYS.series[${weekOf(1)}].value`]: [null, 19],
        [`trends.MEDIAN_DAYS.series[${weekOf(1)}].size`]: [0, 1],
        ...paths(`trends.cohorts[${weekOf(30)}].cells`, {
          '[CONTACTED].soFarRate': [0, 1 / 2],
          '[BEFORE_MEETING].entered': [0, 1],
          '[BEFORE_MEETING].soFarRate': [null, 0],
          '[BEFORE_MEETING].isMature': [true, false],
        }),
        ...paths('trends.movement.rows', {
          // Yesterday is last week on a Monday.
          ...(weekOf(1) === thisWeek() ? { '[BEFORE_MEETING].enteredInPeriod': [0, 1], '[CONTACTED].leftInPeriod': [0, 1] } : {}),
          '[BEFORE_MEETING].countNow': [0, 1],
          '[CONTACTED].countNow': [2, 1],
        }),
      }),
      reports: { allowed: STAGE_REPORT_PARTS },
    });

    scenario('FP-09 formSubmission.submittedAt, a new application today: volume sinks only', {
      mutate: async ({ fixtures, forms, people }) => {
        await fixtures.insertSubmission({ formId: forms.application, personId: people.ben, submittedAt: context.daysAgo(1) });
      },
      expected: () => ({
        'overview.figures.newApplications': [1, 2],
        'categoriesTrack.rows[/AI_SOFTWARE].newApplications': [0, 1],
        'categoriesTrack.rows[AI_SOFTWARE/AI_AGI_INTERN].newApplications': [0, 1],
        'categoriesSource.rows[/REFERRAL].newApplications': [0, 1],
        ...volumeDifference([2, 10], [2, 10, 1]),
      }),
      reports: { allowed: ['newApplications', 'categories.rows', 'comparisons[NEW_APPLICATIONS]'] },
    });

    scenario('FP-10 formSubmission.submittedAt in a finished week: the report of that week and the week after, not the page figures', {
      mutate: async ({ fixtures, forms, people }) => {
        await fixtures.insertSubmission({ formId: forms.application, personId: people.ben, submittedAt: context.daysAgo(15) });
      },
      expected: () => volumeDifference([2, 10], [2, 10, 15]),
      reports: () => {
        const week = weekOf(15);
        const countBefore = weekOf(10) === week ? 1 : 0;
        const nextWeek = addDays(week, 7);

        return {
          allowed: ['newApplications', 'categories.rows', 'comparisons[NEW_APPLICATIONS]'],
          spots: {
            [reportKey('WEEK', week, 'newApplications')]: [countBefore, countBefore + 1],
            [reportKey('WEEK', week, 'comparisons[NEW_APPLICATIONS].current')]: [countBefore, countBefore + 1],
            [reportKey('WEEK', week, 'categories.rows[/AI_SOFTWARE].newApplications')]: [countBefore, countBefore + 1],
            [reportKey('WEEK', nextWeek, 'newApplicationsPrevious')]: [countBefore, countBefore + 1],
            [reportKey('WEEK', nextWeek, 'comparisons[NEW_APPLICATIONS].previous')]: [countBefore, countBefore + 1],
          },
        };
      },
    });

    scenario('FP-11 formSubmission.submittedAt moved out of the span: count falls, old week rises', {
      mutate: async ({ submissions, table }) => {
        await context.query(`UPDATE ${table('_formSubmission')} SET "submittedAt" = $2 WHERE id = $1`, [submissions.adaRecent, context.daysAgo(40)]);
      },
      expected: () => ({
        'overview.figures.newApplications': [1, 0],
        'categoriesTrack.rows[/BUSINESS].newApplications': [1, 0],
        'categoriesTrack.rows[BUSINESS/FINANCE_INTERN].newApplications': [1, 0],
        'categoriesSource.rows[/LINKEDIN].newApplications': [1, 0],
        ...volumeDifference([2, 10], [40, 10]),
      }),
      reports: { allowed: ['newApplications', 'categories.rows', 'comparisons[NEW_APPLICATIONS]'] },
    });

    scenario('FP-12 crmForm.name renamed away: its applications leave every volume sink', {
      mutate: async ({ forms, table }) => {
        await context.query(`UPDATE ${table('_crmForm')} SET name = 'Old internship form' WHERE id = $1`, [forms.application]);
      },
      expected: () => ({
        'overview.figures.newApplications': [1, 0],
        'overview.figures.newApplicationsPrevious': [1, 0],
        'categoriesTrack.rows[/BUSINESS].newApplications': [1, 0],
        'categoriesTrack.rows[BUSINESS/FINANCE_INTERN].newApplications': [1, 0],
        'categoriesSource.rows[/LINKEDIN].newApplications': [1, 0],
        ...volumeDifference([2, 10], []),
      }),
      reports: { allowed: ['newApplications', 'categories.rows', 'comparisons[NEW_APPLICATIONS]'] },
    });

    scenario('FP-13 person.stage with no timeline row and an old person.updatedAt: daily restores one flagged move, counted for reach and movement, left out of durations', {
      mutate: async ({ fixtures, people }) => {
        await fixtures.setPersonStage({ personId: people.ben, stage: 'BEFORE_MEETING', updatedAt: context.minutesAgo(31) });
      },
      // The rerun finds no mismatch, so it reports 0 restored.
      replay: { 'meta.sync.restoredInLastReconciliation': [1, 0] },
      expected: ({ before }) => ({
        'transitions[ben CONTACTED>BEFORE_MEETING].origin': [undefined, 'reconcile'],
        'transitions[ben CONTACTED>BEFORE_MEETING].sourceId': [undefined, false],
        'meta.sync.restoredInLastReconciliation': [0, 1],
        'overview.figures.stuckPeople': [2, 1],
        'overview.stuck.total': [2, 1],
        ...gone(before, 'overview.stuck.rows[ben]'),
        'overview.stageTotals[CONTACTED].count': [1, 0],
        'overview.stageTotals[CONTACTED].pastLimitCount': [1, 0],
        'overview.stageTotals[BEFORE_MEETING].count': [0, 1],
        'funnel.rows[CONTACTED].soFarRate': [0, 1],
        ...paths('funnel.rows[BEFORE_MEETING].', { entered: [0, 1], inWindow: [0, 1], soFarRate: [null, 0] }),
        ...['categoriesTrack.rows[/AI_SOFTWARE]', 'categoriesTrack.rows[AI_SOFTWARE/AI_AGI_INTERN]', 'categoriesSource.rows[/REFERRAL]'].reduce(
          (entries, row) => ({
            ...entries,
            [`${row}.stepRates[CONTACTED].soFarRate`]: [0, 1],
            [`${row}.stepRates[BEFORE_MEETING].soFarRate`]: [null, 0],
          }),
          {},
        ),
        'snapshot.all[|CONTACTED]': [1, undefined],
        'snapshot.all[|BEFORE_MEETING]': [undefined, 1],
        'snapshot.source[REFERRAL|CONTACTED]': [1, undefined],
        'snapshot.source[REFERRAL|BEFORE_MEETING]': [undefined, 1],
        'snapshot.position[AI_AGI_INTERN|CONTACTED]': [1, undefined],
        'snapshot.position[AI_AGI_INTERN|BEFORE_MEETING]': [undefined, 1],
        'snapshot.track[AI_SOFTWARE|CONTACTED]': [1, undefined],
        'snapshot.track[AI_SOFTWARE|BEFORE_MEETING]': [undefined, 1],
        ...paths(`trends.cohorts[${weekOf(30)}].cells`, {
          '[CONTACTED].soFarRate': [0, 1],
          '[BEFORE_MEETING].entered': [0, 1],
          '[BEFORE_MEETING].soFarRate': [null, 0],
          '[BEFORE_MEETING].isMature': [true, false],
        }),
        ...paths('trends.movement.rows', {
          '[BEFORE_MEETING].enteredInPeriod': [0, 1],
          '[BEFORE_MEETING].countNow': [0, 1],
          '[CONTACTED].leftInPeriod': [0, 1],
          '[CONTACTED].countNow': [1, 0],
        }),
      }),
      reports: { allowed: STAGE_REPORT_PARTS },
    });

    independent('FP-14 person.updatedAt inside 30 minutes: no reconcile row yet, nothing moves in storage', async (t) => {
      const workspace = await seedAndRun();
      const before = await sinks.readTransitions(workspace);

      await workspace.fixtures.setPersonStage({ personId: workspace.people.ben, stage: 'BEFORE_MEETING', updatedAt: new Date() });
      await context.runDaily(workspace);

      t.equal('transitions', diffCaptures(before, await sinks.readTransitions(workspace)), {});
    });

    independent('FP-15 a reconcile row long ago: the stuck row says at least', async (t) => {
      const workspace = await seedAndRun();

      await workspace.fixtures.setPersonStage({ personId: workspace.people.ben, stage: 'BEFORE_MEETING', updatedAt: context.minutesAgo(31) });
      await context.runDaily(workspace);
      await context.query(
        `UPDATE analytics.stage_transition SET happened_at = $2 WHERE workspace_id = $1 AND origin = 'reconcile'`,
        [workspace.workspaceId, context.daysAgo(20)],
      );

      const { stuck } = await context.page.overview(workspace);
      const row = stuck.rows.find(({ personId }) => personId === workspace.people.ben);

      t.equal('lower bound', row.isLowerBound, true);
      t.equal('days', row.daysInStage, 20);
      t.equal('a timeline row is exact', stuck.rows.find(({ personId }) => personId === workspace.people.ada).isLowerBound, false);
    });

    scenario('FP-16 person name: the live display name of the stuck row and nothing else', {
      mutate: async ({ people, table }) => {
        await context.query(`UPDATE ${table('person')} SET "nameFirstName" = 'Adele' WHERE id = $1`, [people.ada]);
      },
      expected: () => ({
        'overview.stuck.rows[ada].displayName': ['Ada Stone', 'Adele Stone'],
      }),
    });

    scenario('FP-17 application rows: the imported total and nothing else', {
      mutate: async ({ table }) => {
        await context.query(`INSERT INTO ${table('_application')} (name) VALUES ('three')`);
      },
      expected: () => ({ 'overview.figures.importedApplications': [2, 3] }),
    });

    scenario('FP-18 a timeline row with no stage diff, a linked record or no person: nothing at all', {
      mutate: async ({ fixtures, people }) => {
        await fixtures.insertTimelineRow({ personId: people.ada, properties: { diff: { city: { before: 'A', after: 'B' } } }, happensAt: context.minutesAgo(2) });
        await fixtures.insertStageChange({ personId: people.ada, before: 'NEW', after: 'SIGNED_PAID', happensAt: context.minutesAgo(2), linkedRecordId: '20202020-0000-4000-8000-00000000abce' });
        await fixtures.insertStageChange({ personId: null, before: 'NEW', after: 'SIGNED_PAID', happensAt: context.minutesAgo(2) });
      },
      expected: () => ({}),
    });

    scenario('FP-22 formSubmission.deletedAt: the application leaves every volume sink', {
      mutate: async ({ submissions, table }) => {
        await context.query(`UPDATE ${table('_formSubmission')} SET "deletedAt" = $2 WHERE id = $1`, [submissions.adaRecent, context.daysAgo(1)]);
      },
      expected: () => ({
        'overview.figures.newApplications': [1, 0],
        'categoriesTrack.rows[/BUSINESS].newApplications': [1, 0],
        'categoriesTrack.rows[BUSINESS/FINANCE_INTERN].newApplications': [1, 0],
        'categoriesSource.rows[/LINKEDIN].newApplications': [1, 0],
        ...volumeDifference([2, 10], [10]),
      }),
      reports: { allowed: ['newApplications', 'categories.rows', 'comparisons[NEW_APPLICATIONS]'] },
    });

    scenario('FP-23 formSubmission.personId: the same application moves between category rows, totals stay', {
      mutate: async ({ people, submissions, table }) => {
        await context.query(`UPDATE ${table('_formSubmission')} SET "personId" = $2 WHERE id = $1`, [submissions.adaRecent, people.ben]);
      },
      expected: () => ({
        'categoriesTrack.rows[/BUSINESS].newApplications': [1, 0],
        'categoriesTrack.rows[BUSINESS/FINANCE_INTERN].newApplications': [1, 0],
        'categoriesTrack.rows[/AI_SOFTWARE].newApplications': [0, 1],
        'categoriesTrack.rows[AI_SOFTWARE/AI_AGI_INTERN].newApplications': [0, 1],
        'categoriesSource.rows[/LINKEDIN].newApplications': [1, 0],
        'categoriesSource.rows[/REFERRAL].newApplications': [0, 1],
      }),
      reports: { allowed: ['categories.rows'] },
    });

    scenario('FP-27 formSubmission.personId cleared: an application with no person stays in the totals and the line, and leaves the category rows', {
      mutate: async ({ submissions, table }) => {
        await context.query(`UPDATE ${table('_formSubmission')} SET "personId" = NULL WHERE id = $1`, [submissions.adaRecent]);
      },
      expected: () => ({
        'categoriesTrack.rows[/BUSINESS].newApplications': [1, 0],
        'categoriesTrack.rows[BUSINESS/FINANCE_INTERN].newApplications': [1, 0],
        'categoriesSource.rows[/LINKEDIN].newApplications': [1, 0],
      }),
      reports: { allowed: ['categories.rows'] },
    });

    independent("FP-28 applications against person filters: a soft-deleted person's never count, with or without a filter; one with no person counts only without", async (t) => {
      const workspace = await seedAndRun();
      const { page } = context;
      const filter = { sourceKey: 'LINKEDIN' };
      const newApplications = async (options) => (await page.overview(workspace, options)).figures.newApplications;
      const onTheLine = async (options) =>
        (await page.trends(workspace, 'NEW_APPLICATIONS', { filter: options })).series.reduce((total, { value }) => total + (value ?? 0), 0);

      await workspace.fixtures.insertSubmission({ formId: workspace.forms.application, personId: null, submittedAt: context.daysAgo(3) });

      t.equal('no filter: ada and nobody', await newApplications(), 2);
      t.equal('no filter, the line: ada, ben and nobody', await onTheLine(), 3);
      t.equal('a filter cannot place nobody: ada', await newApplications(filter), 1);
      t.equal('a filter, the line: ada', await onTheLine(filter), 1);

      await workspace.fixtures.softDeletePerson({ personId: workspace.people.ada, deletedAt: context.daysAgo(1) });

      t.equal('ada gone, no filter: nobody', await newApplications(), 1);
      t.equal('ada gone, no filter, the line: ben and nobody', await onTheLine(), 2);
      t.equal('ada gone, a filter', await newApplications(filter), 0);
      t.equal('ada gone, a filter, the line', await onTheLine(filter), 0);
    });

    const fieldOf = ({ flatMaps }, name) =>
      flatMaps.flatFieldMetadataMaps.byUniversalIdentifier[`person-${name}-uid`];

    scenario('FP-24 stage field audit flag off: the warning field and nothing else', {
      mutate: async (workspace) => {
        fieldOf(workspace, 'stage').isAuditLogged = false;
      },
      expected: () => ({ 'meta.fields.isStageAuditLogged': [true, false] }),
    });

    scenario('FP-25 option labels: only the labels change, and raw values keep every count', {
      mutate: async (workspace) => {
        const relabel = (name, value, label) => {
          fieldOf(workspace, name).options.find((option) => option.value === value).label = label;
        };

        relabel('stage', 'SIGNED_PAID', 'Signed, paid');
        relabel('positionsAppliedFor', 'FINANCE_INTERN', 'Finance intern');
        relabel('applicantSource', 'LINKEDIN', 'LinkedIn');
      },
      expected: () => ({
        'overview.stageTotals[SIGNED:SIGNED_PAID].label': ['SIGNED_PAID', 'Signed, paid'],
        'categoriesTrack.rows[BUSINESS/FINANCE_INTERN].label': ['FINANCE_INTERN', 'Finance intern'],
        'categoriesSource.rows[/LINKEDIN].label': ['LINKEDIN', 'LinkedIn'],
        'meta.programs[FINANCE_INTERN].label': ['FINANCE_INTERN', 'Finance intern'],
        'meta.sources[LINKEDIN].label': ['LINKEDIN', 'LinkedIn'],
      }),
      reports: { allowed: ['categories.rows[BUSINESS/FINANCE_INTERN].label'] },
    });

    independent('FP-26 off switch: jobs add nothing, every payload is empty, and switching back on recovers', async (t) => {
      const workspace = await seedAndRun();
      const countLogRows = async () =>
        (await context.query(`SELECT count(*)::int AS total FROM analytics.sync_log WHERE workspace_id = $1`, [workspace.workspaceId]))[0].total;
      const logRowsBefore = await countLogRows();
      const transitionsBefore = await sinks.readTransitions(workspace);
      const { page } = context;

      workspace.vars.set('CRM_ANALYTICS_DISABLED', true);
      await moveAda(20)(workspace);
      await context.runSync(workspace);
      await context.runDaily(workspace);

      t.equal('no job ran: no log row', await countLogRows(), logRowsBefore);
      t.equal('no job ran: no transition', diffCaptures(transitionsBefore, await sinks.readTransitions(workspace)), {});
      t.equal('meta says so', (await page.meta(workspace)).state, 'DISABLED');
      t.equal('overview', await page.overview(workspace), null);
      t.equal('funnel', await page.funnel(workspace), null);
      t.equal('categories', await page.categories(workspace, 'SOURCE'), null);
      t.equal('trends', await page.trends(workspace, 'TOTAL_CONTACTS'), null);
      t.equal('reports', await page.reports(workspace), null);
      t.equal('report', await page.report(workspace, 'WEEK', weekOf(7)), null);

      workspace.vars.delete('CRM_ANALYTICS_DISABLED');
      await context.runSync(workspace);

      const recovered = diffCaptures(transitionsBefore, await sinks.readTransitions(workspace));

      t.ok('on again: the move is read', Object.keys(recovered).some((key) => key.startsWith('transitions[ada NEW>CONTACTED]')), recovered);
    });

    independent('FP-20 tracking start moved later: cohort and clocks follow, storage does not', async (t) => {
      const workspace = await seedAndRun();
      const transitions = await sinks.readTransitions(workspace);
      const volumeOfWeek30 = async () =>
        (await context.page.trends(workspace, 'NEW_APPLICATIONS')).series.find(({ bucketStart }) => bucketStart === weekOf(30)).value;

      t.equal('a tracked week with no application is a real 0', await volumeOfWeek30(), 0);

      workspace.setTrackingStart(context.daysAgo(22));

      t.equal('the same week before the new start is unknown', await volumeOfWeek30(), null);

      const funnel = await context.page.funnel(workspace);
      const overview = await context.page.overview(workspace);

      t.equal('only cat applied after it', funnel.cohortSize, 1);
      t.equal('moves before it are ignored', funnel.rows.find(({ stageKey }) => stageKey === 'CONTACTED').entered, 0);
      // ada, ben and eve are now older than the start with no counted move. dan's move at
      // 20 is after it, and he is not active anyway.
      t.equal('inactive', overview.figures.inactivePeople, 3);
      t.equal('stuck needs a known entry', overview.figures.stuckPeople, 0);
      t.equal('storage untouched', diffCaptures(transitions, await sinks.readTransitions(workspace)), {});
    });

    independent('FP-21 snapshots and reports are frozen: a change after they were taken moves pages, not them', async (t) => {
      const workspace = await seedAndRun();
      const snapshots = await sinks.readSnapshots(workspace);
      const reports = await sinks.readReports(workspace);
      const pages = await sinks.readPages(workspace);
      const note = await moveAda(20)(workspace);

      await context.runSync(workspace);
      await context.runDaily(workspace);

      t.equal('snapshots', diffCaptures(snapshots, await sinks.readSnapshots(workspace)), {});
      t.equal('reports', diffCaptures(reports, await sinks.readReports(workspace)), {});
      t.ok('the page did move', Object.keys(diffCaptures(pages, await sinks.readPages(workspace))).length > 0);
      t.ok('and the transition is in', (await sinks.readTransitions(workspace)).get('transitions[ada NEW>CONTACTED].sourceId') === note.sourceId);
    });

    const workers = Array.from({ length: SCENARIO_CONCURRENCY }, async () => {
      while (queued.length > 0) {
        await queued.shift()();
      }
    });

    await Promise.all(workers);

    // Alters the shared config object, so it runs alone.
    await test('FP-19 mapping constant: a new alias moves live reads at once and rewrites nothing stored', async (t) => {
      const workspace = await seedAndRun();
      const transitions = await sinks.readTransitions(workspace);
      const snapshots = await sinks.readSnapshots(workspace);

      await context.withAlteredConfig(
        (config) => {
          config.stages.find(({ stageKey }) => stageKey === 'CONTACTED').rawValues.push({ rawValue: 'LEGACY_TEST', isReminder: false });
        },
        async ({ page, runDaily }) => {
          await runDaily(workspace);

          const overview = await page.overview(workspace);
          const funnel = await page.funnel(workspace);
          const rowKeys = overview.stageTotals.map(({ rowKey }) => rowKey);

          t.equal('no unmapped row left', rowKeys.includes('UNMAPPED:LEGACY_TEST'), false);
          t.equal('counted under its parent', overview.stageTotals.find(({ rowKey }) => rowKey === 'CONTACTED').count, 2);
          t.equal('nested under it', overview.stageTotals.find(({ rowKey }) => rowKey === 'CONTACTED:LEGACY_TEST').count, 1);
          t.equal('no longer excluded', funnel.cohortExcludedUnmapped, 0);
          t.equal('now in the cohort', funnel.cohortSize, 5);
          t.equal('transitions untouched', diffCaptures(transitions, await sinks.readTransitions(workspace)), {});
          t.equal('the first snapshot of the day stands', diffCaptures(snapshots, await sinks.readSnapshots(workspace)), {});
        },
      );

      t.equal('restored: unmapped again', (await context.page.funnel(workspace)).cohortExcludedUnmapped, 1);
    }, { needs: [reference] });
  },
};
