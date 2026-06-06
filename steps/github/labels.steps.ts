import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../../src/fixtures';
import { env } from '../../src/config/env.config';
import type { SeededIssue } from '../../src/utils/testing/issue-seeder';
import { seedAdditionalIssue } from '../../src/utils/testing/issue-seeder';
import { uniqueTestTitle } from '../../src/utils/testing/factories';

const { When, Then } = createBdd(test);

When('I add the label {string} via the UI', async ({ labelsPanel }, label: string) => {
  await labelsPanel.addLabel(label);
});

When(
  'I add the label {string} via the API',
  async ({ githubAPI, scenarioContext }, label: string) => {
    const seededIssue = scenarioContext.get<SeededIssue>('seededIssue');
    await githubAPI.addLabels(env.github.testRepo, seededIssue.number, [label]);
  },
);

When('I remove the label {string} via the UI', async ({ labelsPanel }, label: string) => {
  await labelsPanel.removeLabel(label);
});

Then('I should see the {string} label on the issue', async ({ labelsPanel }, label: string) => {
  await labelsPanel.expectLabelVisible(label);
});

Then('I should not see the {string} label on the issue', async ({ labelsPanel }, label: string) => {
  await labelsPanel.expectLabelNotVisible(label);
});

When(
  'I seed a second unlabeled issue on the board',
  async ({ githubAPI, projectsAPI, sandbox, dataManager, scenarioContext }) => {
    const title = uniqueTestTitle('unlabeled');

    await seedAdditionalIssue(githubAPI, projectsAPI, sandbox, dataManager, {
      title,
      body: `Second issue for label filter test. Run: ${title}`,
    });

    scenarioContext.set('secondUnlabeledIssueTitle', title);
  },
);

When(
  'I filter the board by the label {string}',
  async ({ page, projectFilterBar, boardView, scenarioContext }, label: string) => {
    const seededIssue = scenarioContext.get<SeededIssue>('seededIssue');
    await boardView.expectCardVisible(seededIssue.title);

    await projectFilterBar.open();
    await projectFilterBar.selectType('Label');
    await projectFilterBar.selectOption(label, 'Label');
    await projectFilterBar.save();
    await page.waitForURL(/filterQuery=label/);

    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
  },
);

Then('the seeded issue should be visible on the board', async ({ boardView, scenarioContext }) => {
  const seededIssue = scenarioContext.get<SeededIssue>('seededIssue');
  await boardView.expectCardVisible(seededIssue.title);
});

Then(
  'the second unlabeled issue should not be visible on the board',
  async ({ boardView, scenarioContext }) => {
    await boardView.expectCardNotVisible(scenarioContext.get<string>('secondUnlabeledIssueTitle'));
  },
);
