import { createBdd, DataTable } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../../src/fixtures';
import { env } from '../../src/config/env.config';
import type { SeededIssue } from '../../src/utils/testing/issue-seeder';

const { When, Then } = createBdd(test);

When('I add the label {string} via the UI', async ({ labelsPanel }, label: string) => {
  await labelsPanel.addLabel(label);
});

When('I add the following labels via the UI:', async ({ labelsPanel }, data: DataTable) => {
  for (const label of data.raw().slice(1).map((row) => row[0])) {
    await labelsPanel.addLabel(label);
  }
});

When(
  'I add label {string} to issue {string} via the API',
  async ({ githubAPI, scenarioContext }, label: string, key) => {
    const issue = scenarioContext.get<SeededIssue>(key);
    await githubAPI.addLabels(env.github.testRepo, issue.number, [label]);
  },
);

When('I remove the label {string} via the UI', async ({ labelsPanel }, label: string) => {
  await labelsPanel.removeLabel(label);
});

Then('I should see the {string} label on the issue', async ({ labelsPanel }, label: string) => {
  await labelsPanel.expectLabelVisible(label);
});

Then('the following labels should be visible on the issue:', async ({ labelsPanel }, data: DataTable) => {
  for (const label of data.raw().slice(1).map((row) => row[0])) {
    await labelsPanel.expectLabelVisible(label);
  }
});

Then('I should not see the {string} label on the issue', async ({ labelsPanel }, label: string) => {
  await labelsPanel.expectLabelNotVisible(label);
});

When(
  'I filter the board by the label {string}',
  async ({ page, projectFilterBar }, label: string) => {
    await projectFilterBar.open();
    await projectFilterBar.selectType('Label');
    await projectFilterBar.selectOption(label, 'Label');
    await projectFilterBar.save();
    await page.waitForURL(/filterQuery=label/);

    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
  },
);

Then(
  'issue {string} should be visible on the board',
  async ({ boardView, scenarioContext }, key) => {
    const issue = scenarioContext.get<SeededIssue>(key);
    await boardView.expectCardVisible(issue.title);
  },
);

Then(
  'issue {string} should not be visible on the board',
  async ({ boardView, scenarioContext }, key) => {
    const issue = scenarioContext.get<SeededIssue>(key);
    await boardView.expectCardNotVisible(issue.title);
  },
);
