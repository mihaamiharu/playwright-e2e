import fs from 'fs';
import path from 'path';
import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { test } from '../../src/fixtures/github-project.fixture';
import { env } from '../../src/config/env.config';

const { When, Then } = createBdd(test);

const AUTH_PATH = path.resolve('auth/github.json');
const KANBAN_VIEW_PATH = `/users/${env.github.testRepoOwner}/projects/${env.github.sandboxProjectNumber}/views/1`;

function draggableCard(page: Page, title: string) {
  return page.locator('[aria-roledescription="draggable"]').filter({ hasText: new RegExp(title) });
}

When('I move the issue to {string} via the project API', async ({ sandbox, seededProjectIssue, projectsAPI }, statusName: string) => {
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
  }).toPass({ timeout: 5000 });
});

When('I navigate to the kanban view', async ({ page }) => {
  try {
    const raw = fs.readFileSync(AUTH_PATH, 'utf-8');
    const { cookies } = JSON.parse(raw);
    if (cookies?.length) {
      await page.context().addCookies(cookies);
    }
  } catch {
    // Auth file may not exist on first run without global-setup
  }
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

  const sourceBox = await issueCard.boundingBox();
  if (!sourceBox) throw new Error('Could not determine source card position');

  const targetBox = await targetHeading.boundingBox();
  if (!targetBox) throw new Error(`Could not determine target position for "${toColumn}" column`);

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height + 40, { steps: 20 });
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
