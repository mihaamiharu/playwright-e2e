import { createBdd } from 'playwright-bdd';
import { test } from '../../src/fixtures';
import type { SeededIssue } from '../../src/utils/testing/issue-seeder';
import { seedAdditionalIssue } from '../../src/utils/testing/issue-seeder';
import { uniqueTestTitle } from '../../src/utils/testing/factories';

const { Given, Then } = createBdd(test);

Given(
  'a second seeded project issue exists on the kanban board with title prefix {string}',
  async (
    { githubAPI, projectsAPI, sandbox, dataManager, scenarioContext, scenarioId },
    prefix: string,
  ) => {
    const title = `${uniqueTestTitle(prefix)} [${scenarioId}]`;
    scenarioContext.set('secondRankIssueTitle', title);

    await seedAdditionalIssue(githubAPI, projectsAPI, sandbox, dataManager, {
      title,
      body: 'Ranking test issue',
    });
  },
);

Then(
  'both the {string} and seeded issues should appear in the {string} column',
  async ({ boardView, scenarioContext }) => {
    const seededIssue = scenarioContext.get<SeededIssue>('seededIssue');
    await boardView.expectCardVisible(seededIssue.title);
    await boardView.expectCardVisible(scenarioContext.get<string>('secondRankIssueTitle'));
  },
);
