import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../../src/fixtures';
import { env } from '../../src/config/env.config';
import type { SeededIssue } from '../../src/utils/testing/issue-seeder';
import { seedAdditionalIssue } from '../../src/utils/testing/issue-seeder';
import { uniqueTestTitle } from '../../src/utils/testing/factories';

const { When, Then } = createBdd(test);

When('I assign the issue to myself via the API', async ({ githubAPI, scenarioContext }) => {
  const seededIssue = scenarioContext.get<SeededIssue>('seededIssue');
  await githubAPI.updateIssue(env.github.testRepo, seededIssue.number, {
    assignees: [env.github.username],
  });
});

When('I unassign the issue via the API', async ({ githubAPI, scenarioContext }) => {
  const seededIssue = scenarioContext.get<SeededIssue>('seededIssue');
  await githubAPI.updateIssue(env.github.testRepo, seededIssue.number, {
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
  'I seed a second unassigned issue on the board',
  async ({ githubAPI, projectsAPI, sandbox, dataManager, scenarioContext }) => {
    const title = uniqueTestTitle('unassigned');

    await seedAdditionalIssue(githubAPI, projectsAPI, sandbox, dataManager, {
      title,
      body: `Second unassigned issue for assignee filter test. Run: ${title}`,
    });

    scenarioContext.set('secondUnassignedIssueTitle', title);
  },
);

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

Then(
  'the second unassigned issue should not be visible on the board',
  async ({ boardView, scenarioContext }) => {
    await boardView.expectCardNotVisible(scenarioContext.get<string>('secondUnassignedIssueTitle'));
  },
);
