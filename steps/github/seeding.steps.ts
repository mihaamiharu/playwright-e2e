import { createBdd } from 'playwright-bdd';
import { test } from '../../src/fixtures';
import { seedProjectIssue } from '../../src/utils/testing/issue-seeder';
import { getPersistentIssue } from '../../src/config/setup/sandbox-bootstrap';
import { env } from '../../src/config/env.config';
import type { SeededIssue } from '../../src/utils/testing/issue-seeder';

const { Given, When } = createBdd(test);

Given(
  'issue {string} is seeded on the kanban board',
  async ({ githubAPI, projectsAPI, sandbox, dataManager, scenarioContext, scenarioId }, key: string) => {
    await seedProjectIssue(githubAPI, projectsAPI, sandbox, dataManager, scenarioContext, {
      scenarioId,
      key,
    });
  },
);

Given('the persistent test issue is loaded', async ({ scenarioContext }) => {
  const persistentIssue = getPersistentIssue();
  if (!persistentIssue) {
    throw new Error(
      'Persistent issue not found. Run global-setup first or check auth/persistent-issue.json',
    );
  }

  const seededIssue: SeededIssue = {
    number: persistentIssue.number,
    title: persistentIssue.title,
    node_id: persistentIssue.nodeId,
    projectItemId: persistentIssue.projectItemId,
  } as SeededIssue;

  scenarioContext.set('seededIssue', seededIssue);
});

When('I navigate to the kanban view without filter', async ({ projectBoardPage }) => {
  await projectBoardPage.navigate();
});

When('I navigate to the table view without filter', async ({ tableViewPage }) => {
  await tableViewPage.navigate();
});

When('I navigate to the persistent issue page', async ({ issuePage, scenarioContext }) => {
  const seededIssue = scenarioContext.get<SeededIssue>('seededIssue');
  await issuePage.navigateTo(env.github.testRepo, seededIssue.number);
});
