// The page's rendering rules from contract section 8, against known numbers. Analytics
// answers are contract-shaped fixtures, the rest of the CRM is real, and every expected
// string below is quoted from the contract, or from the sample in its section 9.
import { expect, test, type Locator, type Page } from '@playwright/test';
import fs from 'node:fs';

import {
  FORBIDDEN_ANSWER,
  SERVER_ERROR_ANSWER,
  answerAnalyticsQueries,
  buildCategories,
  buildEmptyFunnel,
  buildMeta,
  buildOverview,
  buildTrends,
  minutesAgo,
  type AnalyticsCall,
  type AnalyticsField,
} from './lib/contract-api';
import {
  TAB_NAMES,
  analyticsTab,
  chooseOption,
  collectConsoleErrors,
  dropdownOption,
  expectNoZeroPercent,
  openAnalytics,
  pageText,
  rowCells,
  saveInBothSchemes,
  sidebarPeopleLink,
  tableRow,
} from './lib/page-helpers';
import { SCREENSHOTS_DIR } from './lib/paths';
import { fetchSeedPeople, type SeedPerson } from './lib/seed-people';

const ACCESS_MESSAGE = 'You do not have access to analytics. Ask an admin.';
const DISABLED_MESSAGE = 'Analytics is switched off.';
const NO_STAGE_MESSAGE =
  'This workspace has no Stage field on People, so there is nothing to measure yet.';
const NEVER_SYNCED_MESSAGE = 'The first sync has not finished.';
const NOT_RECORDING_MESSAGE =
  'Stage changes are not being recorded on the timeline.';
const EMPTY_MESSAGE = 'No people match these filters';

const ALL_FIELDS: AnalyticsField[] = [
  'getCrmAnalyticsMeta',
  'getCrmAnalyticsOverview',
  'getCrmAnalyticsFunnel',
  'getCrmAnalyticsCategories',
  'getCrmAnalyticsTrends',
  'getCrmAnalyticsReports',
  'getCrmAnalyticsReport',
];

let people: SeedPerson[];

test.beforeAll(async () => {
  people = await fetchSeedPeople();

  expect(
    people.length,
    'the local seed needs two people for the stuck rows',
  ).toBeGreaterThanOrEqual(2);
});

const stuckTable = (page: Page) =>
  page.getByRole('table').filter({ hasText: people[0].displayName });

// Where the text itself starts, so indenting by padding or by margin both count.
const readTextStart = (text: Locator) =>
  text.evaluate((element) => {
    const range = document.createRange();

    range.selectNodeContents(element);

    return range.getBoundingClientRect().x;
  });

const expectNoPageScroll = async (page: Page, where: string) => {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );

  expect(overflow, `the page scrolls sideways on ${where}`).toBeLessThanOrEqual(0);
};

test('overview shows the figures, stage totals and stuck list exactly', async ({ page }) => {
  await answerAnalyticsQueries(page, { people });
  await openAnalytics(page, 'Overview');

  await expect(page.getByText(/Last successful sync .*12 min/)).toBeVisible();
  await expect(
    page.getByText('337 active people, 123 past their stage limit.'),
  ).toBeVisible();

  for (const figure of ['337', '58', '804', '123']) {
    await expect(page.getByText(figure, { exact: true }).first()).toBeVisible();
  }

  await expect(page.getByText('900 imported, dates unknown')).toBeVisible();
  await expect(page.getByText('41 inactive')).toBeVisible();
  await expect(page.getByText(/against the previous/)).toBeVisible();

  const totals = page.getByRole('table').filter({ hasText: 'LEGACY_TEST' });

  await expect(tableRow(totals, /^New/).getByRole('cell').last()).toHaveText('9');
  await expect(tableRow(totals, /^New/)).toContainText('164');
  await expect(tableRow(totals, /^Contacted/)).toContainText('152');
  await expect(tableRow(totals, 'Unmapped: LEGACY_TEST')).toContainText('5');
  await expect(tableRow(totals, /^No stage/)).toContainText('432');

  const signedPaid = tableRow(totals, 'Signed paid');
  const signedParent = tableRow(totals, /^Signed\D*11/);

  await expect(signedPaid).toContainText('8');
  await expect(signedParent).toBeVisible();

  const rowTexts = await totals.getByRole('row').allInnerTexts();
  const parentIndex = rowTexts.findIndex((text) => /^Signed\s+11/.test(text.trim()));

  expect(rowTexts[parentIndex + 1], 'nested rows sit under their parent').toContain('Signed paid');
  expect(rowTexts[parentIndex + 2], 'nested rows sit under their parent').toContain('Signed non paid');

  expect(
    await readTextStart(signedPaid.getByText('Signed paid')),
    'nested rows are indented',
  ).toBeGreaterThan(await readTextStart(signedParent.getByText('Signed', { exact: true })));

  const stuck = stuckTable(page);

  for (const header of [/^Name$/, /^Stage$/, /days in stage/i, /days over limit/i]) {
    await expect(stuck.getByRole('columnheader', { name: header })).toBeVisible();
  }

  const firstRow = tableRow(stuck, people[0].displayName);
  const secondRow = tableRow(stuck, people[1].displayName);

  await expect(firstRow).toContainText('Contacted');
  await expect(firstRow).toContainText('131');
  await expect(firstRow).toContainText('117');
  await expect(firstRow).not.toContainText('at least');
  await expect(secondRow).toContainText('at least 129');
  await expect(page.getByText('Showing 100 of 123')).toBeVisible();

  await expectNoPageScroll(page, 'Overview');
});

