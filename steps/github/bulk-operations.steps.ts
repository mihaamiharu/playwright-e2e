import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../../src/fixtures';
import { env } from '../../src/config/env.config';
import { buildIssueParams } from '../../src/utils/testing/factories';

const { Given, When, Then } = createBdd(test);

Given(
  'a second seeded project issue exists on the kanban board',
  async ({ githubAPI, projectsAPI, sandbox, dataManager, scenarioContext, scenarioId }) => {
    const params = buildIssueParams({ body: 'Bulk test issue' });
    params.title = `${params.title} [${scenarioId}]`;
    const issue = await githubAPI.createIssue(env.github.testRepo, params);
    dataManager.enqueue(`close issue #${issue.number}`, async () => {
      await githubAPI.closeIssue(env.github.testRepo, issue.number);
    });
    const projectItemId = await projectsAPI.addIssueToProject(sandbox.projectId, issue.node_id);

    scenarioContext.set('secondIssueProjectItemId', projectItemId);

    dataManager.enqueue(`remove issue #${issue.number} from project`, async () => {
      await projectsAPI.removeItemFromProject(sandbox.projectId, projectItemId);
    });
  },
);

When(
  'I bulk move both seeded issues to {string} via the API',
  async ({ sandbox, seededProjectIssue, projectsAPI, scenarioContext }, statusName) => {
    const optionId = sandbox.statusOptions.get(statusName);
    if (!optionId) {
      throw new Error(
        `Status "${statusName}" not found. Available: ${[...sandbox.statusOptions.keys()].join(', ')}`,
      );
    }

    await projectsAPI.moveItemToStatus(
      sandbox.projectId,
      seededProjectIssue.projectItemId,
      sandbox.statusFieldId,
      optionId,
    );
    await projectsAPI.moveItemToStatus(
      sandbox.projectId,
      scenarioContext.get<string>('secondIssueProjectItemId'),
      sandbox.statusFieldId,
      optionId,
    );
  },
);

Then(
  'both seeded issues should appear in the {string} column',
  async ({ page, projectsAPI, sandbox, seededProjectIssue, scenarioContext }, columnName) => {
    await expect(page.getByRole('heading', { name: columnName, level: 2 })).toBeVisible();

    await expect(async () => {
      const secondId = scenarioContext.get<string>('secondIssueProjectItemId');
      const items = await projectsAPI.getItems(sandbox.projectId);
      const item1 = items.find((i) => i.id === seededProjectIssue.projectItemId);
      const item2 = items.find((i) => i.id === secondId);
      expect(item1?.status).toBe(columnName);
      expect(item2?.status).toBe(columnName);
    }).toPass({ timeout: 10_000 });
  },
);
