import { createBdd } from 'playwright-bdd';
import { test } from '../../src/fixtures';
import type { SeededIssue } from '../../src/utils/testing/issue-seeder';
import { seedAdditionalIssue } from '../../src/utils/testing/issue-seeder';
import { uniqueTestTitle } from '../../src/utils/testing/factories';

const { Given, Then } = createBdd(test);

Given(
  'issue {string} is seeded on the kanban board with title prefix {string}',
  async (
    { githubAPI, projectsAPI, sandbox, dataManager, scenarioContext, scenarioId },
    key: string,
    prefix: string,
  ) => {
    const title = `${uniqueTestTitle(prefix)} [${scenarioId}]`;

    await seedAdditionalIssue(githubAPI, projectsAPI, sandbox, dataManager, scenarioContext, {
      title,
      body: 'Ranking test issue',
      key,
    });
  },
);

Then(
  'both issues {string} and {string} should appear in the {string} column',
  async ({ boardView, scenarioContext }, key1, key2, _columnName) => {
    const issue1 = scenarioContext.get<SeededIssue>(key1);
    const issue2 = scenarioContext.get<SeededIssue>(key2);
    await boardView.expectCardVisible(issue1.title);
    await boardView.expectCardVisible(issue2.title);
  },
);
