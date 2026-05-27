import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../../src/fixtures';
import { env } from '../../src/config/env.config';

const { When, Then } = createBdd(test);

let draftItemId = '';
let draftTitle = '';

When(
  'I create a draft issue with title {string} via the API',
  async ({ projectsAPI, sandbox, dataManager }, title: string) => {
    const uniqueId = `draft-${Date.now()}`;
    draftTitle = `e2e-${uniqueId} ${title}`;

    draftItemId = await projectsAPI.addDraftIssue(sandbox.projectId, draftTitle);

    dataManager.enqueue(async () => {
      await projectsAPI.removeItemFromProject(sandbox.projectId, draftItemId);
    });
  },
);

Then('the draft issue should be visible on the board without an issue number', async ({ page }) => {
  const card = page.getByRole('button', { name: new RegExp(draftTitle) });
  await expect(card.first()).toBeVisible({ timeout: 15000 });

  const cardText = await card.first().textContent();
  const hasIssueNumber = /#\d+/.test(cardText || '');
  expect(hasIssueNumber).toBe(false);
});

let issueTitle = '';

When(
  'I create a full issue with the same title via the API',
  async ({ githubAPI, projectsAPI, sandbox, dataManager }) => {
    const uniqueId = `draft-convert-${Date.now()}`;
    issueTitle = `e2e-${uniqueId} - Converted issue`;

    const issue = await githubAPI.createIssue(env.github.testRepo, {
      title: issueTitle,
      body: 'Converted from draft',
    });

    const itemId = await projectsAPI.addIssueToProject(sandbox.projectId, issue.node_id);

    dataManager.enqueue(async () => {
      await projectsAPI.removeItemFromProject(sandbox.projectId, itemId);
    });
    dataManager.enqueue(async () => {
      await githubAPI.closeIssue(env.github.testRepo, issue.number);
    });
  },
);

Then('the issue should be visible with an issue number on the board', async ({ page }) => {
  const card = page.getByRole('button', { name: new RegExp(`${issueTitle}.*#\\d+`) });
  await expect(card.first()).toBeVisible({ timeout: 15000 });
});
