import { createBdd } from 'playwright-bdd';
import { test } from '../../src/fixtures';
import { env } from '../../src/config/env.config';

const { When, Then } = createBdd(test);

When('I add the label {string} via the UI', async ({ issuePage }, label: string) => {
  await issuePage.addLabel(label);
});

When(
  'I add the label {string} via the API',
  async ({ githubAPI, seededProjectIssue }, label: string) => {
    await githubAPI.addLabels(env.github.testRepo, seededProjectIssue.number, [label]);
  },
);

When('I remove the label {string} via the UI', async ({ issuePage }, label: string) => {
  await issuePage.removeLabel(label);
});

Then('I should see the {string} label on the issue', async ({ issuePage }, label: string) => {
  await issuePage.expectLabelVisible(label);
});

Then('I should not see the {string} label on the issue', async ({ issuePage }, label: string) => {
  await issuePage.expectLabelNotVisible(label);
});

When(
  'I seed a second unlabeled issue on the board',
  async ({ githubAPI, projectsAPI, sandbox, dataManager, scenarioContext }) => {
    const uniqueId = `unlabeled-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const title = `e2e-${uniqueId}`;

    const issue = await githubAPI.createIssue(env.github.testRepo, {
      title,
      body: `Second issue for label filter test. Run: ${uniqueId}`,
    });

    const projectItemId = await projectsAPI.addIssueToProject(sandbox.projectId, issue.node_id);

    dataManager.enqueue(async () => {
      await projectsAPI.removeItemFromProject(sandbox.projectId, projectItemId);
    });
    dataManager.enqueue(async () => {
      await githubAPI.closeIssue(env.github.testRepo, issue.number);
    });

    scenarioContext.set('secondUnlabeledIssueTitle', title);
  },
);

When(
  'I filter the board by the label {string}',
  async ({ page, projectFilterBar }, label: string) => {
    await projectFilterBar.open();
    await projectFilterBar.selectType('Label');
    await page.waitForURL(/filterQuery=label/);

    await projectFilterBar.selectOption(label, 'Label');
    await projectFilterBar.save();
    await page.waitForURL(/filterQuery=label/);

    await page
      .getByRole('heading', { level: 2 })
      .first()
      .waitFor({ state: 'visible', timeout: 15000 });
  },
);

Then(
  'the seeded issue should be visible on the board',
  async ({ projectBoardPage, seededProjectIssue }) => {
    await projectBoardPage.expectCardVisible(seededProjectIssue.title);
  },
);

Then(
  'the second unlabeled issue should not be visible on the board',
  async ({ projectBoardPage, scenarioContext }) => {
    await projectBoardPage.expectCardNotVisible(
      scenarioContext.get<string>('secondUnlabeledIssueTitle'),
    );
  },
);
