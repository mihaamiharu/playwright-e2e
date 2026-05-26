import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../../src/fixtures/github-project.fixture';
import { env } from '../../src/config/env.config';

const { When, Then } = createBdd(test);

let secondUnlabeledIssueTitle = '';

When('I add the label {string} via the UI', async ({ page }, label: string) => {
  const editButton = page.getByRole('button', { name: 'Edit Labels' });
  await editButton.click();

  const dialog = page.getByRole('dialog', { name: 'Apply labels to this issue' });
  await expect(dialog).toBeVisible();

  const option = dialog.getByRole('option', { name: label });
  await option.click();

  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});

When('I add the label {string} via the API', async ({ githubAPI, seededProjectIssue }, label: string) => {
  await githubAPI.addLabels(env.github.testRepo, seededProjectIssue.number, [label]);
});

When('I remove the label {string} via the UI', async ({ page }, label: string) => {
  const editButton = page.getByRole('button', { name: 'Edit Labels' });
  await editButton.click();

  const dialog = page.getByRole('dialog', { name: 'Apply labels to this issue' });
  await expect(dialog).toBeVisible();

  const option = dialog.getByRole('option', { name: label });
  await option.click();

  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});

Then('I should see the {string} label on the issue', async ({ page }, label: string) => {
  const sidebar = page.getByRole('heading', { name: 'Metadata' }).locator('..');
  await expect(sidebar.getByRole('link', { name: new RegExp(label) })).toBeVisible();
});

Then('I should not see the {string} label on the issue', async ({ page }, label: string) => {
  const sidebar = page.getByRole('heading', { name: 'Metadata' }).locator('..');
  await expect(sidebar.getByRole('link', { name: new RegExp(label) })).not.toBeVisible();
});

When('I seed a second unlabeled issue on the board', async ({ githubAPI, projectsAPI, sandbox, dataManager }) => {
  const uniqueId = `unlabeled-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const title = `e2e-${uniqueId}`;

  const issue = await githubAPI.createIssue(env.github.testRepo, {
    title,
    body: `Second issue for label filter test. Run: ${uniqueId}`,
  });

  const projectItemId = await projectsAPI.addIssueToProject(sandbox.projectId, issue.node_id);

  dataManager.enqueue(async () => {
    await projectsAPI.removeItemFromProject(sandbox.projectId, projectItemId);
  });
  dataManager.enqueue(async () => {
    await githubAPI.closeIssue(env.github.testRepo, issue.number);
  });

  secondUnlabeledIssueTitle = title;
});

When('I filter the board by the label {string}', async ({ page }, label: string) => {
  await page.getByRole('combobox', { name: 'Filter' }).click();

  const filterType = page.getByRole('option', { name: 'Label, Filter, Filter by label' });
  await expect(filterType).toBeVisible();
  await filterType.click();

  const labelOption = page.getByRole('option', { name: `${label}, Label` });
  await expect(labelOption).toBeVisible();
  await labelOption.click();

  await page.getByRole('button', { name: 'Save' }).click();
  await page.waitForURL(/filterQuery=label/);
  await page.getByRole('heading', { level: 2 }).first().waitFor({ state: 'visible', timeout: 15000 });
});

Then('the seeded issue should be visible on the board', async ({ page, seededProjectIssue }) => {
  const card = page.getByRole('button', { name: new RegExp(seededProjectIssue.title) });
  await expect(card.first()).toBeVisible();
});

Then('the second unlabeled issue should not be visible on the board', async ({ page }) => {
  const card = page.getByRole('button', { name: new RegExp(secondUnlabeledIssueTitle) });
  await expect(card.first()).not.toBeVisible();
});
