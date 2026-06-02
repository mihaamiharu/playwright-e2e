import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../../src/fixtures';

const { When, Then } = createBdd(test);

When(
  'I archive the seeded issue via the API',
  async ({ projectsAPI, sandbox, seededProjectIssue }) => {
    await projectsAPI.archiveItem(sandbox.projectId, seededProjectIssue.projectItemId);
  },
);

When(
  'I unarchive the seeded issue via the API',
  async ({ projectsAPI, sandbox, seededProjectIssue }) => {
    await projectsAPI.unarchiveItem(sandbox.projectId, seededProjectIssue.projectItemId);
  },
);

Then(
  'the seeded issue should not be visible in any column',
  async ({ page, seededProjectIssue }) => {
    const card = page.getByRole('button', { name: new RegExp(seededProjectIssue.title) });
    await expect(card.first()).not.toBeVisible({ timeout: 15000 });
  },
);

Then('the seeded issue should reappear on the board', async ({ page, seededProjectIssue }) => {
  await expect(async () => {
    const card = page.getByRole('button', { name: new RegExp(seededProjectIssue.title) });
    await expect(card.first()).toBeVisible();
  }).toPass({ timeout: 30_000 });
});
