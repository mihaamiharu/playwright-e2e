import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../../src/fixtures';
import type { SeededIssue } from '../../src/utils/testing/issue-seeder';

const { When, Then } = createBdd(test);

When(
  'I move the issue to {string} via the project API',
  async ({ sandbox, scenarioContext, projectsAPI, page }, statusName: string) => {
    const seededIssue = scenarioContext.get<SeededIssue>('seededIssue');
    const optionId = sandbox.statusOptions.get(statusName);
    if (!optionId) {
      const available = [...sandbox.statusOptions.keys()].join(', ');
      throw new Error(`Status "${statusName}" not found. Available: ${available}`);
    }
    await projectsAPI.moveItemToStatus(
      sandbox.projectId,
      seededIssue.projectItemId,
      sandbox.statusFieldId,
      optionId,
    );

    await expect(async () => {
      const items = await projectsAPI.getItems(sandbox.projectId);
      const item = items.find((i) => i.id === seededIssue.projectItemId);
      expect(item?.status).toBe(statusName);
    }).toPass({ timeout: 20_000 });

    await page.waitForTimeout(1000);
  },
);

When('I navigate to the kanban view', async ({ projectBoardPage, scenarioId }) => {
  await projectBoardPage.navigate(`"${scenarioId}"`);
});

When('I navigate to the kanban board', async ({ projectBoardPage }) => {
  await projectBoardPage.navigate();
});

Then(
  'the issue should appear in the {string} column',
  async ({ projectBoardPage, projectsAPI, sandbox, scenarioContext }, columnName: string) => {
    const seededIssue = scenarioContext.get<SeededIssue>('seededIssue');

    await expect(async () => {
      await expect(
        projectBoardPage.page.getByRole('heading', { name: columnName, level: 2 }),
      ).toBeVisible();

      const items = await projectsAPI.getItems(sandbox.projectId);
      const item = items.find((i) => i.id === seededIssue.projectItemId);
      if (!item) throw new Error(`Issue item ${seededIssue.projectItemId} not found`);
      expect(item.status).toBe(columnName);
    }).toPass({ timeout: 20_000 });
  },
);

When(
  'I drag the issue from {string} to {string}',
  async ({ projectBoardPage, scenarioContext }, _fromColumn: string, toColumn: string) => {
    const seededIssue = scenarioContext.get<SeededIssue>('seededIssue');
    await projectBoardPage.dragCardToColumn(seededIssue.title, toColumn);
  },
);

Then(
  'the issue status should be {string} via the API',
  async ({ projectsAPI, sandbox, scenarioContext }, expectedStatus: string) => {
    const seededIssue = scenarioContext.get<SeededIssue>('seededIssue');
    const items = await projectsAPI.getItems(sandbox.projectId);
    const item = items.find((i) => i.id === seededIssue.projectItemId);
    if (!item) {
      throw new Error(`Issue item ${seededIssue.projectItemId} not found in project`);
    }
    expect(item.status).toBe(expectedStatus);
  },
);
