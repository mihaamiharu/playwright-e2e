import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../../src/fixtures';
import { env } from '../../src/config/env.config';
import { createTestIssueTitle, createTestIssue } from '../../src/utils/testing/factories';

const { When, Then } = createBdd(test);

When('I assign the issue to myself via the API', async ({ githubAPI, seededProjectIssue }) => {
  await githubAPI.updateIssue(env.github.testRepo, seededProjectIssue.number, {
    assignees: [env.github.username],
  });
});

When('I unassign the issue via the API', async ({ githubAPI, seededProjectIssue }) => {
  await githubAPI.updateIssue(env.github.testRepo, seededProjectIssue.number, {
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
    const title = createTestIssueTitle('unassigned');

    const issue = await githubAPI.createIssue(
      env.github.testRepo,
      createTestIssue({
        title,
        body: `Second unassigned issue for assignee filter test. Run: ${title}`,
      }),
    );

    dataManager.enqueue(`close issue #${issue.number}`, async () => {
      await githubAPI.closeIssue(env.github.testRepo, issue.number);
    });

    const projectItemId = await projectsAPI.addIssueToProject(sandbox.projectId, issue.node_id);
    dataManager.enqueue(`remove issue #${issue.number} from project`, async () => {
      await projectsAPI.removeItemFromProject(sandbox.projectId, projectItemId);
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
