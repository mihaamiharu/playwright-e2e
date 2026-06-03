import { Page } from '@playwright/test';

export async function waitForGitHubNavigation(page: Page) {
  // GitHub uses Turbo for SPA navigation
  await page.waitForLoadState('networkidle');
  // Wait for GitHub's progress bar to disappear
  await page
    .locator('[data-turbo-progress]')
    .waitFor({ state: 'hidden', timeout: 10_000 })
    .catch(() => {});
}
