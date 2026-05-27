import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../../src/fixtures';
import { env } from '../../src/config/env.config';

const { Given, When, Then } = createBdd(test);

When('I switch to the table layout view', async ({ tableViewPage }) => {
  await tableViewPage.switchToTableLayout();
});

Then(
  'I should see the table with columns {string}, {string}, and {string}',
  async ({ tableViewPage }, col1, col2, col3) => {
    await tableViewPage.expectColumnsVisible([col1, col2, col3]);
  },
);

Then(
  'the seeded issue should appear as a row in the table',
  async ({ tableViewPage, seededProjectIssue }) => {
    await tableViewPage.expectRowVisible(seededProjectIssue.title);
  },
);

Given(
  'seeded table sort test issues exist with prefixes {string} and {string}',
  async ({ githubAPI, projectsAPI, sandbox, dataManager, scenarioContext }, prefixA, prefixZ) => {
    const ts = Date.now();
    const randA = Math.random().toString(36).slice(2, 6);
    const randZ = Math.random().toString(36).slice(2, 6);

    const sortTitleA = `${prefixA}-e2e-${ts}-${randA}`;
    const sortTitleZ = `${prefixZ}-e2e-${ts}-${randZ}`;
    scenarioContext.set('sortTitleA', sortTitleA);
    scenarioContext.set('sortTitleZ', sortTitleZ);

    const issueA = await githubAPI.createIssue(env.github.testRepo, {
      title: sortTitleA,
      body: 'Sort test issue',
    });
    const itemIdA = await projectsAPI.addIssueToProject(sandbox.projectId, issueA.node_id);
    dataManager.enqueue(async () => {
      await projectsAPI.removeItemFromProject(sandbox.projectId, itemIdA);
    });
    dataManager.enqueue(async () => {
      await githubAPI.closeIssue(env.github.testRepo, issueA.number);
    });

    const issueZ = await githubAPI.createIssue(env.github.testRepo, {
      title: sortTitleZ,
      body: 'Sort test issue',
    });
    const itemIdZ = await projectsAPI.addIssueToProject(sandbox.projectId, issueZ.node_id);
    dataManager.enqueue(async () => {
      await projectsAPI.removeItemFromProject(sandbox.projectId, itemIdZ);
    });
    dataManager.enqueue(async () => {
      await githubAPI.closeIssue(env.github.testRepo, issueZ.number);
    });
  },
);

When(
  'I sort the table by the {string} column in ascending order',
  async ({ tableViewPage }, columnName) => {
    await tableViewPage.sortColumnAscending(columnName);
  },
);

When(
  'I sort the table by the {string} column in descending order',
  async ({ tableViewPage }, columnName) => {
    await tableViewPage.sortColumnDescending(columnName);
  },
);

Then(
  'the {string} issue should appear before the {string} issue in the table',
  async ({ tableViewPage }, firstPrefix, secondPrefix) => {
    await tableViewPage.expectRowBefore(firstPrefix, secondPrefix);
  },
);

Given(
  'issue {string} exists with status {string} and label {string} in the sandbox project',
  async (
    { githubAPI, projectsAPI, sandbox, dataManager, scenarioContext },
    issueId,
    statusName,
    labelName,
  ) => {
    const ts = Date.now();
    const rand = Math.random().toString(36).slice(2, 6);
    const title = `${issueId}-e2e-${ts}-${rand}`;

    if (issueId === 'A') scenarioContext.set('issueATitle', title);
    else scenarioContext.set('issueBTitle', title);

    const issue = await githubAPI.createIssue(env.github.testRepo, {
      title,
      labels: [labelName],
      body: `Filter test issue ${issueId}`,
    });
    const itemId = await projectsAPI.addIssueToProject(sandbox.projectId, issue.node_id);

    const optionId = sandbox.statusOptions.get(statusName);
    if (!optionId) {
      throw new Error(
        `Status "${statusName}" not found. Available: ${[...sandbox.statusOptions.keys()].join(', ')}`,
      );
    }
    await projectsAPI.moveItemToStatus(sandbox.projectId, itemId, sandbox.statusFieldId, optionId);

    dataManager.enqueue(async () => {
      await projectsAPI.removeItemFromProject(sandbox.projectId, itemId);
    });
    dataManager.enqueue(async () => {
      await githubAPI.closeIssue(env.github.testRepo, issue.number);
    });
  },
);

Given(
  'issue {string} exists with status {string} and no label in the sandbox project',
  async (
    { githubAPI, projectsAPI, sandbox, dataManager, scenarioContext },
    issueId,
    statusName,
  ) => {
    const ts = Date.now();
    const rand = Math.random().toString(36).slice(2, 6);
    const title = `${issueId}-e2e-${ts}-${rand}`;

    scenarioContext.set('issueBTitle', title);

    const issue = await githubAPI.createIssue(env.github.testRepo, {
      title,
      labels: [],
      body: `Filter test issue ${issueId}`,
    });
    const itemId = await projectsAPI.addIssueToProject(sandbox.projectId, issue.node_id);

    const optionId = sandbox.statusOptions.get(statusName);
    if (!optionId) {
      throw new Error(
        `Status "${statusName}" not found. Available: ${[...sandbox.statusOptions.keys()].join(', ')}`,
      );
    }
    await projectsAPI.moveItemToStatus(sandbox.projectId, itemId, sandbox.statusFieldId, optionId);

    dataManager.enqueue(async () => {
      await projectsAPI.removeItemFromProject(sandbox.projectId, itemId);
    });
    dataManager.enqueue(async () => {
      await githubAPI.closeIssue(env.github.testRepo, issue.number);
    });
  },
);

When(
  'I filter the table by label {string}',
  async ({ page, projectFilterBar, tableViewPage }, labelName) => {
    await projectFilterBar.open();
    await projectFilterBar.selectType('Label');
    await page.waitForURL(/filterQuery=label/);

    await projectFilterBar.selectOption(labelName, 'Label');
    await projectFilterBar.save();
    await page.waitForURL(/filterQuery=label/);

    const option = page.getByRole('option', { name: `${labelName}, Label` });
    await projectFilterBar.close(option);
    await expect(tableViewPage.grid).toBeVisible();
  },
);

Then(
  'issue {string} should be visible in the table',
  async ({ tableViewPage, scenarioContext }, issueId) => {
    const title =
      issueId === 'A'
        ? scenarioContext.get<string>('issueATitle')
        : scenarioContext.get<string>('issueBTitle');
    await tableViewPage.expectRowVisible(title);
  },
);

Then(
  'issue {string} should not be visible in the table',
  async ({ tableViewPage, scenarioContext }, issueId) => {
    const title =
      issueId === 'A'
        ? scenarioContext.get<string>('issueATitle')
        : scenarioContext.get<string>('issueBTitle');
    await tableViewPage.expectRowNotVisible(title);
  },
);
