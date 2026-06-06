import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../../src/fixtures';
import { env } from '../../src/config/env.config';
import type { SeededIssue } from '../../src/utils/testing/issue-seeder';

const { When, Then } = createBdd(test);

When(
  'I assign issue {string} to myself via the API',
  async ({ githubAPI, scenarioContext }, key) => {
    const issue = scenarioContext.get<SeededIssue>(key);
    await githubAPI.updateIssue(env.github.testRepo, issue.number, {
      assignees: [env.github.username],
    });
  },
);

When('I unassign issue {string} via the API', async ({ githubAPI, scenarioContext }, key) => {
  const issue = scenarioContext.get<SeededIssue>(key);
  await githubAPI.updateIssue(env.github.testRepo, issue.number, {
    assignees: [],
  });
});

Then('I should see myself as the assignee on the issue', async ({ assigneePanel }) => {
  await assigneePanel.expectAssignee(env.github.username);
});

Then('I should see no assignee on the issue', async ({ assigneePanel }) => {
  await assigneePanel.expectNoAssignee(env.github.username);
});

When(
  'I filter the board by assignee {string}',
  async ({ page, projectFilterBar }, assigneeFilter: string) => {
    await projectFilterBar.open();
    await projectFilterBar.selectType('Assignee');
    await projectFilterBar.selectOption(assigneeFilter);

    await page.waitForURL(/filterQuery=assignee/);
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
  },
);
