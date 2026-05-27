import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../../src/fixtures/github-project.fixture';
import { env } from '../../src/config/env.config';

const { Given, When, Then } = createBdd(test);

let secondIssueProjectItemId = '';

Given('a second seeded project issue exists on the kanban board', async ({ githubAPI, projectsAPI, sandbox, dataManager }) => {
  const uniqueId = `bulk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const title = `e2e-${uniqueId}`;

  const issue = await githubAPI.createIssue(env.github.testRepo, { title, body: 'Bulk test issue' });
  const projectItemId = await projectsAPI.addIssueToProject(sandbox.projectId, issue.node_id);

  secondIssueProjectItemId = projectItemId;

  dataManager.enqueue(async () => {
    await projectsAPI.removeItemFromProject(sandbox.projectId, projectItemId);
  });
  dataManager.enqueue(async () => {
    await githubAPI.closeIssue(env.github.testRepo, issue.number);
  });
});

When('I bulk move both seeded issues to {string} via the API', async ({ sandbox, seededProjectIssue, projectsAPI }, statusName) => {
  const optionId = sandbox.statusOptions.get(statusName);
  if (!optionId) {
    throw new Error(`Status "${statusName}" not found. Available: ${[...sandbox.statusOptions.keys()].join(', ')}`);
  }

  await projectsAPI.moveItemToStatus(sandbox.projectId, seededProjectIssue.projectItemId, sandbox.statusFieldId, optionId);
  await projectsAPI.moveItemToStatus(sandbox.projectId, secondIssueProjectItemId, sandbox.statusFieldId, optionId);
});

Then('both seeded issues should appear in the {string} column', async ({ page, projectsAPI, sandbox, seededProjectIssue }, columnName) => {
  await expect(page.getByRole('heading', { name: columnName, level: 2 })).toBeVisible({ timeout: 15000 });

  await expect(async () => {
    const items = await projectsAPI.getItems(sandbox.projectId);
    const item1 = items.find((i) => i.id === seededProjectIssue.projectItemId);
    const item2 = items.find((i) => i.id === secondIssueProjectItemId);
    expect(item1?.status).toBe(columnName);
    expect(item2?.status).toBe(columnName);
  }).toPass({ timeout: 15000 });
});