test('funnel ledger holds the hand-calculated sample and the one lowest step', async ({ page }) => {
  const calls = await answerAnalyticsQueries(page, { people });

  await openAnalytics(page, 'Funnel');

  const ledger = page.getByRole('table').filter({ hasText: 'Saturday meeting' });

  for (const header of ['Stage', 'Reached', 'To next', 'Timed out', 'Exited', 'Too recent', 'Median days']) {
    await expect(ledger.getByRole('columnheader', { name: header, exact: true })).toBeVisible();
  }

  const expectRow = async (name: RegExp, cells: string[]) => {
    const row = tableRow(ledger, name);

    for (const [index, text] of cells.entries()) {
      await expect(rowCells(row).nth(index + 1)).toContainText(text);
    }
  };

  await expectRow(/^New/, ['7', '40%', '2', '1', '2', '5']);
  await expectRow(/^Contacted/, ['4', '33%', '2', '0', '1']);
  await expectRow(/^Before meeting/, ['2', '12% so far']);
  await expectRow(/^Saturday meeting/, ['1', 'n=1']);
  await expectRow(/^Attended/, ['0', 'Not enough data']);

  await expect(page.getByText('Lowest step', { exact: true })).toHaveCount(1);
  await expect(
    tableRow(ledger, /^Contacted/).getByText('Lowest step', { exact: true }),
  ).toBeVisible();

  const text = await pageText(page);

  expect(text).toContain('15% of 40 reached Signed.');
  expect(text).toContain('Lowest step: Contacted to Before meeting, 33%.');
  expect(text, 'the note gives the cohort size').toMatch(/cohort\D{0,12}7\b/i);
  expect(text, 'the note gives the unmapped people left out').toMatch(/\b2\b[^.]*unmapped/i);
  expect(text, 'the note gives the re-applicant rule').toMatch(/applies again|re-appl/i);

  await expectNoZeroPercent(page, 'Funnel');
  await expectNoPageScroll(page, 'Funnel');

  expect(
    calls.filter((call) => call.field === 'getCrmAnalyticsFunnel').every(
      (call: AnalyticsCall) => call.pathname === '/graphql',
    ),
    'analytics queries use the core endpoint',
  ).toBe(true);
});

test('funnel with no lowest step and an empty cohort gives the launch sentence', async ({ page }) => {
  await answerAnalyticsQueries(page, {
    people,
    getCrmAnalyticsFunnel: () => buildEmptyFunnel(),
  });
  await openAnalytics(page, 'Funnel');

  await expect(
    page.getByText(/Tracking started .+\. Conversion appears once people pass the \d+-day window\./).first(),
  ).toBeVisible();
  await expect(page.getByText('Lowest step', { exact: true })).toHaveCount(0);
  await expectNoZeroPercent(page, 'an empty funnel');
});

