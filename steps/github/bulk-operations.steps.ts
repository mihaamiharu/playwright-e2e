import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../../src/fixtures';
import type { SeededIssue } from '../../src/utils/testing/issue-seeder';
import { seedAdditionalIssue } from '../../src/utils/testing/issue-seeder';

const { Given, When, Then } = createBdd(test);

Given(
  'a second seeded project issue exists on the kanban board',
  async ({ githubAPI, projectsAPI, sandbox, dataManager, scenarioContext, scenarioId }) => {
    const issue = await seedAdditionalIssue(githubAPI, projectsAPI, sandbox, dataManager, {
      body: 'Bulk test issue',
      scenarioId,
    });

    scenarioContext.set('secondIssueProjectItemId', issue.projectItemId);
  },
);

When(
  'I bulk move both seeded issues to {string} via the API',
  async ({ sandbox, scenarioContext, projectsAPI }, statusName) => {
    const seededIssue = scenarioContext.get<SeededIssue>('seededIssue');
    const optionId = sandbox.statusOptions.get(statusName);
    if (!optionId) {
      throw new Error(
        `Status "${statusName}" not found. Available: ${[...sandbox.statusOptions.keys()].join(', ')}`,
      );
    }

    await projectsAPI.moveItemToStatus(
      sandbox.projectId,
      seededIssue.projectItemId,
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
  async ({ page, projectsAPI, sandbox, scenarioContext }, columnName) => {
    const seededIssue = scenarioContext.get<SeededIssue>('seededIssue');
    await expect(page.getByRole('heading', { name: columnName, level: 2 })).toBeVisible();

    await expect(async () => {
      const secondId = scenarioContext.get<string>('secondIssueProjectItemId');
      const items = await projectsAPI.getItems(sandbox.projectId);
      const item1 = items.find((i) => i.id === seededIssue.projectItemId);
      const item2 = items.find((i) => i.id === secondId);
      expect(item1?.status).toBe(columnName);
      expect(item2?.status).toBe(columnName);
    }).toPass({ timeout: 10_000 });
  },
);
