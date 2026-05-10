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
  // page is built-in — anonymousPage is just a semantic alias
  anonymousPage: async ({ page }, use) => {
    await use(page);
  },

  loginPage: async ({ page }, use) => {
    const loginPage = new LoginPage(page);
    await use(loginPage);
  },
});

export { expect } from '@playwright/test';
