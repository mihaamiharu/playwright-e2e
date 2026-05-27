import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../../src/fixtures';
import { env } from '../../src/config/env.config';

const { Given, When, Then } = createBdd(test);

let searchKeyword = '';
let keywordIssueTitle = '';

Given(
  'a second project issue exists with a unique search keyword in the title',
  async ({ githubAPI, projectsAPI, sandbox, dataManager }) => {
    const keyword = `SRCH-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    searchKeyword = keyword;
    keywordIssueTitle = `e2e-${keyword}`;

    const issue = await githubAPI.createIssue(env.github.testRepo, {
      title: keywordIssueTitle,
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

When('I search the project by title for the unique keyword', async ({ page, projectFilterBar }) => {
  await projectFilterBar.open();
  await projectFilterBar.selectType('Title');
  await page.waitForURL(/filterQuery=title/);

  const input = (await projectFilterBar.filterInput.isVisible())
    ? projectFilterBar.filterInput
    : page.getByRole('combobox').first();
  await expect(input).toHaveValue('title:');

  await projectFilterBar.typeSearch(searchKeyword);
  await projectFilterBar.save();

  await page.waitForURL(new RegExp(searchKeyword));
  await page
    .getByRole('heading', { level: 2 })
    .first()
    .waitFor({ state: 'visible', timeout: 15000 });
});

Then('the issue with the keyword should be visible on the board', async ({ projectBoardPage }) => {
  await projectBoardPage.expectCardVisible(keywordIssueTitle);
});

Then(
  'the seeded issue without the keyword should not be visible',
  async ({ projectBoardPage, seededProjectIssue }) => {
    await projectBoardPage.expectCardNotVisible(seededProjectIssue.title);
  },
);
