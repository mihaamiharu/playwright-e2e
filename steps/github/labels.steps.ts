import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../../src/fixtures';
import { env } from '../../src/config/env.config';
import { uniqueTestTitle, buildIssueParams } from '../../src/utils/testing/factories';

const { When, Then } = createBdd(test);

When('I add the label {string} via the UI', async ({ labelsPanel }, label: string) => {
  await labelsPanel.addLabel(label);
});

When(
  'I add the label {string} via the API',
  async ({ githubAPI, seededProjectIssue }, label: string) => {
    await githubAPI.addLabels(env.github.testRepo, seededProjectIssue.number, [label]);
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

    const issue = await githubAPI.createIssue(
      env.github.testRepo,
      buildIssueParams({ title, body: `Second issue for label filter test. Run: ${title}` }),
    );

    dataManager.enqueue(`close issue #${issue.number}`, async () => {
      await githubAPI.closeIssue(env.github.testRepo, issue.number);
    });

    const projectItemId = await projectsAPI.addIssueToProject(sandbox.projectId, issue.node_id);
    dataManager.enqueue(`remove issue #${issue.number} from project`, async () => {
      await projectsAPI.removeItemFromProject(sandbox.projectId, projectItemId);
    });

    scenarioContext.set('secondUnlabeledIssueTitle', title);
  },
);

When(
  'I filter the board by the label {string}',
  async ({ page, projectFilterBar, boardView, seededProjectIssue }, label: string) => {
    await boardView.expectCardVisible(seededProjectIssue.title);

    await projectFilterBar.open();
    await projectFilterBar.selectType('Label');
    await projectFilterBar.selectOption(label, 'Label');
    await projectFilterBar.save();
    await page.waitForURL(/filterQuery=label/);

    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
  },
);

Then(
  'the seeded issue should be visible on the board',
  async ({ boardView, seededProjectIssue }) => {
    await boardView.expectCardVisible(seededProjectIssue.title);
  },
);

Then(
  'the second unlabeled issue should not be visible on the board',
  async ({ boardView, scenarioContext }) => {
    await boardView.expectCardNotVisible(scenarioContext.get<string>('secondUnlabeledIssueTitle'));
  },
);
