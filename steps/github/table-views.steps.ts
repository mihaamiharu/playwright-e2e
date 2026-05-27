import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../../src/fixtures';
import { env } from '../../src/config/env.config';

const { Given, When, Then } = createBdd(test);

let sortTitleA = '';
let sortTitleZ = '';

let issueATitle = '';
let issueBTitle = '';

When('I switch to the table layout view', async ({ page }) => {
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page.getByRole('button', { name: 'Table' }).click();
  await page.waitForURL(/layout=table/);
  await expect(page.getByRole('grid')).toBeVisible({ timeout: 15000 });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
});

Then(
  'I should see the table with columns {string}, {string}, and {string}',
  async ({ page }, col1, col2, col3) => {
    await expect(page.getByRole('columnheader', { name: new RegExp(`^${col1}`) })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: new RegExp(`^${col2}`) })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: new RegExp(`^${col3}`) })).toBeVisible();
  },
);

Then(
  'the seeded issue should appear as a row in the table',
  async ({ page, seededProjectIssue }) => {
    const row = page.getByRole('row').filter({ hasText: seededProjectIssue.title });
    await expect(row.first()).toBeVisible();
  },
);

Given(
  'seeded table sort test issues exist with prefixes {string} and {string}',
  async ({ githubAPI, projectsAPI, sandbox, dataManager }, prefixA, prefixZ) => {
    const ts = Date.now();
    const randA = Math.random().toString(36).slice(2, 6);
    const randZ = Math.random().toString(36).slice(2, 6);

    sortTitleA = `${prefixA}-e2e-${ts}-${randA}`;
    sortTitleZ = `${prefixZ}-e2e-${ts}-${randZ}`;

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

When('I sort the table by the {string} column in ascending order', async ({ page }, columnName) => {
  await page.getByRole('button', { name: `${columnName} column options` }).click();
  await page.getByRole('menuitem', { name: 'Sort ascending' }).click();
  await page.waitForURL(/sortedBy.*direction.*asc/);
  await expect(page.getByRole('grid')).toBeVisible();
  await page.waitForTimeout(500);
});

When(
  'I sort the table by the {string} column in descending order',
  async ({ page }, columnName) => {
    await page.getByRole('button', { name: `${columnName} column options` }).click();
    await page.getByRole('menuitem', { name: 'Sort descending' }).click();
    await page.waitForURL(/sortedBy.*direction.*desc/);
    await expect(page.getByRole('grid')).toBeVisible();
    await page.waitForTimeout(500);
  },
);

Then(
  'the {string} issue should appear before the {string} issue in the table',
  async ({ page }, firstPrefix, secondPrefix) => {
    const titleLinks = page.getByRole('rowheader').getByRole('link');
    const titles = await titleLinks.allTextContents();

    const firstIdx = titles.findIndex((t) => t.includes(firstPrefix));
    const secondIdx = titles.findIndex((t) => t.includes(secondPrefix));

    expect(firstIdx).not.toBe(-1);
    expect(secondIdx).not.toBe(-1);
    expect(firstIdx).toBeLessThan(secondIdx);
  },
);

Given(
  'issue {string} exists with status {string} and label {string} in the sandbox project',
  async ({ githubAPI, projectsAPI, sandbox, dataManager }, issueId, statusName, labelName) => {
    const ts = Date.now();
    const rand = Math.random().toString(36).slice(2, 6);
    const title = `${issueId}-e2e-${ts}-${rand}`;

    if (issueId === 'A') issueATitle = title;
    else issueBTitle = title;

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
  async ({ githubAPI, projectsAPI, sandbox, dataManager }, issueId, statusName) => {
    const ts = Date.now();
    const rand = Math.random().toString(36).slice(2, 6);
    const title = `${issueId}-e2e-${ts}-${rand}`;

    issueBTitle = title;

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

When('I filter the table by label {string}', async ({ page }, labelName) => {
  await page.getByRole('combobox', { name: 'Filter' }).click();

  const labelFilter = page.getByRole('option', { name: 'Label, Filter, Filter by label' });
  await expect(labelFilter).toBeVisible();
  await labelFilter.click();

  const labelOption = page.getByRole('option', { name: `${labelName}, Label` });
  await expect(labelOption).toBeVisible();
  await labelOption.click();

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForURL(/filterQuery=label/);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await expect(page.getByRole('grid')).toBeVisible();
});

Then('issue {string} should be visible in the table', async ({ page }, issueId) => {
  const title = issueId === 'A' ? issueATitle : issueBTitle;
  const row = page.getByRole('row').filter({ hasText: title });
  await expect(row).toBeVisible();
});

Then('issue {string} should not be visible in the table', async ({ page }, issueId) => {
  const title = issueId === 'A' ? issueATitle : issueBTitle;
  const row = page.getByRole('row').filter({ hasText: title });
  await expect(row).not.toBeVisible();
});
