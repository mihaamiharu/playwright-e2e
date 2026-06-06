import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../../src/fixtures';
import type { SeededIssue } from '../../src/utils/testing/issue-seeder';

const { When, Then } = createBdd(test);

When(
  'I move issue {string} to {string} via API',
  async ({ sandbox, scenarioContext, projectsAPI, page }, key: string, statusName: string) => {
    const issue = scenarioContext.get<SeededIssue>(key);
    const optionId = sandbox.statusOptions.get(statusName);
    if (!optionId) {
      const available = [...sandbox.statusOptions.keys()].join(', ');
      throw new Error(`Status "${statusName}" not found. Available: ${available}`);
    }
    await projectsAPI.moveItemToStatus(
      sandbox.projectId,
      issue.projectItemId,
      sandbox.statusFieldId,
      optionId,
    );

    await expect(async () => {
      const items = await projectsAPI.getItems(sandbox.projectId);
      const item = items.find((i) => i.id === issue.projectItemId);
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
  'issue {string} should appear in the {string} column',
  async (
    { projectBoardPage, projectsAPI, sandbox, scenarioContext },
    key: string,
    columnName: string,
  ) => {
    const issue = scenarioContext.get<SeededIssue>(key);

    await expect(async () => {
      await expect(
        projectBoardPage.page.getByRole('heading', { name: columnName, level: 2 }),
      ).toBeVisible();

      const items = await projectsAPI.getItems(sandbox.projectId);
      const item = items.find((i) => i.id === issue.projectItemId);
      if (!item) throw new Error(`Issue item ${issue.projectItemId} not found`);
      expect(item.status).toBe(columnName);
    }).toPass({ timeout: 20_000 });
  },
);

When(
  'I drag issue {string} from {string} to {string}',
  async (
    { projectBoardPage, scenarioContext },
    key: string,
    _fromColumn: string,
    toColumn: string,
  ) => {
    const issue = scenarioContext.get<SeededIssue>(key);
    await projectBoardPage.dragCardToColumn(issue.title, toColumn);
  },
);

Then(
  'issue {string} status should be {string} via API',
  async ({ projectsAPI, sandbox, scenarioContext }, key: string, expectedStatus: string) => {
    const issue = scenarioContext.get<SeededIssue>(key);
    const items = await projectsAPI.getItems(sandbox.projectId);
    const item = items.find((i) => i.id === issue.projectItemId);
    if (!item) {
      throw new Error(`Issue item ${issue.projectItemId} not found in project`);
    }
    expect(item.status).toBe(expectedStatus);
  },
);
