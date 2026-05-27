import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../../src/fixtures/github-project.fixture';
import { env } from '../../src/config/env.config';

const { When, Then } = createBdd(test);

When('I close the seeded issue for the workflow via the API', async ({ githubAPI, seededProjectIssue }) => {
  await githubAPI.updateIssue(env.github.testRepo, seededProjectIssue.number, {
    state: 'closed',
  });
});

Then('the seeded issue should be moved to {string} by the auto-workflow', async ({ projectsAPI, sandbox, seededProjectIssue }, expectedStatus: string) => {
  await expect(async () => {
    const items = await projectsAPI.getItems(sandbox.projectId);
    const item = items.find((i) => i.id === seededProjectIssue.projectItemId);
    expect(item?.status).toBe(expectedStatus);
  }).toPass({ timeout: 30000 });
});
