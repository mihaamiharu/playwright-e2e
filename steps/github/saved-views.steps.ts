import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../../src/fixtures';

const { When, Then } = createBdd(test);

let currentViewName = '';

When('I create a new board view named {string}', async ({ page }, baseName: string) => {
  currentViewName = `${baseName} ${Date.now()}`;

  await page.getByRole('tab', { name: 'New view' }).click();
  await page.getByRole('menuitem', { name: 'Board' }).click();
  await page.waitForURL(/\/views\/\d+/);
  await page
    .getByRole('heading', { level: 2 })
    .first()
    .waitFor({ state: 'visible', timeout: 15000 });

  await page.getByRole('button', { name: /View options for/ }).click();
  await page.getByRole('menuitem', { name: 'Rename view' }).click();

  const dialog = page.getByRole('dialog', { name: 'Rename view' });
  await dialog.waitFor({ state: 'visible', timeout: 10000 });

  const textbox = dialog.getByRole('textbox', { name: 'View name' });
  await textbox.clear();
  await textbox.fill(currentViewName);

  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).not.toBeVisible();
});

When(
  'I filter the current view by {string} with value {string}',
  async ({ page }, _fieldName: string, value: string) => {
    await page.getByRole('combobox', { name: 'Filter' }).click();

    const statusFilter = page.getByRole('option', { name: /Status, Filter/ });
    await expect(statusFilter).toBeVisible();
    await statusFilter.click();

    await page.waitForURL(/filterQuery=status/);

    const filterValue = page.getByRole('option', { name: new RegExp(`${value}, Status`) });
    await expect(filterValue).toBeVisible();
    await filterValue.click();

    await page.waitForURL(new RegExp(`filterQuery=status%3A${value}`));
    await expect(filterValue).not.toBeVisible();
  },
);

Then(
  'the current view should show filter {string} with value {string}',
  async ({ page }, _fieldName: string, value: string) => {
    await expect(page).toHaveURL(new RegExp(`filterQuery=status%3A${value}`));
    await expect(page.getByRole('combobox', { name: 'Filter' })).toHaveValue(new RegExp(value));
  },
);

Then('the created view tab should be visible', async ({ page }) => {
  await expect(page).toHaveTitle(new RegExp(currentViewName));

  const tab = page.getByRole('tablist').getByRole('tab', { name: currentViewName });
  await expect(tab).toHaveAttribute('aria-selected', 'true', { timeout: 10000 });
});

Then('the current view tab should be named {string}', async ({ page }, viewName: string) => {
  await expect(page).toHaveTitle(new RegExp(viewName));

  const tab = page.getByRole('tablist').getByRole('tab', { name: viewName });
  await expect(tab).toHaveAttribute('aria-selected', 'true', { timeout: 10000 });
});

When('I reload the page', async ({ page }) => {
  await page.reload();
  await page
    .getByRole('heading', { level: 2 })
    .first()
    .waitFor({ state: 'visible', timeout: 15000 });
});

When('I switch to the {string} view', async ({ page }, viewName: string) => {
  await page.getByRole('tab', { name: viewName }).click();
  await page.waitForURL(/\/views\/\d+/);
  await page
    .getByRole('heading', { level: 2 })
    .first()
    .waitFor({ state: 'visible', timeout: 15000 });
});
