import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../../src/fixtures';
import { env } from '../../src/config/env.config';
import type { SeededIssue } from '../../src/utils/testing/issue-seeder';

const { When, Then } = createBdd(test);

When(
  'I close the seeded issue for the workflow via the API',
  async ({ githubAPI, scenarioContext }) => {
    const seededIssue = scenarioContext.get<SeededIssue>('seededIssue');
    await githubAPI.updateIssue(env.github.testRepo, seededIssue.number, {
      state: 'closed',
    });
  },
);

Then(
  'the seeded issue should be moved to {string} by the auto-workflow',
  async ({ projectsAPI, sandbox, scenarioContext }, expectedStatus: string) => {
    const seededIssue = scenarioContext.get<SeededIssue>('seededIssue');
    await expect(async () => {
      const items = await projectsAPI.getItems(sandbox.projectId);
      const item = items.find((i) => i.id === seededIssue.projectItemId);
      expect(item?.status).toBe(expectedStatus);
    }).toPass({ timeout: 30000 });
  },
);
