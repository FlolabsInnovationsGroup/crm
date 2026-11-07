// Contract P12, the page half: the pages the team uses every day still load with the analytics
// module in the same app. boot/boot-checks.test.mjs is the server and worker half.
import { expect, test, type Page } from '@playwright/test';

import { ADMIN_EMAIL, login, postGraphql } from '../blackbox/lib/api-client.cjs';

import {
  collectConsoleErrors,
  sidebarAnalyticsLink,
  sidebarPeopleLink,
} from './lib/page-helpers';

const ERROR_PAGE = /Sorry, something went wrong|Unknown error|Page not found/;
const ANALYTICS_ERROR = /crm.?analytics/i;

const expectLoadedWithoutError = async (page: Page, title: RegExp) => {
  await expect(page).toHaveTitle(title, { timeout: 60_000 });
  await expect(page.getByText(ERROR_PAGE)).toHaveCount(0);
};

const readFirstPerson = async () => {
  const token = await login(ADMIN_EMAIL);
  const { body } = await postGraphql({
    path: '/graphql',
    token,
    query:
      'query { people(first: 1, orderBy: [{ createdAt: AscNullsLast }]) { edges { node { id name { firstName lastName } } } } }',
  });

  return body?.data?.people?.edges?.[0]?.node;
};

test('People, a person, Team inbox, Notifications and Form builder all still load', async ({ page }) => {
  test.setTimeout(240_000);

  const errors = collectConsoleErrors(page);

  await page.goto('/objects/people');
  await expectLoadedWithoutError(page, /People/);
  await expect(sidebarPeopleLink(page)).toBeVisible();

  const person = await readFirstPerson();

  test.skip(person === undefined, 'the local CRM has no people to open');

  const personName = `${person.name.firstName} ${person.name.lastName}`.trim();

  await expect(page.getByText(personName).first()).toBeVisible({ timeout: 60_000 });

  await page.goto(`/object/person/${person.id}`);
  await expect(page.getByText(personName).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(ERROR_PAGE)).toHaveCount(0);

  await page.goto('/team-inbox');
  await expectLoadedWithoutError(page, /Team inbox/);

  await page.goto('/notifications');
  await expectLoadedWithoutError(page, /Notifications/);

  await page.goto('/form-builder');
  await expect(page.getByText(ERROR_PAGE)).toHaveCount(0);
  await expect(page).toHaveURL(/\/form-builder/);

  expect(
    errors.filter((message) => ANALYTICS_ERROR.test(message)),
    'an analytics error on a page that is not analytics',
  ).toEqual([]);
});

test('the sidebar keeps its CRM items, with Analytics beside them', async ({ page }) => {
  await page.goto('/objects/people');

  await expect(sidebarPeopleLink(page)).toBeVisible();

  // Notifications is a button that opens a panel, the others are links.
  for (const name of [/^Notifications/, /^Team inbox/, /^Form builder/]) {
    await expect(
      page.getByRole('link', { name }).or(page.getByRole('button', { name })).first(),
    ).toBeVisible();
  }

  await expect(sidebarAnalyticsLink(page)).toBeVisible();
});
