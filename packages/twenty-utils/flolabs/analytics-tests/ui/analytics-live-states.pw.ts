// Contract P5 and P6 on the real page: the off switch and the stale banner, with the state
// really changed on the local CRM, not answered by the test. Put back when each check ends.
import { expect, test } from '@playwright/test';

import { checkLiveStack, openLocalCrm } from '../live/lib/local-crm.cjs';

import {
  TAB_NAMES,
  analyticsTab,
  saveInBothSchemes,
  sidebarAnalyticsLink,
} from './lib/page-helpers';

const STALE_MESSAGE = 'No successful sync in the last hour. Numbers may be out of date.';
const OFF_MESSAGE = 'Analytics is switched off.';
const PAST_THE_STALE_LIMIT_MINUTES = 120;

let crm: Awaited<ReturnType<typeof openLocalCrm>>;
let stackProblem: string | null;

test.beforeAll(async () => {
  stackProblem = await checkLiveStack();

  if (stackProblem === null) {
    crm = await openLocalCrm();
    await crm.runSync();
  }
});

test.afterAll(async () => {
  await crm?.cleanUp();
  await crm?.close();
});

test('P5 off switch: the page says off and shows no number, and off again brings it all back', async ({ page }) => {
  test.skip(stackProblem !== null, stackProblem ?? '');

  await crm.setOffSwitch(true);

  try {
    await page.goto('/analytics');

    await expect(page.getByText(OFF_MESSAGE)).toBeVisible();
    await expect(page.getByRole('table')).toHaveCount(0);
    await expect(page.getByText(/Last successful sync/)).toHaveCount(0);
    // The sidebar item stays, as THINGS-TO-DO-BEFORE-MERGE.md section 6 says.
    await expect(sidebarAnalyticsLink(page)).toBeVisible();
    await saveInBothSchemes(page, 'real-state-off');
  } finally {
    await crm.setOffSwitch(false);
  }

  await page.reload();

  await expect(page.getByText(OFF_MESSAGE)).toHaveCount(0);

  for (const tab of TAB_NAMES) {
    await expect(analyticsTab(page, tab)).toBeVisible();
  }
});

test('P6 no sync for over an hour: the banner shows and the numbers stay', async ({ page }) => {
  test.skip(stackProblem !== null, stackProblem ?? '');

  await page.goto('/analytics');
  await expect(analyticsTab(page, 'Overview')).toBeVisible();
  await expect(page.getByText(STALE_MESSAGE)).toHaveCount(0);

  const { figures } = await crm.analytics('overview');
  const undoAging = await crm.ageSyncLog(PAST_THE_STALE_LIMIT_MINUTES);

  try {
    await page.reload();

    await expect(page.getByText(STALE_MESSAGE)).toBeVisible();
    await expect(page.getByText(/Last successful sync/)).toBeVisible();
    await expect(
      page
        .getByRole('term')
        .filter({ hasText: /^Total contacts$/ })
        .locator('xpath=following-sibling::dd[1]'),
    ).toHaveText(figures.totalContacts.toLocaleString('en-US'));
    await saveInBothSchemes(page, 'real-state-stale');
  } finally {
    await undoAging();
  }

  await page.reload();

  await expect(analyticsTab(page, 'Overview')).toBeVisible();
  await expect(page.getByText(STALE_MESSAGE)).toHaveCount(0);
});
