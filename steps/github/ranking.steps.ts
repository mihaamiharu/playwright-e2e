import { createBdd } from 'playwright-bdd';
import { test } from '../../src/fixtures';
import { env } from '../../src/config/env.config';

const { Given, Then } = createBdd(test);

Given(
  'a second seeded project issue exists on the kanban board with title prefix {string}',
  async ({ githubAPI, projectsAPI, sandbox, dataManager, scenarioContext }, prefix: string) => {
    const ts = Date.now();
    const rand = Math.random().toString(36).slice(2, 6);
    const title = `${prefix}-e2e-${ts}-${rand}`;
    scenarioContext.set('secondRankIssueTitle', title);

    const issue = await githubAPI.createIssue(env.github.testRepo, {
      title,
      body: 'Ranking test issue',
    });
    const itemId = await projectsAPI.addIssueToProject(sandbox.projectId, issue.node_id);

    dataManager.enqueue(`close issue #${issue.number}`, async () => {
      await githubAPI.closeIssue(env.github.testRepo, issue.number);
    });
    dataManager.enqueue(`remove issue #${issue.number} from project`, async () => {
      await projectsAPI.removeItemFromProject(sandbox.projectId, itemId);
    });
  },
);

Then(
  'both the {string} and seeded issues should appear in the {string} column',
  async ({ boardView, seededProjectIssue, scenarioContext }) => {
    await boardView.expectCardVisible(seededProjectIssue.title);
    await boardView.expectCardVisible(scenarioContext.get<string>('secondRankIssueTitle'));
  },
);
