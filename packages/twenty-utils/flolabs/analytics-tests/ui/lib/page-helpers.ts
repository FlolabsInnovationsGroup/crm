import { expect, type ConsoleMessage, type Locator, type Page } from '@playwright/test';
import path from 'node:path';

import { SEED_PASSWORD } from '../../blackbox/lib/api-client.cjs';
import { isLocalBrowserUrl } from '../../lib/local-only.cjs';

import { SCREENSHOTS_DIR } from './paths';

export const TAB_NAMES = [
  'Overview',
  'Funnel',
  'Categories',
  'Trends',
  'Reports',
] as const;

export type TabName = (typeof TAB_NAMES)[number];

// Same steps as packages/twenty-e2e-testing/tests/login.setup.ts.
export const logInThroughUi = async (page: Page, email: string) => {
  await page.goto('/');

  const emailButton = page.getByRole('button', { name: 'Continue with Email' });
  const emailField = page.getByPlaceholder('Email');

  await expect(emailButton.or(emailField).first()).toBeVisible({ timeout: 180_000 });

  if (await emailButton.isVisible()) {
    await emailButton.click();
  }

  await emailField.fill(email);
  await page.getByRole('button', { name: /^Continue(,|$)/ }).click();
  await page.getByPlaceholder('Password').fill(SEED_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();

  const workspaceChoice = page.getByText('Choose a workspace');

  await expect(
    workspaceChoice.or(sidebarPeopleLink(page)).first(),
  ).toBeVisible({ timeout: 120_000 });

  if (await workspaceChoice.isVisible()) {
    await page.getByText('Apple', { exact: true }).click();
  }

  await expect(sidebarPeopleLink(page)).toBeVisible({ timeout: 120_000 });
};

export const analyticsTab = (page: Page, name: TabName): Locator =>
  page
    .getByRole('link', { name, exact: true })
    .or(page.getByRole('tab', { name, exact: true }));

export const sidebarPeopleLink = (page: Page): Locator =>
  page.getByRole('link', { name: /^People/ }).first();

export const sidebarAnalyticsLink = (page: Page): Locator =>
  page.getByRole('link', { name: /^Analytics/ });

export const openAnalytics = async (page: Page, tab: TabName = 'Overview') => {
  await page.goto('/analytics');
  await expect(analyticsTab(page, tab)).toBeVisible();
  await analyticsTab(page, tab).click();
};

// Last, because an open dropdown sits at the end of the page, after any table button
// with the same name.
export const dropdownOption = (page: Page, name: string): Locator =>
  page
    .getByRole('button', { name, exact: true })
    .or(page.getByRole('option', { name, exact: true }))
    .or(page.getByRole('menuitem', { name, exact: true }))
    .or(page.getByRole('menuitemradio', { name, exact: true }))
    .last();

// A filter is a dropdown showing its current choice, so this opens it by that text.
export const chooseOption = async (
  page: Page,
  currentChoice: string,
  option: string,
) => {
  await page.getByText(currentChoice, { exact: true }).click();
  await dropdownOption(page, option).click();
};

export const tableRow = (table: Locator, text: string | RegExp): Locator =>
  table.getByRole('row').filter({ hasText: text });

// In column order. A row header is not a cell to a screen reader, and the ledger has one.
export const rowCells = (row: Locator): Locator =>
  row.getByRole('cell').or(row.getByRole('rowheader'));

// The value right under a figure's label, so a number elsewhere cannot satisfy a check.
export const figureValue = (page: Page, label: string): Locator =>
  page
    .getByRole('term')
    .filter({ hasText: new RegExp(`^${label}$`) })
    .locator('xpath=following-sibling::dd[1]');

// Playwright's default locale, which the page's number format follows.
export const formatCount = (count: number): string =>
  count.toLocaleString('en-US');

export const saveInBothSchemes = async (page: Page, name: string) => {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    await page.waitForTimeout(300);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, `${colorScheme}-${name}.png`),
    });
  }

  await page.emulateMedia({ colorScheme: 'light' });
};

export const pageText = (page: Page): Promise<string> =>
  page.locator('body').innerText();

// A rate shown as 0% is only legal when it is known, so these views must never hold one.
export const expectNoZeroPercent = async (page: Page, where: string) => {
  expect(await pageText(page), `0% shown on ${where}`).not.toMatch(
    /(^|[^\d.])0(\.0+)?\s?%/m,
  );
};

const isBlockedByLocalOnlyRule = (message: ConsoleMessage) => {
  const { url } = message.location();

  return (
    /ERR_NAME_NOT_RESOLVED/.test(message.text()) &&
    url !== '' &&
    !isLocalBrowserUrl(url)
  );
};

export const collectConsoleErrors = (page: Page): string[] => {
  const errors: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error' && !isBlockedByLocalOnlyRule(message)) {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));

  return errors;
};
