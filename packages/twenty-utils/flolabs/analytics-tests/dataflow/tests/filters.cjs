'use strict';
// The filter is the one input that comes from the screen. It must reach every view of a
// tab, stored counts included, and a bad value must stop before any SQL runs.
const fs = require('node:fs');
const path = require('node:path');

const { REPO_ROOT } = require('../lib/context.cjs');
const { seedBaseline } = require('../lib/seed.cjs');
const { monthStart, toDate } = require('../lib/taps.cjs');

const FRONT_ROOT = path.join(REPO_ROOT, 'packages/twenty-front/src/modules/crm-analytics');

const stageOf = (rows, key) => rows.find(({ stageKey }) => stageKey === key);
const categoryOf = (categories, parentKey, key) =>
  categories.rows.find((row) => row.parentKey === parentKey && row.key === key);
const sumValues = ({ series }) => series.reduce((total, { value }) => total + (value ?? 0), 0);

module.exports = {
  title: 'Filters reach every view',
  run: async ({ context, createScope }) => {
    const { edge, fixture, test } = createScope({
      requirements: () => [
        context.requirement('CrmAnalyticsMetricsService'),
        context.requirement('CrmAnalyticsWorkspaceDailyJob'),
        context.resolverRequirement,
      ],
    });

    const small = await fixture('baseline workspace', async () => {
      const workspace = await seedBaseline(context);

      await context.runSync(workspace);
      await context.runDaily(workspace);

      return workspace;
    });

    const needs = [small];
    const { page } = context;
    const storedTotal = async (filter) => (await page.trends(small, 'TOTAL_CONTACTS', { filter })).series.at(-1).value;

    await edge('api.filter.status', 'cte.matching_row', async (t) => {
      t.equal('ACTIVE', await storedTotal({ status: 'ACTIVE' }), 4);
      t.equal('EXITED', await storedTotal({ status: 'EXITED' }), 1);
      t.equal('UNMAPPED', await storedTotal({ status: 'UNMAPPED' }), 1);
      t.equal('NO_STAGE', await storedTotal({ status: 'NO_STAGE' }), 1);
      t.equal('nobody signed', await storedTotal({ status: 'SUCCESS' }), 0);
    }, { needs });

    await edge('api.filter.trackKey', 'cte.matching_row', async (t) => {
      t.equal('ada, cat, dan', await storedTotal({ trackKey: 'BUSINESS' }), 3);
      t.equal('eve, gus', await storedTotal({ trackKey: 'NONE' }), 2);
    }, { needs });

    await edge('api.filter.programKey', 'cte.matching_row', async (t) => {
      t.equal('ben, cat', await storedTotal({ programKey: 'AI_AGI_INTERN' }), 2);
      t.equal('a program inside its track reads the position rows', await storedTotal({ trackKey: 'AI_SOFTWARE', programKey: 'AI_AGI_INTERN' }), 2);
    }, { needs });

    await edge('api.filter.sourceKey', 'cte.matching_row', async (t) => {
      t.equal('ada, cat', await storedTotal({ sourceKey: 'LINKEDIN' }), 2);
      t.equal('dan, eve, gus', await storedTotal({ sourceKey: 'NONE' }), 3);
    }, { needs });

    await test('FILTER-01 a track narrows funnel, categories, movement and new applications alike', async (t) => {
      const filter = { trackKey: 'BUSINESS' };
      const funnel = await page.funnel(small, filter);
      const row = stageOf(funnel.rows, 'NEW');
      const categories = await page.categories(small, 'TRACK_PROGRAM', filter);
      const { movement } = await page.trends(small, 'TOTAL_CONTACTS', { filter });
      const { figures } = await page.overview(small, filter);

      t.equal('ada, cat, dan', funnel.cohortSize, 3);
      t.equal('step', [row.entered, row.eligible, row.reachedNext, row.exited, row.timedOut, row.inWindow], [3, 2, 0, 1, 1, 1]);
      t.equal('people in view', categories.distinctPeople, 3);
      t.equal('the track', categoryOf(categories, null, 'BUSINESS').people, 3);
      t.equal("cat's other track keeps her credit", categoryOf(categories, null, 'AI_SOFTWARE').people, 1);
      t.equal('movement now', [stageOf(movement.rows, 'NEW').countNow, stageOf(movement.rows, 'NOT_INTERESTED').countNow, stageOf(movement.rows, 'CONTACTED').countNow], [2, 1, 0]);
      t.equal('new applications: ada', [figures.newApplications, figures.newApplicationsPrevious], [1, 0]);
    }, { needs });

    await test('FILTER-02 a source narrows them too', async (t) => {
      const filter = { sourceKey: 'REFERRAL' };
      const funnel = await page.funnel(small, filter);
      const { figures } = await page.overview(small, filter);
      const volume = await page.trends(small, 'NEW_APPLICATIONS', { filter });

      t.equal('ben', funnel.cohortSize, 1);
      t.equal('reached', stageOf(funnel.rows, 'NEW').reachedNext, 1);
      t.equal('entered', stageOf(funnel.rows, 'CONTACTED').entered, 1);
      t.equal('contacts', figures.totalContacts, 1);
      t.equal('new applications: ben, a week back', [figures.newApplications, figures.newApplicationsPrevious], [0, 1]);
      t.equal('the line has only his', sumValues(volume), 1);
    }, { needs });

    await test('FILTER-03 a program narrows them too', async (t) => {
      const filter = { programKey: 'AI_AGI_INTERN' };

      t.equal('ben, cat', (await page.funnel(small, filter)).cohortSize, 2);
      t.equal('ben is the only one stuck', (await page.overview(small, filter)).stuck.total, 1);
    }, { needs });

    await test('FILTER-04 a status narrows them too', async (t) => {
      const filter = { status: 'EXITED' };
      const funnel = await page.funnel(small, filter);

      t.equal('dan', funnel.cohortSize, 1);
      t.equal('exited', stageOf(funnel.rows, 'NEW').exited, 1);
      t.equal('category', categoryOf(await page.categories(small, 'SOURCE', filter), null, 'NONE').people, 1);
    }, { needs });

    await test('FILTER-05 a date range is application date for cohorts, event date for movement, submission date for volume', async (t) => {
      const filter = { dateFrom: toDate(context.daysAgo(31)), dateTo: toDate(context.daysAgo(24)) };
      const funnel = await page.funnel(small, filter);
      const { movement } = await page.trends(small, 'TOTAL_CONTACTS', { filter });
      const { figures } = await page.overview(small, { dateFrom: toDate(context.daysAgo(11)), dateTo: toDate(context.daysAgo(9)) });

      t.equal('applied in range', funnel.cohortSize, 3);
      t.equal('moved in range', stageOf(movement.rows, 'CONTACTED').enteredInPeriod, 1);
      t.equal('submitted in range', figures.newApplications, 1);
    }, { needs });

    await test('FILTER-06 the period picks the buckets of a line', async (t) => {
      const byDay = await page.trends(small, 'NEW_APPLICATIONS', { filter: { period: 'DAY' } });
      const byMonth = await page.trends(small, 'NEW_APPLICATIONS', { filter: { period: 'MONTH' } });
      const valueOn = ({ series }, bucket) => series.find(({ bucketStart }) => bucketStart === bucket)?.value;
      const expectedInMonth = (bucket) =>
        [2, 10].filter((age) => monthStart(context.daysAgo(age)) === bucket).length;

      t.equal('ada, on her day', valueOn(byDay, toDate(context.daysAgo(2))), 1);
      t.equal('ben, on his day', valueOn(byDay, toDate(context.daysAgo(10))), 1);
      t.equal('nothing the day between', valueOn(byDay, toDate(context.daysAgo(5))), 0);
      t.equal('month of ada', valueOn(byMonth, monthStart(context.daysAgo(2))), expectedInMonth(monthStart(context.daysAgo(2))));
      t.equal('no value is lost between the two', sumValues(byDay), sumValues(byMonth));
    }, { needs });

    await test('FILTER-07 a bad value stops at the parser: no statement runs', async (t) => {
      // Emptied, because a full list stays the same length as it takes new statements.
      context.statements.length = 0;

      const refuses = async (work) => {
        try {
          await work();

          return false;
        } catch {
          return true;
        }
      };

      t.ok('status', await refuses(() => page.overview(small, { status: 'EVERYONE' })));
      t.ok('impossible date', await refuses(() => page.funnel(small, { dateFrom: '2026-13-45' })));
      t.ok('reversed range', await refuses(() => page.funnel(small, { dateFrom: '2026-11-02', dateTo: '2026-11-01' })));
      t.ok('group', await refuses(() => page.categories(small, 'PEOPLE')));
      t.ok('metric', await refuses(() => page.trends(small, 'REVENUE')));
      t.ok('period type', await refuses(() => page.report(small, 'YEAR', '2026-01-01')));
      t.ok('report date', await refuses(() => page.report(small, 'WEEK', 'last week')));
      t.equal('no SQL ran', context.statements.length, 0);
    }, { needs });

    await test('FILTER-08 what the screen sends is what the server accepts, and each document asks a real root field', async (t) => {
      const { parseCrmAnalyticsFilter } = context.loader.real('src/modules/analytics/utils/parse-crm-analytics-filter.util');
      const { CrmAnalyticsResolver } = context.loader.real('src/modules/analytics/resolvers/crm-analytics.resolver');
      const { CRM_ANALYTICS_DEFAULT_FILTER } = require(path.join(FRONT_ROOT, 'constants/CrmAnalyticsDefaultFilter.ts'));
      const documents = fs.readdirSync(path.join(FRONT_ROOT, 'graphql'));

      t.equal('default filter passes unchanged', parseCrmAnalyticsFilter(CRM_ANALYTICS_DEFAULT_FILTER), CRM_ANALYTICS_DEFAULT_FILTER);
      t.equal('one document per query', documents.length, 7);

      for (const document of documents) {
        const text = fs.readFileSync(path.join(FRONT_ROOT, 'graphql', document), 'utf8');
        const [rootField] = text.match(/\bgetCrmAnalytics\w+(?=\s*[({])/) ?? [];

        t.equal(`${document} asks the field the server has`, typeof CrmAnalyticsResolver.prototype[rootField], 'function');
        t.ok(`${document} selects payload`, /\bpayload\b/.test(text), text);
      }
    }, { needs });
  },
};
