import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../../src/fixtures/github-project.fixture';

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
  await page.goto(`/mihaamiharu/playwright-e2e/issues/${number}`);
});

Then('I should see the issue heading', async ({ page, seededProjectIssue }) => {
  const { title } = seededProjectIssue;
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible({
    timeout: 15_000,
  });
});

Then('I should see the issue number in the header', async ({ page, seededProjectIssue }) => {
  const { number } = seededProjectIssue;
  await expect(page.getByText(`#${number}`).first()).toBeVisible();
});