test('categories: note, expanding tracks, unmapped rows, rate forms, source switch', async ({ page }) => {
  const calls = await answerAnalyticsQueries(page, { people });

  await openAnalytics(page, 'Categories');

  await expect(
    page.getByText('4 people count in several rows; rows do not add up to 100'),
  ).toBeVisible();
  await expect(
    page.getByText('Business is largest; Business converts best, 25%.'),
  ).toBeVisible();

  const table = page.getByRole('table').filter({ hasText: 'Robotics' });

  await expect(tableRow(table, /^Business/)).toContainText('60');
  await expect(tableRow(table, /^Business/)).toContainText('25%');
  await expect(tableRow(table, /^Business/)).toContainText('55%');
  await expect(tableRow(table, /^Business/)).toContainText('12% so far');
  await expect(tableRow(table, /^Robotics/)).toContainText('Not enough data');
  await expect(page.getByText('Finance intern')).toHaveCount(0);

  const expandBusiness = page.getByRole('button', { name: 'Business', exact: true });

  await expect(expandBusiness).toHaveAttribute('aria-expanded', 'false');
  await expandBusiness.click();
  await expect(expandBusiness).toHaveAttribute('aria-expanded', 'true');
  await expect(tableRow(table, 'Finance intern')).toContainText('35');
  await expect(
    page.getByText('9 people count in several rows; rows do not add up to 100'),
  ).toBeVisible();

  await page.getByRole('button', { name: /^Unmapped/ }).click();
  await expect(tableRow(table, 'Unmapped: LEGACY_POSITION')).toBeVisible();

  await expect(
    tableRow(table, /^Business/).getByRole('cell').first(),
    'the first column stays in view when the table scrolls',
  ).toHaveCSS('position', 'sticky');
  await expectNoPageScroll(page, 'Categories');

  await page
    .getByRole('radio', { name: 'Source', exact: true })
    .or(page.getByRole('button', { name: 'Source', exact: true }))
    .or(page.getByRole('tab', { name: 'Source', exact: true }))
    .click();

  const sourceTable = page.getByRole('table').filter({ hasText: 'Linked network' });

  await expect(tableRow(sourceTable, 'Linked network')).toContainText('70');
  await expect(tableRow(sourceTable, 'Unmapped: LEGACY_SOURCE')).toContainText('4');
  await expect(page.getByText(/count in several rows/)).toHaveCount(0);
  expect(
    calls.some(
      (call) =>
        call.field === 'getCrmAnalyticsCategories' &&
        call.variables.groupBy === 'SOURCE',
    ),
    'the switch asks the server for sources',
  ).toBe(true);
});

// CSS colors to sRGB channels through a canvas, null for a gradient reference. The theme
// is free to write its colors as hex, rgb or display-p3.
const toRgba = (page: Page, cssColors: string[]) =>
  page.evaluate((colors) => {
    const context = document
      .createElement('canvas')
      .getContext('2d') as CanvasRenderingContext2D;

    return colors.map((color) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = '#010203';
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);

      const channels = [...context.getImageData(0, 0, 1, 1).data];

      return channels.join() === '1,2,3,255' ? null : channels;
    });
  }, cssColors);

const readChartPaths = (page: Page) =>
  page.evaluate(() => {
    const chart = [...document.querySelectorAll('svg')].find(
      (svg) => svg.getBoundingClientRect().width > 300,
    );

    return chart === undefined
      ? null
      : [...chart.querySelectorAll('path')].map((path) => {
          const style = getComputedStyle(path);

          return {
            d: path.getAttribute('d') ?? '',
            fill: style.fill,
            stroke: style.stroke,
          };
        });
  });

test('trends: line with a gap and a gray previous line, bucket, cohort and movement tables', async ({ page }) => {
  await answerAnalyticsQueries(page, { people });
  await openAnalytics(page, 'Trends');

  // The partial week is the latest value. The week before it has none, so no comparison.
  await expect(page.getByText('52 new applications in this week.', { exact: true })).toBeVisible();

  const bucketTable = page.getByRole('table').filter({ hasText: '38' }).first();
  const nullBucket = tableRow(bucketTable, '38');

  await expect(
    nullBucket.getByRole('cell').nth(1),
    'a bucket with no value must not read as 0',
  ).not.toHaveText(/^0$/);

  await expect.poll(() => readChartPaths(page), { message: 'no chart was drawn' }).not.toBeNull();
  await expect.poll(async () =>
    ((await readChartPaths(page)) ?? []).filter(({ fill, stroke, d }) => fill === 'none' && stroke !== 'none' && d.length > 20).length,
  ).toBeGreaterThanOrEqual(2);

  const paths = (await readChartPaths(page)) ?? [];
  const lines = paths.filter(({ fill, stroke, d }) => fill === 'none' && stroke !== 'none' && d.length > 20);

  expect(
    paths.filter(({ fill, d }) => fill !== 'none' && d.length > 40),
    'the line has no area fill',
  ).toEqual([]);
  expect(
    lines.some(({ d }) => (d.match(/M/g) ?? []).length >= 2),
    'a null bucket leaves a gap in the current line, it does not dip to 0',
  ).toBe(true);

  const colors = await toRgba(page, lines.map(({ stroke }) => stroke));

  // A gradient stroke cannot be read as one color; the screenshots show those.
  if (colors.every((color) => color !== null)) {
    const isGray = (color: number[]) => {
      const channels = color.slice(0, 3);

      return Math.max(...channels) - Math.min(...channels) < 25;
    };

    expect(
      colors.some((color) => isGray(color as number[])),
      `no gray previous line among ${JSON.stringify(colors)}`,
    ).toBe(true);
    expect(
      colors.some((color) => !isGray(color as number[])),
      `no colored current line among ${JSON.stringify(colors)}`,
    ).toBe(true);
  }

  const cohortTable = page.getByRole('table').filter({ hasText: '12% so far' });

  await expect(cohortTable).toContainText('45%');
  await expect(cohortTable).toContainText('n=80');

  const movementTable = page
    .getByRole('table')
    .filter({ has: page.getByRole('columnheader', { name: 'Entered', exact: true }) });

  for (const header of ['Stage', 'Entered', 'Left', 'Now']) {
    await expect(movementTable.getByRole('columnheader', { name: header, exact: true })).toBeVisible();
  }

  const movementRow = tableRow(movementTable, /^New/).getByRole('cell');

  await expect(movementRow.nth(1)).toHaveText('17');
  await expect(movementRow.nth(2)).toHaveText('13');
  await expect(movementRow.nth(3)).toHaveText('164');

  await expectNoPageScroll(page, 'Trends');
});

