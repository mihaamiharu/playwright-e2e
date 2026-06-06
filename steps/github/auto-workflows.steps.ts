import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../../src/fixtures';
import { env } from '../../src/config/env.config';
import type { SeededIssue } from '../../src/utils/testing/issue-seeder';

const { When, Then } = createBdd(test);

When(
  'I close issue {string} for the workflow via API',
  async ({ githubAPI, scenarioContext }, key: string) => {
    const issue = scenarioContext.get<SeededIssue>(key);
    await githubAPI.updateIssue(env.github.testRepo, issue.number, {
      state: 'closed',
    });
  },
);

Then(
  'issue {string} should be moved to {string} by auto-workflow',
  async ({ projectsAPI, sandbox, scenarioContext }, key: string, expectedStatus: string) => {
    const issue = scenarioContext.get<SeededIssue>(key);
    await expect(async () => {
      const items = await projectsAPI.getItems(sandbox.projectId);
      const item = items.find((i) => i.id === issue.projectItemId);
      expect(item?.status).toBe(expectedStatus);
    }).toPass({ timeout: 30000 });
  },
);
