// The whole path against the running local CRM, nothing answered by the test. Numbers on
// the page are compared with what the API returns for the same user.
import { expect, test } from '@playwright/test';

import {
  ADMIN_EMAIL,
  callAnalytics,
  getFrontUrl,
  login,
  withLimitedRole,
} from '../blackbox/lib/api-client.cjs';

import {
  TAB_NAMES,
  analyticsTab,
  chooseOption,
  collectConsoleErrors,
  figureValue,
  formatCount,
  logInThroughUi,
  openAnalytics,
  rowCells,
  saveInBothSchemes,
  sidebarAnalyticsLink,
  sidebarPeopleLink,
  tableRow,
} from './lib/page-helpers';

const LIMITED_USER = 'phil.schiler@apple.dev';

const EMPTY_MESSAGE = 'No people match these filters';

const STATE_MESSAGES: Record<string, string> = {
  DISABLED: 'Analytics is switched off.',
  NO_STAGE_FIELD:
    'This workspace has no Stage field on People, so there is nothing to measure yet.',
  NEVER_SYNCED: 'The first sync has not finished.',
};

let adminToken: string;

test.beforeAll(async () => {
  adminToken = await login(ADMIN_EMAIL);
});

const readPayload = async (queryName: string, variables = {}) => {
  const { errors, payload } = await callAnalytics(queryName, variables, adminToken);

  expect(errors).toEqual([]);

  return payload;
};

test('the sidebar link opens /analytics with its title, tabs and sync line', async ({ page }) => {
  await page.goto('/');
  await sidebarAnalyticsLink(page).click();

  await expect(page).toHaveURL(/\/analytics/);
  await expect(page).toHaveTitle(/Analytics/);

  const meta = await readPayload('meta');

  if (meta.state in STATE_MESSAGES) {
    await expect(page.getByText(STATE_MESSAGES[meta.state])).toBeVisible();

    return;
  }

  for (const tab of TAB_NAMES) {
    await expect(analyticsTab(page, tab)).toBeVisible();
  }

  await expect(page.getByText(/Last successful sync/)).toBeVisible();
});

test('analytics queries go to the core endpoint', async ({ page }) => {
  const analyticsRequests: string[] = [];

  page.on('request', (request) => {
    if (/getCrmAnalytics/.test(request.postData() ?? '')) {
      analyticsRequests.push(new URL(request.url()).pathname);
    }
  });

  await page.goto('/analytics');
  await expect.poll(() => analyticsRequests.length).toBeGreaterThan(0);

  expect([...new Set(analyticsRequests)]).toEqual(['/graphql']);
});

test('every tab renders the real server state with no console error of its own', async ({ page }) => {
  const errors = collectConsoleErrors(page);

  await page.goto('/objects/people');
  await expect(sidebarPeopleLink(page)).toBeVisible();
  await page.waitForTimeout(3000);

  const baseline = new Set(errors);

  errors.length = 0;

  const meta = await readPayload('meta');

  await page.goto('/analytics');

  if (meta.state in STATE_MESSAGES) {
    await expect(page.getByText(STATE_MESSAGES[meta.state])).toBeVisible();
    await expect(page.getByRole('table')).toHaveCount(0);
  } else {
    for (const tab of TAB_NAMES) {
      await analyticsTab(page, tab).click();
      await expect(page.getByText('This view could not load')).toHaveCount(0);
      await page.waitForTimeout(1000);
    }
  }

  expect(errors.filter((message) => !baseline.has(message))).toEqual([]);
});

test('page numbers equal the API numbers for the same user', async ({ page }) => {
  const meta = await readPayload('meta');

  test.skip(meta.state !== 'READY', `the workspace state is ${meta.state}, not READY`);

  const overview = await readPayload('overview');

  test.skip(overview.figures.totalContacts === 0, 'no people in the local CRM');

  await openAnalytics(page, 'Overview');

  const { activePeople, newApplications, stuckPeople, totalContacts } = overview.figures;

  await expect(figureValue(page, 'Active people')).toHaveText(formatCount(activePeople));
  await expect(figureValue(page, 'Total contacts')).toHaveText(formatCount(totalContacts));

  if (newApplications !== null) {
    await expect(figureValue(page, 'New applications')).toHaveText(formatCount(newApplications));
  }

  if (overview.stuck.hasLimits) {
    await expect(figureValue(page, 'Past stage limit')).toHaveText(formatCount(stuckPeople));
  }

  const totals = page.getByRole('table', { name: 'People by current stage' });

  for (const row of overview.stageTotals.filter((candidate: { rowKind: string }) =>
    ['MAIN', 'EXIT', 'OTHER'].includes(candidate.rowKind),
  )) {
    // First, because a nested row's label can start with its parent's.
    await expect(
      rowCells(tableRow(totals, new RegExp(`^\\s*${row.label}`)).first()).nth(1),
    ).toHaveText(formatCount(row.count));
  }

  const funnel = await readPayload('funnel');

  await analyticsTab(page, 'Funnel').click();

  if (funnel.cohortSize === 0) {
    await expect(page.getByText(/Tracking started/).first()).toBeVisible();

    return;
  }

  const ledger = page.getByRole('table', { name: 'Conversion by stage' });

  for (const [index, row] of funnel.rows.entries()) {
    const cells = rowCells(tableRow(ledger, new RegExp(`^\\s*${row.label}`)).first());

    await expect(cells.nth(1)).toHaveText(formatCount(row.entered));

    // The final stage has no step, so its step columns stay empty.
    if (index === funnel.rows.length - 1) {
      continue;
    }

    await expect(cells.nth(3)).toHaveText(formatCount(row.timedOut));
    await expect(cells.nth(4)).toHaveText(formatCount(row.exited));
    await expect(cells.nth(5)).toHaveText(formatCount(row.inWindow));

    if (row.stepRate === null) {
      await expect(cells.nth(2), `${row.label} has no known rate`).not.toHaveText(
        /(^|\D)0\s?%(?! so far)/,
      );
    } else {
      await expect(cells.nth(2)).toContainText(`${Math.round(row.stepRate * 100)}%`);
    }
  }
});

