import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../../src/fixtures';

const { When, Then } = createBdd(test);

When(
  'I move the issue to {string} via the project API',
  async ({ sandbox, seededProjectIssue, projectsAPI, page }, statusName: string) => {
    const optionId = sandbox.statusOptions.get(statusName);
    if (!optionId) {
      const available = [...sandbox.statusOptions.keys()].join(', ');
      throw new Error(`Status "${statusName}" not found. Available: ${available}`);
    }
    await projectsAPI.moveItemToStatus(
      sandbox.projectId,
      seededProjectIssue.projectItemId,
      sandbox.statusFieldId,
      optionId,
    );

    await expect(async () => {
      const items = await projectsAPI.getItems(sandbox.projectId);
      const item = items.find((i) => i.id === seededProjectIssue.projectItemId);
      expect(item?.status).toBe(statusName);
    }).toPass({ timeout: 15000 });

    // Let the GraphQL mutation fully propagate before sending the next one
    await page.waitForTimeout(1000);
  },
);

When('I navigate to the kanban view', async ({ projectBoardPage }) => {
  await projectBoardPage.navigate();
});

Then(
  'the issue should appear in the {string} column',
  async ({ projectBoardPage, projectsAPI, sandbox, seededProjectIssue }, columnName: string) => {
    await expect(
      projectBoardPage.page.getByRole('heading', { name: columnName, level: 2 }),
    ).toBeVisible();

    const items = await projectsAPI.getItems(sandbox.projectId);
    const item = items.find((i) => i.id === seededProjectIssue.projectItemId);
    if (!item) {
      throw new Error(`Issue item ${seededProjectIssue.projectItemId} not found in project`);
    }
    expect(item.status).toBe(columnName);
  },
);

When(
  'I drag the issue from {string} to {string}',
  async ({ projectBoardPage, seededProjectIssue }, _fromColumn: string, toColumn: string) => {
    await projectBoardPage.dragCardToColumn(seededProjectIssue.title, toColumn);
  },
);

Then(
  'the issue status should be {string} via the API',
  async ({ projectsAPI, sandbox, seededProjectIssue }, expectedStatus: string) => {
    const items = await projectsAPI.getItems(sandbox.projectId);
    const item = items.find((i) => i.id === seededProjectIssue.projectItemId);
    if (!item) {
      throw new Error(`Issue item ${seededProjectIssue.projectItemId} not found in project`);
    }
    expect(item.status).toBe(expectedStatus);
  },
);
