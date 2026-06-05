import { Page } from '@playwright/test';

export async function waitForGitHubNavigation(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await page
    .locator('.turbo-progress-bar, .progress-pjax-loader')
    .waitFor({ state: 'hidden', timeout: 10_000 })
    .catch(() => {});
}
