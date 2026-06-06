import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../../src/fixtures';
import type { SeededIssue } from '../../src/utils/testing/issue-seeder';
import { seedAdditionalIssue } from '../../src/utils/testing/issue-seeder';
import { uniqueTestTitle } from '../../src/utils/testing/factories';

const { Given, When, Then } = createBdd(test);

When('I navigate to the table view', async ({ tableViewPage, scenarioId }) => {
  await tableViewPage.navigate(`"${scenarioId}"`);
});

Then(
  'I should see the table with columns {string}, {string}, and {string}',
  async ({ tableViewPage }, col1, col2, col3) => {
    await tableViewPage.expectColumnsVisible([col1, col2, col3]);
  },
);

Then(
  'the seeded issue should appear as a row in the table',
  async ({ tableViewPage, scenarioContext }) => {
    const seededIssue = scenarioContext.get<SeededIssue>('seededIssue');
    await tableViewPage.expectRowVisible(seededIssue.title);
  },
);

Given(
  'seeded table sort test issues exist with prefixes {string} and {string}',
  async (
    { githubAPI, projectsAPI, sandbox, dataManager, scenarioContext, scenarioId },
    prefixA,
    prefixZ,
  ) => {
    const sortTitleA = `${uniqueTestTitle(prefixA)} [${scenarioId}]`;
    const sortTitleZ = `${uniqueTestTitle(prefixZ)} [${scenarioId}]`;
    scenarioContext.set('sortTitleA', sortTitleA);
    scenarioContext.set('sortTitleZ', sortTitleZ);

    await seedAdditionalIssue(githubAPI, projectsAPI, sandbox, dataManager, {
      title: sortTitleA,
      body: 'Sort test issue',
    });

    await seedAdditionalIssue(githubAPI, projectsAPI, sandbox, dataManager, {
      title: sortTitleZ,
      body: 'Sort test issue',
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
    { githubAPI, projectsAPI, sandbox, dataManager, scenarioContext, scenarioId },
    issueId,
    statusName,
    labelName,
  ) => {
    const title = `${uniqueTestTitle(issueId)} [${scenarioId}]`;

    if (issueId === 'A') scenarioContext.set('issueATitle', title);
    else scenarioContext.set('issueBTitle', title);

    const issue = await seedAdditionalIssue(githubAPI, projectsAPI, sandbox, dataManager, {
      title,
      labels: [labelName],
      body: `Filter test issue ${issueId}`,
      status: statusName,
    });

    const optionId = sandbox.statusOptions.get(statusName);
    if (!optionId) {
      throw new Error(
        `Status "${statusName}" not found. Available: ${[...sandbox.statusOptions.keys()].join(', ')}`,
      );
    }
    await projectsAPI.moveItemToStatus(
      sandbox.projectId,
      issue.projectItemId,
      sandbox.statusFieldId,
      optionId,
    );
  },
);

Given(
  'issue {string} exists with status {string} and no label in the sandbox project',
  async (
    { githubAPI, projectsAPI, sandbox, dataManager, scenarioContext, scenarioId },
    issueId,
    statusName,
  ) => {
    const title = `${uniqueTestTitle(issueId)} [${scenarioId}]`;

    scenarioContext.set('issueBTitle', title);

    const issue = await seedAdditionalIssue(githubAPI, projectsAPI, sandbox, dataManager, {
      title,
      labels: [],
      body: `Filter test issue ${issueId}`,
      status: statusName,
    });

    const optionId = sandbox.statusOptions.get(statusName);
    if (!optionId) {
      throw new Error(
        `Status "${statusName}" not found. Available: ${[...sandbox.statusOptions.keys()].join(', ')}`,
      );
    }
    await projectsAPI.moveItemToStatus(
      sandbox.projectId,
      issue.projectItemId,
      sandbox.statusFieldId,
      optionId,
    );
  },
);

When(
  'I filter the table by label {string}',
  async ({ page, projectFilterBar, tableViewPage }, labelName) => {
    await projectFilterBar.open();
    await projectFilterBar.selectType('Label');

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