test('trends: each unavailable reason replaces the chart with its plain sentence', async ({ page }) => {
  await answerAnalyticsQueries(page, {
    people,
    getCrmAnalyticsTrends: (variables) => {
      const trends = buildTrends(variables);

      if (variables.metric === 'TOTAL_CONTACTS') {
        return { ...trends, unavailableReason: 'SNAPSHOT_FILTER_COMBINATION', series: [] };
      }

      if (variables.metric === 'NEW_APPLICATIONS') {
        return { ...trends, unavailableReason: 'NO_SUBMISSION_OBJECT', series: [] };
      }

      return trends;
    },
  });
  await openAnalytics(page, 'Trends');

  await chooseOption(page, 'By week', 'By day');

  for (const [metricLabel, reason] of [
    ['Overall conversion', /daily rates are not offered/i],
    ['Total contacts', /one category at a time/i],
    ['New applications', /no application forms/i],
  ] as const) {
    await page.getByRole('group', { name: 'Metric' }).click();
    await dropdownOption(page, metricLabel).click();
    await expect(page.getByText(reason)).toBeVisible();
  }

  await expectNoZeroPercent(page, 'an unavailable trend');
});

test('reports: no filter row, newest first by type, viewer marks significant rows', async ({ page }) => {
  const calls = await answerAnalyticsQueries(page, { people });

  await openAnalytics(page, 'Reports');

  await expect(page.getByText('All sources')).toHaveCount(0);

  const weekly = page.getByRole('list', { name: 'Weekly' }).getByRole('button');
  const monthly = page.getByRole('list', { name: 'Monthly' }).getByRole('button');

  await expect(weekly).toHaveCount(2);
  await expect(monthly).toHaveCount(1);

  await weekly.nth(1).click();
  await expect
    .poll(() => calls.at(-1)?.variables, { message: 'the second weekly report is the older one' })
    .toEqual({ periodType: 'WEEK', periodStart: '2026-10-19' });

  await weekly.nth(0).click();
  await expect
    .poll(() => calls.at(-1)?.variables, { message: 'the first weekly report is the newest' })
    .toEqual({ periodType: 'WEEK', periodStart: '2026-10-26' });

  await expect(page.getByText(/generated/i).first()).toBeVisible();
  await expect(page.getByText(/tracking started/i).first()).toBeVisible();

  const comparisons = page.getByRole('table').filter({ hasText: 'Entered Contacted' });

  await expect(tableRow(comparisons, 'New applications')).toContainText(/significant/i);
  await expect(tableRow(comparisons, 'New applications')).toContainText('58');
  await expect(tableRow(comparisons, 'Entered Contacted')).not.toContainText(/significant/i);

  await expect(page.getByRole('table').filter({ hasText: 'Saturday meeting' })).toBeVisible();

  await monthly.nth(0).click();
  await expect
    .poll(() => calls.at(-1)?.variables)
    .toEqual({ periodType: 'MONTH', periodStart: '2026-10-01' });
  await expect(page.getByRole('table').filter({ hasText: '45%' })).toBeVisible();
});

