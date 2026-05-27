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
    const projectItemId = await projectsAPI.addIssueToProject(sandbox.projectId, issue.node_id);

    dataManager.enqueue(async () => {
      await projectsAPI.removeItemFromProject(sandbox.projectId, projectItemId);
    });
    dataManager.enqueue(async () => {
      await githubAPI.closeIssue(env.github.testRepo, issue.number);
    });
  },
);

When(
  'I search the project by title for the unique keyword',
  async ({ page, projectFilterBar, scenarioContext }) => {
    const keyword = scenarioContext.get<string>('searchKeyword');
    await projectFilterBar.open();
    await projectFilterBar.selectType('Title');
    await page.waitForURL(/filterQuery=title/);

    const input = (await projectFilterBar.filterInput.isVisible())
      ? projectFilterBar.filterInput
      : page.getByRole('combobox').first();
    await expect(input).toHaveValue('title:');

    await projectFilterBar.typeSearch(keyword);
    await projectFilterBar.save();

    await page.waitForURL(new RegExp(keyword));
    await page
      .getByRole('heading', { level: 2 })
      .first()
      .waitFor({ state: 'visible', timeout: 15000 });
  },
);

Then(
  'the issue with the keyword should be visible on the board',
  async ({ projectBoardPage, scenarioContext }) => {
    await projectBoardPage.expectCardVisible(scenarioContext.get<string>('keywordIssueTitle'));
  },
);

Then(
  'the seeded issue without the keyword should not be visible',
  async ({ projectBoardPage, seededProjectIssue }) => {
    await projectBoardPage.expectCardNotVisible(seededProjectIssue.title);
  },
);
