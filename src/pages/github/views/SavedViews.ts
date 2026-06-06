import { type Page, type Locator, expect } from '@playwright/test';
import { env } from '../../../config/env.config';

/**
 * Saved Views — create, rename, filter, and switch between project views.
 *
 * Encapsulates raw Playwright locators that were previously inlined
 * in saved-views.steps.ts. Centralizes view-management UI interactions
 * to improve test readability and reduce duplication.
 */
export class SavedViews {
  readonly tabList: Locator;

  constructor(public readonly page: Page) {
    this.tabList = page.getByRole('tablist');
  }

  private async waitForViewReady(): Promise<void> {
    await expect(this.tabList.getByRole('tab', { selected: true }).first()).toBeVisible({
      timeout: 10_000,
    });
  }

  async createBoardView(viewName: string): Promise<number> {
    await this.page.getByRole('tab', { name: 'New view' }).click();
    await this.page.getByRole('menuitem', { name: 'Board' }).click();
    await this.page.waitForURL(/\/views\/\d+/);
    const urlMatch = this.page.url().match(/\/views\/(\d+)/);
    const viewNumber = parseInt(urlMatch![1], 10);
    await this.waitForViewReady();
    await this.renameView(viewName);
    return viewNumber;
  }

  async renameView(viewName: string): Promise<void> {
    await this.page.getByRole('button', { name: /View options for/ }).click();
    await this.page.getByRole('menuitem', { name: 'Rename view' }).click();

    const dialog = this.page.getByRole('dialog', { name: 'Rename view' });
    await expect(dialog).toBeVisible();

    const textbox = dialog.getByRole('textbox', { name: 'View name' });
    await textbox.clear();
    await textbox.fill(viewName);

    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).not.toBeVisible();
  }

  async switchToView(viewName: string): Promise<void> {
    await this.page.getByRole('tab', { name: viewName }).click();
    await this.page.waitForURL(/\/views\/\d+/);
    await this.waitForViewReady();
  }

  async refreshView(): Promise<void> {
    await this.page.reload();
    await this.waitForViewReady();
  }

  async deleteView(viewName: string): Promise<void> {
    await this.page.getByRole('tab', { name: viewName }).click();
    await this.page.waitForURL(/\/views\/\d+/);
    await this.waitForViewReady();

    await this.page.getByRole('button', { name: /View options for/ }).click();
    await this.page.getByRole('menuitem', { name: 'Delete view' }).click();

    const dialog = this.page.getByRole('alertdialog', { name: 'Delete view?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Delete' }).click();
    await expect(dialog).not.toBeVisible();
  }

  async deleteViewByNumber(viewNumber: number): Promise<void> {
    await this.page.goto(
      `https://github.com/users/${env.github.testRepoOwner}/projects/${env.github.sandboxProjectNumber}/views/${viewNumber}`,
      { waitUntil: 'domcontentloaded', timeout: 15000 },
    );
    await this.waitForViewReady();

    const viewOptionsBtn = this.page.getByRole('button', { name: /View options for/ });
    await viewOptionsBtn.waitFor({ state: 'attached', timeout: 10000 });
    await viewOptionsBtn.evaluate((el) => (el as HTMLElement).click());

    await this.page.getByRole('menuitem', { name: 'Delete view' }).click();

    const dialog = this.page.getByRole('alertdialog', { name: 'Delete view?' });
    const confirmBtn = dialog.getByRole('button', { name: 'Delete' });
    await confirmBtn.waitFor({ state: 'visible', timeout: 5000 });
    await confirmBtn.click();

    await expect(dialog).not.toBeVisible({ timeout: 10000 });
  }

  async assertViewTabSelected(viewName: string): Promise<void> {
    await expect(this.page).toHaveTitle(new RegExp(viewName));
    const tab = this.tabList.getByRole('tab', { name: viewName });
    await expect(tab).toHaveAttribute('aria-selected', 'true');
  }

  async applyStatusFilter(value: string): Promise<void> {
    await this.page.getByRole('combobox', { name: 'Filter' }).click();

    const statusFilter = this.page.getByRole('option', { name: /Status, Filter/ });
    await expect(statusFilter).toBeVisible();
    await statusFilter.click();

    await this.page.waitForURL(/filterQuery=status/);

    const filterValue = this.page.getByRole('option', {
      name: new RegExp(`${value}, Status`),
    });
    await expect(filterValue).toBeVisible();
    await filterValue.click();

    await this.page.waitForURL(new RegExp(`filterQuery=status%3A${value}`));
    await expect(filterValue).not.toBeVisible();
  }

  async assertStatusFilterApplied(value: string): Promise<void> {
    await expect(this.page).toHaveURL(new RegExp(`filterQuery=status%3A${value}`));
    await expect(this.page.getByRole('combobox', { name: 'Filter' })).toHaveValue(
      new RegExp(value),
    );
  }
}
