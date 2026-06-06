import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../../src/fixtures';
import type { SeededIssue } from '../../src/utils/testing/issue-seeder';

const { When, Then } = createBdd(test);

When(
  'I bulk move issues {string} and {string} to {string} via the API',
  async ({ sandbox, scenarioContext, projectsAPI }, key1, key2, statusName) => {
    const issue1 = scenarioContext.get<SeededIssue>(key1);
    const issue2 = scenarioContext.get<SeededIssue>(key2);
    const optionId = sandbox.statusOptions.get(statusName);
    if (!optionId) {
      throw new Error(
        `Status "${statusName}" not found. Available: ${[...sandbox.statusOptions.keys()].join(', ')}`,
      );
    }

    await projectsAPI.moveItemToStatus(
      sandbox.projectId,
      issue1.projectItemId,
      sandbox.statusFieldId,
      optionId,
    );
    await projectsAPI.moveItemToStatus(
      sandbox.projectId,
      issue2.projectItemId,
      sandbox.statusFieldId,
      optionId,
    );
  },
);

Then(
  'issues {string} and {string} should appear in the {string} column',
  async ({ page, projectsAPI, sandbox, scenarioContext }, key1, key2, columnName) => {
    const issue1 = scenarioContext.get<SeededIssue>(key1);
    const issue2 = scenarioContext.get<SeededIssue>(key2);
    await expect(page.getByRole('heading', { name: columnName, level: 2 })).toBeVisible();

    await expect(async () => {
      const items = await projectsAPI.getItems(sandbox.projectId);
      const item1 = items.find((i) => i.id === issue1.projectItemId);
      const item2 = items.find((i) => i.id === issue2.projectItemId);
      expect(item1?.status).toBe(columnName);
      expect(item2?.status).toBe(columnName);
    }).toPass({ timeout: 10_000 });
  },
);