test('filters narrow the numbers, the program list follows the track, and reset restores', async ({ page }) => {
  const overviewFor = (variables: { filter?: Record<string, unknown> }) => {
    const { sourceKey, status, dateFrom } = variables.filter ?? {};

    if (sourceKey === 'REFERRAL') {
      return buildOverview(people, {
        figures: { totalContacts: 0, activePeople: 0, stuckPeople: 0, inactivePeople: 0 },
        stageTotals: [],
        stuck: { rows: [], total: 0, hasLimits: true },
      });
    }

    if (sourceKey === 'LINKEDIN') {
      return buildOverview(people, { figures: { totalContacts: 256, activePeople: 201 } });
    }

    if (status === 'ACTIVE') {
      return buildOverview(people, { figures: { totalContacts: 337 } });
    }

    if (dateFrom !== undefined && dateFrom !== null) {
      return buildOverview(people, {
        importedExcludedByDate: 700,
        figures: { totalContacts: 104, activePeople: 88 },
      });
    }

    return buildOverview(people);
  };

  const calls = await answerAnalyticsQueries(page, {
    people,
    getCrmAnalyticsOverview: overviewFor,
  });

  await openAnalytics(page, 'Overview');
  await expect(page.getByText('804', { exact: true })).toBeVisible();

  await chooseOption(page, 'All sources', 'Linked network');
  await expect(page.getByText('256', { exact: true })).toBeVisible();
  await expect(page.getByText('804', { exact: true })).toHaveCount(0);
  await expect.poll(() => calls.at(-1)?.variables.filter?.sourceKey).toBe('LINKEDIN');

  await chooseOption(page, 'Linked network', 'Referral network');
  await expect(page.getByText(EMPTY_MESSAGE, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reset filters' }).first().click();
  await expect(page.getByText('804', { exact: true })).toBeVisible();

  await chooseOption(page, 'All statuses', 'Active');
  await expect(page.getByText('337', { exact: true }).first()).toBeVisible();
  await expect.poll(() => calls.at(-1)?.variables.filter?.status).toBe('ACTIVE');
  await page.getByRole('button', { name: 'Reset filters' }).first().click();

  await chooseOption(page, 'All dates', 'Custom dates');
  // A typed date applies once the person is done with it, on Enter or on leaving the field.
  await page.getByLabel('From date').fill('2026-09-01');
  await page.getByLabel('From date').press('Enter');
  await expect.poll(() => calls.at(-1)?.variables.filter?.dateFrom).toBe('2026-09-01');
  await page.getByLabel('To date').fill('2026-09-30');
  await page.getByLabel('To date').press('Enter');
  await expect(page.getByText('104', { exact: true })).toBeVisible();
  await expect(
    page.getByText('700 imported people have no known application date and are not shown.'),
  ).toBeVisible();
  await expect.poll(() => calls.at(-1)?.variables.filter?.dateTo).toBe('2026-09-30');
  await page.getByRole('button', { name: 'Reset filters' }).first().click();

  await chooseOption(page, 'All tracks', 'Business');
  await expect.poll(() => calls.at(-1)?.variables.filter?.trackKey).toBe('BUSINESS');
  await page.getByText('All programs', { exact: true }).click();
  await expect(page.getByText('Finance intern', { exact: true }).last()).toBeVisible();
  await expect(page.getByText('Sensor intern', { exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
});

test('period is off outside Trends and on inside it', async ({ page }) => {
  const calls = await answerAnalyticsQueries(page, { people });

  await openAnalytics(page, 'Funnel');

  await page.getByText('By week', { exact: true }).click({ force: true });
  await expect(page.getByText('By day', { exact: true })).toHaveCount(0);

  await page.getByText('By week', { exact: true }).hover();
  await expect(page.getByText(/only .*Trends/i).first()).toBeVisible();

  await analyticsTab(page, 'Trends').click();
  await chooseOption(page, 'By week', 'By month');
  await expect
    .poll(() =>
      calls.filter((call) => call.field === 'getCrmAnalyticsTrends').at(-1)?.variables.filter?.period,
    )
    .toBe('MONTH');
});

test('a missing field disables its filter and gives Categories a notice', async ({ page }) => {
  await answerAnalyticsQueries(page, {
    people,
    getCrmAnalyticsMeta: () =>
      buildMeta({ fields: { applicantSource: 'MISSING', positionsAppliedFor: 'WRONG_TYPE' } }),
  });
  await openAnalytics(page, 'Categories');

  // An open dropdown lists its "All ..." choice a second time.
  await page.getByText('All sources', { exact: true }).click({ force: true });
  await expect(page.getByText('All sources', { exact: true })).toHaveCount(1);
  await expect(page.getByText('Linked network', { exact: true })).toHaveCount(0);
  await page.getByText('All tracks', { exact: true }).click({ force: true });
  await expect(page.getByText('All tracks', { exact: true })).toHaveCount(1);

  await expect(page.getByText(/tracks and programs cannot be shown/i)).toBeVisible();
});

test('clicking a stuck row opens that person in the side panel', async ({ page }) => {
  await answerAnalyticsQueries(page, { people });
  await openAnalytics(page, 'Overview');

  const personLoad = page.waitForRequest(
    (request) =>
      request.url().includes('/graphql') &&
      (request.postData() ?? '').includes(people[0].personId),
  );

  await tableRow(stuckTable(page), people[0].displayName).click();

  await personLoad;
  await expect(page.getByRole('button', { name: 'Close side panel' })).toBeVisible();
  await expect
    .poll(() => page.getByText(people[0].displayName).count(), {
      message: 'the name appears in the side panel as well as the row',
    })
    .toBeGreaterThanOrEqual(2);
});

test('keyboard: tabs by Enter, stuck rows reached by Tab with a focus ring, expand buttons', async ({ page }) => {
  await answerAnalyticsQueries(page, { people });
  await openAnalytics(page, 'Overview');

  await analyticsTab(page, 'Overview').focus();
  await page.keyboard.press('Tab');
  await expect(analyticsTab(page, 'Funnel')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('columnheader', { name: 'To next', exact: true })).toBeVisible();

  await analyticsTab(page, 'Overview').focus();
  await page.keyboard.press('Enter');
  await expect(stuckTable(page)).toBeVisible();

  let isOnStuckRow = false;

  for (let presses = 0; presses < 60 && !isOnStuckRow; presses += 1) {
    await page.keyboard.press('Tab');
    isOnStuckRow = await page.evaluate(
      (name) =>
        document.activeElement?.tagName === 'TR' &&
        (document.activeElement.textContent ?? '').includes(name),
      people[0].displayName,
    );
  }

  expect(isOnStuckRow, 'Tab never reached the first stuck row').toBe(true);

  const focusStyle = await page.evaluate(() => {
    const style = getComputedStyle(document.activeElement as Element);

    return { outline: style.outlineStyle, shadow: style.boxShadow };
  });

  expect(
    focusStyle.outline !== 'none' || focusStyle.shadow !== 'none',
    'the focused row shows no focus ring',
  ).toBe(true);

  const personLoad = page.waitForRequest((request) =>
    (request.postData() ?? '').includes(people[0].personId),
  );

  await page.keyboard.press('Enter');
  await personLoad;
  await expect(page.getByRole('button', { name: 'Close side panel' })).toBeVisible();
  await page.getByRole('button', { name: 'Close side panel' }).click();

  await analyticsTab(page, 'Categories').focus();
  await page.keyboard.press('Enter');

  const expandBusiness = page.getByRole('button', { name: 'Business', exact: true });

  await expandBusiness.focus();
  await page.keyboard.press('Enter');
  await expect(expandBusiness).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('Finance intern').first()).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(expandBusiness).toHaveAttribute('aria-expanded', 'false');
});

test('unknown values never read as 0% on any tab', async ({ page }) => {
  await answerAnalyticsQueries(page, {
    people,
    getCrmAnalyticsFunnel: () => buildEmptyFunnel(),
    getCrmAnalyticsCategories: (variables) => {
      const categories = buildCategories(variables);

      return {
        ...categories,
        rows: categories.rows.map((row) => ({
          ...row,
          overallEligible: 0,
          overallRate: null,
          overallSoFarRate: null,
          stepRates: row.stepRates.map((stepRate) => ({
            ...stepRate,
            eligible: 0,
            rate: null,
            soFarRate: null,
          })),
        })),
      };
    },
    getCrmAnalyticsTrends: (variables) => ({
      ...buildTrends({ ...variables, metric: 'OVERALL_CONVERSION' }),
      metric: variables.metric,
      series: [
        { bucketStart: '2026-10-12', value: null, previousValue: null, size: null, isPartial: false },
        { bucketStart: '2026-10-19', value: null, previousValue: null, size: null, isPartial: false },
      ],
      cohorts: [
        {
          bucketStart: '2026-10-01',
          size: 12,
          overallRate: null,
          overallSoFarRate: null,
          cells: [
            { stageKey: 'NEW', entered: 12, eligible: 0, rate: null, soFarRate: null, isMature: false },
          ],
        },
      ],
    }),
  });

  await openAnalytics(page, 'Funnel');
  await expect(page.getByText(/Not enough data|Tracking started/).first()).toBeVisible();
  await expectNoZeroPercent(page, 'Funnel');

  await analyticsTab(page, 'Categories').click();
  await expect(page.getByText('Not enough data').first()).toBeVisible();
  await expectNoZeroPercent(page, 'Categories');

  await analyticsTab(page, 'Trends').click();
  await expect(page.getByRole('table').first()).toBeVisible();
  await expectNoZeroPercent(page, 'Trends');
});

test('forbidden shows the permission sentence, no numbers and no toast', async ({ page }) => {
  await answerAnalyticsQueries(page, {
    people,
    ...Object.fromEntries(ALL_FIELDS.map((field) => [field, () => FORBIDDEN_ANSWER])),
  });
  await page.goto('/analytics');

  await expect(page.getByText(ACCESS_MESSAGE)).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(page.getByText('User does not have permission.')).toHaveCount(0);
});

for (const [state, message, fields] of [
  ['DISABLED', DISABLED_MESSAGE, {}],
  ['NO_STAGE_FIELD', NO_STAGE_MESSAGE, { stage: 'MISSING' }],
  ['NEVER_SYNCED', NEVER_SYNCED_MESSAGE, {}],
] as const) {
  test(`state ${state} shows its sentence and hides the numbers`, async ({ page }) => {
    const calls = await answerAnalyticsQueries(page, {
      people,
      getCrmAnalyticsMeta: () =>
        buildMeta({
          state,
          fields,
          sync: {
            lastSuccessfulSyncAt: null,
            lastAttemptAt: null,
            lastAttemptStatus: null,
            lastReconciliationAt: null,
            restoredInLastReconciliation: null,
          },
        }),
    });

    await page.goto('/analytics');

    await expect(page.getByText(message)).toBeVisible();
    await expect(page.getByRole('table')).toHaveCount(0);
    await expect(page.getByText('804', { exact: true })).toHaveCount(0);

    expect(
      calls.filter((call) => call.field !== 'getCrmAnalyticsMeta'),
      'no number query is sent in this state',
    ).toEqual([]);
  });
}

test('stale sync warns and keeps the numbers; not recording and provisional banners show', async ({ page }) => {
  await answerAnalyticsQueries(page, {
    people,
    getCrmAnalyticsMeta: () =>
      buildMeta({
        isProvisional: true,
        showSignedFigure: true,
        fields: { isStageAuditLogged: false },
        sync: {
          isStale: true,
          lastSuccessfulSyncAt: minutesAgo(200),
          lastAttemptAt: minutesAgo(15),
          lastAttemptStatus: 'FAILED',
        },
      }),
    getCrmAnalyticsOverview: () =>
      buildOverview(people, { figures: { signedPeople: 77 } }),
  });
  await openAnalytics(page, 'Overview');

  await expect(page.getByText('804', { exact: true })).toBeVisible();
  await expect(page.getByText('77', { exact: true })).toBeVisible();
  await expect(page.getByText(/out of date|stale|no successful sync/i).first()).toBeVisible();
  await expect(page.getByText(NOT_RECORDING_MESSAGE)).toBeVisible();
  await expect(page.getByText(/provisional/i)).toHaveCount(1);

  const syncLine = page.getByText(/Last successful sync/);

  await expect(syncLine).toBeVisible();

  const [syncLineColor] = await toRgba(page, [
    await syncLine.evaluate((element) => getComputedStyle(element).color),
  ]);

  expect(
    (syncLineColor?.[0] ?? 0) - (syncLineColor?.[2] ?? 0),
    `the sync line is not in a warning color: ${syncLineColor}`,
  ).toBeGreaterThan(40);
});

test('a healthy workspace shows no warning, and the page does not poll', async ({ page }) => {
  const calls = await answerAnalyticsQueries(page, { people });

  await openAnalytics(page, 'Overview');

  await expect(page.getByText('804', { exact: true })).toBeVisible();
  await expect(page.getByText(NOT_RECORDING_MESSAGE)).toHaveCount(0);
  await expect(page.getByText(/provisional/i)).toHaveCount(0);
  await expect(page.getByText(/out of date/i)).toHaveCount(0);

  const callsAfterLoad = calls.length;

  await page.waitForTimeout(5000);

  expect(calls.length, 'the page asked again with nothing changed').toBe(callsAfterLoad);
});

test('a failed view offers retry, other tabs still work, and retry recovers', async ({ page }) => {
  let isFunnelBroken = true;

  await answerAnalyticsQueries(page, {
    people,
    getCrmAnalyticsFunnel: () =>
      isFunnelBroken
        ? SERVER_ERROR_ANSWER
        : buildEmptyFunnel(),
  });
  await openAnalytics(page, 'Funnel');

  const retry = page.getByRole('button', { name: 'Retry' });

  await expect(retry).toBeVisible();
  await expect(
    page.getByText(/Something broke on the server|An error occurred/).first(),
    'a query error raises a toast',
  ).toBeVisible();
  await expect(page.getByText(ACCESS_MESSAGE)).toHaveCount(0);

  await analyticsTab(page, 'Overview').click();
  await expect(page.getByText('804', { exact: true })).toBeVisible();

  await analyticsTab(page, 'Funnel').click();
  await expect(retry).toBeVisible();
  isFunnelBroken = false;
  await retry.click();
  await expect(retry).toHaveCount(0);
  await expect(page.getByText(/Tracking started/).first()).toBeVisible();
});

test('no console errors on any tab beyond what a plain CRM page already logs', async ({ page }) => {
  const errors = collectConsoleErrors(page);

  await page.goto('/objects/people');
  await expect(sidebarPeopleLink(page)).toBeVisible();
  await page.waitForTimeout(3000);

  const baseline = new Set(errors);

  errors.length = 0;

  await answerAnalyticsQueries(page, { people });
  await openAnalytics(page, 'Overview');
  await expect(page.getByText('804', { exact: true })).toBeVisible();

  for (const tab of TAB_NAMES) {
    await analyticsTab(page, tab).click();
    await page.waitForTimeout(1000);
  }

  expect(errors.filter((message) => !baseline.has(message))).toEqual([]);
});

// The first opaque background behind the tables, 0 for black and 1 for white.
const readBackgroundLuminance = async (page: Page) => {
  const backgrounds = await page.evaluate(() => {
    const colors: string[] = [];
    let element: Element | null = document.querySelector('table');

    while (element !== null) {
      colors.push(getComputedStyle(element).backgroundColor);
      element = element.parentElement;
    }

    return colors;
  });
  const opaque = (await toRgba(page, backgrounds)).find(
    (rgba) => rgba !== null && rgba[3] > 0,
  );

  return opaque === undefined || opaque === null
    ? null
    : (0.2126 * opaque[0] + 0.7152 * opaque[1] + 0.0722 * opaque[2]) / 255;
};

test('screenshots of every tab and page state, in light and dark', async ({ page }) => {
  test.setTimeout(240_000);
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  await answerAnalyticsQueries(page, { people });
  await openAnalytics(page, 'Overview');
  await expect(page.getByText('804', { exact: true })).toBeVisible();

  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => readBackgroundLuminance(page)).toBeGreaterThan(0.5);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect
    .poll(() => readBackgroundLuminance(page), { message: 'dark mode did not switch the page' })
    .toBeLessThan(0.5);
  await page.emulateMedia({ colorScheme: 'light' });

  for (const tab of TAB_NAMES) {
    await analyticsTab(page, tab).click();
    await page.waitForTimeout(1500);
    await saveInBothSchemes(page, `tab-${tab.toLowerCase()}`);
  }

  await page.unrouteAll({ behavior: 'ignoreErrors' });

  const states: [string, () => unknown, string][] = [
    ['disabled', () => buildMeta({ state: 'DISABLED' }), DISABLED_MESSAGE],
    ['no-stage-field', () => buildMeta({ state: 'NO_STAGE_FIELD', fields: { stage: 'MISSING' } }), NO_STAGE_MESSAGE],
    ['never-synced', () => buildMeta({ state: 'NEVER_SYNCED' }), NEVER_SYNCED_MESSAGE],
    ['forbidden', () => FORBIDDEN_ANSWER, ACCESS_MESSAGE],
  ];

  for (const [name, getCrmAnalyticsMeta, message] of states) {
    await answerAnalyticsQueries(page, { people, getCrmAnalyticsMeta });
    await page.goto('/analytics');
    await expect(page.getByText(message)).toBeVisible();
    await saveInBothSchemes(page, `state-${name}`);
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  }

  const files = fs.readdirSync(SCREENSHOTS_DIR);

  for (const colorScheme of ['light', 'dark']) {
    for (const name of [...TAB_NAMES.map((tab) => `tab-${tab.toLowerCase()}`), ...states.map(([state]) => `state-${state}`)]) {
      expect(files, `missing ${colorScheme}-${name}.png`).toContain(`${colorScheme}-${name}.png`);
    }
  }
});
