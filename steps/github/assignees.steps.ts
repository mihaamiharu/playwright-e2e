import { createBdd } from 'playwright-bdd';
import { test } from '../../src/fixtures';
import { env } from '../../src/config/env.config';

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
    const uniqueId = `unassigned-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const title = `e2e-${uniqueId}`;

    const issue = await githubAPI.createIssue(env.github.testRepo, {
      title,
      body: `Second unassigned issue for assignee filter test. Run: ${uniqueId}`,
    });

    const projectItemId = await projectsAPI.addIssueToProject(sandbox.projectId, issue.node_id);

    dataManager.enqueue(async () => {
      await projectsAPI.removeItemFromProject(sandbox.projectId, projectItemId);
    });
    dataManager.enqueue(async () => {
      await githubAPI.closeIssue(env.github.testRepo, issue.number);
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
    await page
      .getByRole('heading', { level: 2 })
      .first()
      .waitFor({ state: 'visible', timeout: 15000 });
  },
);

Then(
  'the second unassigned issue should not be visible on the board',
  async ({ boardView, scenarioContext }) => {
    await boardView.expectCardNotVisible(
      scenarioContext.get<string>('secondUnassignedIssueTitle'),
    );
  },
);
