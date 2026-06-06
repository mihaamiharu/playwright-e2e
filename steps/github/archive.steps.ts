import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../../src/fixtures';
import type { SeededIssue } from '../../src/utils/testing/issue-seeder';

const { When, Then } = createBdd(test);

When(
  'I archive the seeded issue via the API',
  async ({ projectsAPI, sandbox, scenarioContext }) => {
    const seededIssue = scenarioContext.get<SeededIssue>('seededIssue');
    await projectsAPI.archiveItem(sandbox.projectId, seededIssue.projectItemId);
  },
);

When(
  'I unarchive the seeded issue via the API',
  async ({ projectsAPI, sandbox, scenarioContext }) => {
    const seededIssue = scenarioContext.get<SeededIssue>('seededIssue');
    await projectsAPI.unarchiveItem(sandbox.projectId, seededIssue.projectItemId);
  },
);

function cardButton(page: import('@playwright/test').Page, title: string) {
  return page.getByRole('button', {
    name: new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  });
}

Then(
  'the seeded issue should not be visible in any column',
  async ({ page, scenarioContext }) => {
    const seededIssue = scenarioContext.get<SeededIssue>('seededIssue');
    await expect(cardButton(page, seededIssue.title).first()).not.toBeVisible({
      timeout: 15000,
    });
  },
);

Then('the seeded issue should reappear on the board', async ({ page, scenarioContext }) => {
  const seededIssue = scenarioContext.get<SeededIssue>('seededIssue');
  await expect(async () => {
    await expect(cardButton(page, seededIssue.title).first()).toBeVisible();
  }).toPass({ timeout: 20_000 });
});
