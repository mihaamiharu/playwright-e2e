import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { test } from '../../src/fixtures';
import { env } from '../../src/config/env.config';

const { When, Then } = createBdd(test);

const KANBAN_VIEW_PATH = `/users/${env.github.testRepoOwner}/projects/${env.github.sandboxProjectNumber}/views/1`;

function draggableCard(page: Page, title: string) {
  return page.locator('[aria-roledescription="draggable"]').filter({ hasText: new RegExp(title) });
}

When('I move the issue to {string} via the project API', async ({ sandbox, seededProjectIssue, projectsAPI, page }, statusName: string) => {
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
    const item = items.find(i => i.id === seededProjectIssue.projectItemId);
    expect(item?.status).toBe(statusName);
  }).toPass({ timeout: 15000 });

  // Let the GraphQL mutation fully propagate before sending the next one
  await page.waitForTimeout(1000);
});

When('I navigate to the kanban view', async ({ page }) => {
  await page.goto(KANBAN_VIEW_PATH);
  await page.getByRole('heading', { level: 2 }).first().waitFor({ state: 'visible', timeout: 15000 });
});

Then('the issue should appear in the {string} column', async ({ page, projectsAPI, sandbox, seededProjectIssue }, columnName: string) => {
  await expect(page.getByRole('heading', { name: columnName, level: 2 })).toBeVisible();

  const items = await projectsAPI.getItems(sandbox.projectId);
  const item = items.find(i => i.id === seededProjectIssue.projectItemId);
  if (!item) {
    throw new Error(`Issue item ${seededProjectIssue.projectItemId} not found in project`);
  }
  expect(item.status).toBe(columnName);
});

When('I drag the issue from {string} to {string}', async ({ page, seededProjectIssue }, _fromColumn: string, toColumn: string) => {
  await page.reload();
  await page.getByRole('heading', { level: 2 }).first().waitFor({ state: 'visible', timeout: 15000 });

  const issueCard = draggableCard(page, seededProjectIssue.title);
  await expect(issueCard).toBeVisible();

  const targetHeading = page.getByRole('heading', { name: toColumn, level: 2 });
  await expect(targetHeading).toBeVisible();

  // Use the specific GitHub Projects attribute for columns to target the actual drop zone
  const targetColumn = page.locator(`[data-board-column="${toColumn}"]`);
  
  const sourceBox = await issueCard.boundingBox();
  if (!sourceBox) throw new Error('Could not determine source card position');

  const targetBox = await targetColumn.boundingBox();
  if (!targetBox) throw new Error(`Could not determine target column position for "${toColumn}"`);

  // Use explicit mouse events with steps to simulate a real drag (GitHub Projects relies heavily on pointer move events)
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  // Drag to the center of the actual column body dropzone
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 20 });
  await page.mouse.up();
});

Then('the issue status should be {string} via the API', async ({ projectsAPI, sandbox, seededProjectIssue }, expectedStatus: string) => {
  const items = await projectsAPI.getItems(sandbox.projectId);
  const item = items.find(i => i.id === seededProjectIssue.projectItemId);
  if (!item) {
    throw new Error(`Issue item ${seededProjectIssue.projectItemId} not found in project`);
  }
  expect(item.status).toBe(expectedStatus);
});
