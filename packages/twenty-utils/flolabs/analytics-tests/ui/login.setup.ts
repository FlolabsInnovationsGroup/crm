import { expect, test } from '@playwright/test';

import { ADMIN_EMAIL } from '../blackbox/lib/api-client.cjs';

import { logInThroughUi, sidebarPeopleLink } from './lib/page-helpers';
import { ADMIN_SESSION_PATH } from './lib/paths';

test('log in as the seed user through the login page', async ({ page }) => {
  // The first load of a dev front compiles the whole app.
  test.setTimeout(240_000);

  await logInThroughUi(page, ADMIN_EMAIL);

  await expect(sidebarPeopleLink(page)).toBeVisible();

  await page.context().storageState({ path: ADMIN_SESSION_PATH });
});