test('a real stuck row opens that person in the side panel', async ({ page }) => {
  const meta = await readPayload('meta');

  test.skip(meta.state !== 'READY', `the workspace state is ${meta.state}, not READY`);

  const overview = await readPayload('overview');
  const [firstRow] = overview.stuck.rows;

  test.skip(firstRow === undefined, 'nobody is past a stage limit in the local CRM');

  await openAnalytics(page, 'Overview');

  const personLoad = page.waitForRequest(
    (request) =>
      request.url().includes('/graphql') &&
      (request.postData() ?? '').includes(firstRow.personId),
  );

  await tableRow(
    page.getByRole('table', { name: 'People to follow up' }),
    firstRow.displayName,
  )
    .first()
    .click();

  await personLoad;
  await expect(page.getByRole('button', { name: 'Close side panel' })).toBeVisible();
});

test('a real date range with nobody in it shows the empty state, and reset brings the numbers back', async ({ page }) => {
  const meta = await readPayload('meta');

  test.skip(meta.state !== 'READY', `the workspace state is ${meta.state}, not READY`);

  const overview = await readPayload('overview');

  test.skip(overview.figures.totalContacts === 0, 'no people in the local CRM');

  await openAnalytics(page, 'Overview');
  await chooseOption(page, 'All dates', 'Custom dates');

  // To date first: a From date after the current To date is not accepted.
  await page.getByLabel('To date').fill('2099-01-31');
  await page.getByLabel('To date').press('Enter');
  await page.getByLabel('From date').fill('2099-01-01');
  await page.getByLabel('From date').press('Enter');

  await expect(page.getByText(EMPTY_MESSAGE, { exact: true })).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);

  await analyticsTab(page, 'Funnel').click();
  await expect(page.getByText(EMPTY_MESSAGE, { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Reset filters' }).first().click();
  await expect(page.getByText(EMPTY_MESSAGE, { exact: true })).toHaveCount(0);

  await analyticsTab(page, 'Overview').click();
  await expect(figureValue(page, 'Total contacts')).toHaveText(
    formatCount(overview.figures.totalContacts),
  );
});

test('screenshots of the real page on every tab, in light and dark', async ({ page }) => {
  test.setTimeout(240_000);

  const meta = await readPayload('meta');

  test.skip(meta.state !== 'READY', `the workspace state is ${meta.state}, not READY`);

  // Tall, so the tables under the first screen are in the picture too.
  await page.setViewportSize({ width: 1280, height: 1500 });
  await openAnalytics(page, 'Overview');

  for (const tab of TAB_NAMES) {
    await analyticsTab(page, tab).click();
    await expect(page.getByText('This view could not load')).toHaveCount(0);
    await page.waitForTimeout(1500);
    await saveInBothSchemes(page, `real-tab-${tab.toLowerCase()}`);
  }
});

test('a real source filter narrows the page to the API count for that source', async ({ page }) => {
  const meta = await readPayload('meta');

  test.skip(meta.state !== 'READY', `the workspace state is ${meta.state}, not READY`);

  const categories = await readPayload('categories', { groupBy: 'SOURCE' });
  const everyone = await readPayload('overview');
  const narrower = categories.rows.find(
    (row: { key: string; isUnmapped: boolean; people: number }) =>
      row.key !== 'NONE' &&
      !row.isUnmapped &&
      row.people > 0 &&
      row.people < everyone.figures.totalContacts,
  );

  test.skip(narrower === undefined, 'no source in the local CRM holds part of the people');

  const optionLabel = meta.sources.find(
    (source: { key: string }) => source.key === narrower.key,
  )?.label;

  await openAnalytics(page, 'Overview');
  await expect(figureValue(page, 'Total contacts')).toHaveText(
    formatCount(everyone.figures.totalContacts),
  );

  await chooseOption(page, 'All sources', optionLabel ?? narrower.label);

  await expect(figureValue(page, 'Total contacts')).toHaveText(formatCount(narrower.people));
});

test('a role without EXPORT_CSV has no sidebar item, and the direct URL shows the sentence', async ({ browser }) => {
  // A whole new login, on a dev front that may recompile.
  test.setTimeout(240_000);

  const outcome = await withLimitedRole(adminToken, LIMITED_USER, async () => {
    // Empty on purpose: a new context otherwise inherits the admin's stored session.
    const context = await browser.newContext({
      baseURL: getFrontUrl(),
      viewport: { width: 1280, height: 800 },
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();

    try {
      await logInThroughUi(page, LIMITED_USER);

      await expect(sidebarAnalyticsLink(page)).toHaveCount(0);

      await page.goto('/analytics');

      await expect(
        page.getByText('You do not have access to analytics. Ask an admin.'),
      ).toBeVisible();
      await expect(page.getByRole('table')).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test.skip(outcome.problem !== undefined, outcome.problem);
});
