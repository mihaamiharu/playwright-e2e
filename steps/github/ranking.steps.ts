import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../../src/fixtures/github-project.fixture';
import { env } from '../../src/config/env.config';

const { Given, Then } = createBdd(test);

let secondRankIssueTitle = '';

Given('a second seeded project issue exists on the kanban board with title prefix {string}', async ({ githubAPI, projectsAPI, sandbox, dataManager }, prefix: string) => {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 6);
  secondRankIssueTitle = `${prefix}-e2e-${ts}-${rand}`;

  const issue = await githubAPI.createIssue(env.github.testRepo, {
    title: secondRankIssueTitle,
    body: 'Ranking test issue',
  });
  const itemId = await projectsAPI.addIssueToProject(sandbox.projectId, issue.node_id);

  dataManager.enqueue(async () => {
    await projectsAPI.removeItemFromProject(sandbox.projectId, itemId);
  });
  dataManager.enqueue(async () => {
    await githubAPI.closeIssue(env.github.testRepo, issue.number);
  });
});

Then('both the {string} and seeded issues should appear in the {string} column', async ({ page, seededProjectIssue }, _sourcePrefix: string, _columnName: string) => {
  await page.getByRole('heading', { level: 2 }).first().waitFor({ state: 'visible', timeout: 15000 });

  const seededCard = page.getByRole('button', { name: new RegExp(seededProjectIssue.title) });
  await expect(seededCard.first()).toBeVisible({ timeout: 15000 });

  const zzzCard = page.getByRole('button', { name: new RegExp(secondRankIssueTitle) });
  await expect(zzzCard.first()).toBeVisible({ timeout: 15000 });
});
