import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../../src/fixtures';
import { env } from '../../src/config/env.config';
import type { SeededIssue } from '../../src/utils/testing/issue-seeder';

const { When, Then } = createBdd(test);

When('I navigate to the issue page', async ({ issuePage, scenarioContext }) => {
  const { number } = scenarioContext.get<SeededIssue>('seededIssue');
  await issuePage.navigateTo(env.github.testRepo, number);
});

Then('I should see the issue heading', async ({ issuePage, scenarioContext }) => {
  const { title } = scenarioContext.get<SeededIssue>('seededIssue');
  await issuePage.expectHeading(title);
});

Then('I should see the issue number in the header', async ({ issuePage, scenarioContext }) => {
  const { number } = scenarioContext.get<SeededIssue>('seededIssue');
  await issuePage.expectIssueNumber(number);
});

When(
  'I update the issue description to {string}',
  async ({ githubAPI, scenarioContext }, newDescription: string) => {
    const { number } = scenarioContext.get<SeededIssue>('seededIssue');
    await githubAPI.updateIssue(env.github.testRepo, number, {
      body: newDescription,
    });
  },
);

Then('I should see {string} in the issue body', async ({ issuePage }, expectedText: string) => {
  await issuePage.expectBodyText(expectedText);
});

When('I close the issue via API', async ({ githubAPI, scenarioContext }) => {
  const { number } = scenarioContext.get<SeededIssue>('seededIssue');
  await githubAPI.updateIssue(env.github.testRepo, number, {
    state: 'closed',
  });
});

When('I reopen the issue via API', async ({ githubAPI, scenarioContext }) => {
  const { number } = scenarioContext.get<SeededIssue>('seededIssue');
  const issue = await githubAPI.updateIssue(env.github.testRepo, number, {
    state: 'open',
  });
  if (issue.state !== 'open') {
    throw new Error(
      `Expected issue #${number} to be open after reopen, got: ${issue.state}`,
    );
  }
});

Then('I should see a {string} status badge', async ({ issuePage }, expectedStatus: string) => {
  await issuePage.page.reload();
  await expect(async () => {
    await issuePage.page.reload();
    await issuePage.expectState(expectedStatus);
  }).toPass({ timeout: 30_000, intervals: [1_000, 2_000, 5_000] });
});
