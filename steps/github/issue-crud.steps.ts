import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../../src/fixtures';
import { env } from '../../src/config/env.config';
import type { SeededIssue } from '../../src/utils/testing/issue-seeder';

const { When, Then } = createBdd(test);

When(
  'I navigate to the page of issue {string}',
  async ({ issuePage, scenarioContext }, key: string) => {
    const { number } = scenarioContext.get<SeededIssue>(key);
    await issuePage.navigateTo(env.github.testRepo, number);
  },
);

Then(
  'I should see the heading of issue {string}',
  async ({ issuePage, scenarioContext }, key: string) => {
    const { title } = scenarioContext.get<SeededIssue>(key);
    await issuePage.expectHeading(title);
  },
);

Then(
  'I should see the number of issue {string}',
  async ({ issuePage, scenarioContext }, key: string) => {
    const { number } = scenarioContext.get<SeededIssue>(key);
    await issuePage.expectIssueNumber(number);
  },
);

When(
  'I update issue {string} description to {string}',
  async ({ githubAPI, scenarioContext }, key: string, newDescription: string) => {
    const { number } = scenarioContext.get<SeededIssue>(key);
    await githubAPI.updateIssue(env.github.testRepo, number, {
      body: newDescription,
    });
  },
);

Then('I should see {string} in the issue body', async ({ issuePage }, expectedText: string) => {
  await issuePage.expectBodyText(expectedText);
});

When(
  'I close issue {string} via API',
  async ({ githubAPI, scenarioContext }, key: string) => {
    const { number } = scenarioContext.get<SeededIssue>(key);
    await githubAPI.updateIssue(env.github.testRepo, number, {
      state: 'closed',
    });
  },
);

When(
  'I reopen issue {string} via API',
  async ({ githubAPI, scenarioContext }, key: string) => {
    const { number } = scenarioContext.get<SeededIssue>(key);
    const issue = await githubAPI.updateIssue(env.github.testRepo, number, {
      state: 'open',
    });
    if (issue.state !== 'open') {
      throw new Error(`Expected issue #${number} to be open after reopen, got: ${issue.state}`);
    }
  },
);

Then(
  'I should see a {string} status badge on issue {string}',
  async ({ issuePage }, expectedStatus: string, _key: string) => {
    await issuePage.page.reload();
    await expect(async () => {
      await issuePage.page.reload();
      await issuePage.expectState(expectedStatus);
    }).toPass({ timeout: 30_000, intervals: [1_000, 2_000, 5_000] });
  },
);
