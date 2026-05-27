import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../../src/fixtures';

const { Then } = createBdd(test);

Then('the board kanban columns should match the baseline', async ({ page }) => {
  const boardArea = page.locator('[data-board-column]').first().locator('..');
  await boardArea.first().waitFor({ state: 'visible', timeout: 15000 });
  await expect(boardArea).toHaveScreenshot('board-kanban-columns.png', {
    maxDiffPixelRatio: 0.05,
  });
});

Then('the issue body area should match the baseline', async ({ page }) => {
  const bodyArea = page.getByTestId('issue-body-viewer');
  await expect(bodyArea).toBeVisible({ timeout: 15000 });
  await expect(bodyArea).toHaveScreenshot('issue-body-area.png', {
    maxDiffPixelRatio: 0.05,
  });
});

Then('the table view grid should match the baseline', async ({ page }) => {
  const grid = page.getByRole('grid');
  await expect(grid).toBeVisible({ timeout: 15000 });
  await expect(grid).toHaveScreenshot('table-view-grid.png', {
    maxDiffPixelRatio: 0.05,
  });
});
