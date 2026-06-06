import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../../src/fixtures';
import type { SeededIssue } from '../../src/utils/testing/issue-seeder';

const { When, Then } = createBdd(test);

function cardButton(page: import('@playwright/test').Page, title: string) {
  return page.getByRole('button', {
    name: new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  });
}

When(
  'I archive issue {string} via the API',
  async ({ projectsAPI, sandbox, scenarioContext }, key: string) => {
    const issue = scenarioContext.get<SeededIssue>(key);
    await projectsAPI.archiveItem(sandbox.projectId, issue.projectItemId);
  },
);

When(
  'I unarchive issue {string} via the API',
  async ({ projectsAPI, sandbox, scenarioContext }, key: string) => {
    const issue = scenarioContext.get<SeededIssue>(key);
    await projectsAPI.unarchiveItem(sandbox.projectId, issue.projectItemId);
  },
);

Then(
  'issue {string} should not be visible in any column',
  async ({ page, scenarioContext }, key: string) => {
    const issue = scenarioContext.get<SeededIssue>(key);
    await expect(cardButton(page, issue.title).first()).not.toBeVisible({
      timeout: 15000,
    });
  },
);

Then(
  'issue {string} should reappear on the board',
  async ({ page, scenarioContext }, key: string) => {
    const issue = scenarioContext.get<SeededIssue>(key);
    await expect(async () => {
      await expect(cardButton(page, issue.title).first()).toBeVisible();
    }).toPass({ timeout: 20_000 });
  },
);
