import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../../src/fixtures/github-project.fixture';
import { env } from '../../src/config/env.config';

const { Given, When, Then } = createBdd(test);

Given('a seeded project issue exists on the kanban board', async ({ seededProjectIssue }) => {
  // Fixture auto-creates the issue and adds it to the project
  const { title, number } = seededProjectIssue;
  if (!title || !number) {
    throw new Error('seededProjectIssue fixture did not create an issue');
  }
});

When('I navigate to the issue page', async ({ page, seededProjectIssue }) => {
  const { number } = seededProjectIssue;
  await page.goto(`/${env.github.testRepo}/issues/${number}`);
});

Then('I should see the issue heading', async ({ page, seededProjectIssue }) => {
  const { title } = seededProjectIssue;
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
});

Then('I should see the issue number in the header', async ({ page, seededProjectIssue }) => {
  const { number } = seededProjectIssue;
  await expect(page.getByText(`#${number}`).first()).toBeVisible();
});

When('I update the issue description to {string}', async ({ githubAPI, seededProjectIssue }, newDescription: string) => {
  await githubAPI.updateIssue(env.github.testRepo, seededProjectIssue.number, {
    body: newDescription,
  });
});

Then('I should see {string} in the issue body', async ({ page }, expectedText: string) => {
  const bodyViewer = page.getByTestId('issue-body-viewer');
  await expect(bodyViewer).toBeVisible();
  await expect(bodyViewer).toContainText(expectedText);
});

When('I close the issue via API', async ({ githubAPI, seededProjectIssue }) => {
  await githubAPI.updateIssue(env.github.testRepo, seededProjectIssue.number, {
    state: 'closed',
  });
});

When('I reopen the issue via API', async ({ githubAPI, seededProjectIssue }) => {
  const issue = await githubAPI.updateIssue(env.github.testRepo, seededProjectIssue.number, {
    state: 'open',
  });
  if (issue.state !== 'open') {
    throw new Error(
      `Expected issue #${seededProjectIssue.number} to be open after reopen, got: ${issue.state}`,
    );
  }
});

Then('I should see a {string} status badge', async ({ page }, expectedStatus: string) => {
  const stateLabel = page.getByTestId('issue-metadata-fixed').getByTestId('header-state');
  await expect(stateLabel).toBeVisible();
  await expect(stateLabel).toHaveText(expectedStatus);
});
