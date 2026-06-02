import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../../src/fixtures';
import { env } from '../../src/config/env.config';

const { Given, When, Then } = createBdd(test);

Given(
  'a second project issue exists with a unique search keyword in the title',
  async ({ githubAPI, projectsAPI, sandbox, dataManager, scenarioContext }) => {
    const keyword = `SRCH-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const title = `e2e-${keyword}`;
    scenarioContext.set('searchKeyword', keyword);
    scenarioContext.set('keywordIssueTitle', title);

    const issue = await githubAPI.createIssue(env.github.testRepo, {
      title,
      body: 'Search test issue',
    });
    dataManager.enqueue(`close issue #${issue.number}`, async () => {
      await githubAPI.closeIssue(env.github.testRepo, issue.number);
    });
    const projectItemId = await projectsAPI.addIssueToProject(sandbox.projectId, issue.node_id);

    dataManager.enqueue(`remove issue #${issue.number} from project`, async () => {
      await projectsAPI.removeItemFromProject(sandbox.projectId, projectItemId);
    });
  },
);

When(
  'I search the project by title for the unique keyword',
  async ({ page, projectFilterBar, scenarioContext }) => {
    const keyword = scenarioContext.get<string>('searchKeyword');

    await projectFilterBar.open();
    await projectFilterBar.typeSearch(keyword);
    await projectFilterBar.save();

    await page.waitForURL(new RegExp(keyword));
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
  },
);

Then(
  'the issue with the keyword should be visible on the board',
  async ({ boardView, scenarioContext }) => {
    await boardView.expectCardVisible(scenarioContext.get<string>('keywordIssueTitle'));
  },
);

Then(
  'the seeded issue without the keyword should not be visible',
  async ({ boardView, seededProjectIssue }) => {
    await boardView.expectCardNotVisible(seededProjectIssue.title);
  },
);
