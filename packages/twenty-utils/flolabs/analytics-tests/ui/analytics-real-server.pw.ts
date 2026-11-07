// The whole path against the running local CRM, nothing answered by the test. Numbers on
// the page are compared with what the API returns for the same user.
import { expect, test } from '@playwright/test';

import {
  ADMIN_EMAIL,
  callAnalytics,
  getFrontUrl,
  getPermissionFlags,
  login,
} from '../blackbox/lib/api-client.cjs';

import {
  TAB_NAMES,
  analyticsTab,
  chooseOption,
  collectConsoleErrors,
  logInThroughUi,
  openAnalytics,
  sidebarAnalyticsLink,
  sidebarPeopleLink,
  tableRow,
} from './lib/page-helpers';

const LIMITED_USER_CANDIDATES = [
  'phil.schiler@apple.dev',
  'scott.forstall@apple.dev',
];

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

  await openAnalytics(page, 'Overview');

  const { activePeople, totalContacts } = overview.figures;

  await expect(page.getByText(String(activePeople), { exact: true }).first()).toBeVisible();
  await expect(page.getByText(String(totalContacts), { exact: true }).first()).toBeVisible();

  const totals = page
    .getByRole('table')
    .filter({ has: page.getByRole('columnheader', { name: /past limit/i }) });

  for (const row of overview.stageTotals.filter(
    (candidate: { rowKind: string }) => candidate.rowKind === 'MAIN',
  )) {
    // First, because a nested row's label can start with its parent's.
    await expect(tableRow(totals, new RegExp(`^\\s*${row.label}`)).first()).toContainText(String(row.count));
  }

  const funnel = await readPayload('funnel');

  await analyticsTab(page, 'Funnel').click();

  if (funnel.cohortSize > 0) {
    const ledger = page
      .getByRole('table')
      .filter({ has: page.getByRole('columnheader', { name: 'To next', exact: true }) });

    await expect(tableRow(ledger, new RegExp(`^\\s*${funnel.rows[0].label}`))).toContainText(
      String(funnel.rows[0].entered),
    );
  } else {
    await expect(page.getByText(/Tracking started/).first()).toBeVisible();
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
  await chooseOption(page, 'All sources', optionLabel ?? narrower.label);

  await expect(page.getByText(String(narrower.people), { exact: true }).first()).toBeVisible();
});

test('a role without EXPORT_CSV has no sidebar item, and the direct URL shows the sentence', async ({ browser }) => {
  // A whole new login, on a dev front that may recompile.
  test.setTimeout(240_000);

  let limitedEmail: string | undefined;

  for (const email of LIMITED_USER_CANDIDATES) {
    const flags = await login(email).then(getPermissionFlags).catch(() => ['EXPORT_CSV']);

    if (!flags.includes('EXPORT_CSV')) {
      limitedEmail = email;

      break;
    }
  }

  test.skip(
    limitedEmail === undefined,
    `No seed user without EXPORT_CSV among ${LIMITED_USER_CANDIDATES.join(', ')}. Use the full dev seed, not --light.`,
  );

  // Empty on purpose: a new context otherwise inherits the admin's stored session.
  const context = await browser.newContext({
    baseURL: getFrontUrl(),
    viewport: { width: 1280, height: 800 },
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();

  try {
    await logInThroughUi(page, limitedEmail as string);

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
