import { test as base } from 'playwright-bdd';
import type { Page } from '@playwright/test';
import { LoginPage } from '../pages/github/LoginPage';

/**
 * GitHub-specific test fixtures.
 *
 * Fixtures are Playwright's replacement for BaseTest classes.
 * They handle setup/teardown automatically — no beforeEach/afterEach needed.
 */

export type GitHubFixtures = {
  /** Fresh browser page — no auth, no cookies */
  anonymousPage: Page;

  /** GitHub Login page object */
  loginPage: LoginPage;
};

export const test = base.extend<GitHubFixtures>({
  anonymousPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await use(page);
    await context.close();
  },

  loginPage: async ({ anonymousPage }, use) => {
    const loginPage = new LoginPage(anonymousPage);
    await use(loginPage);
  },
});

export { expect } from '@playwright/test';
