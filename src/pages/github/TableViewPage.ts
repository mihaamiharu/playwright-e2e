import { Page, Locator, expect } from '@playwright/test';

/**
 * Page Object Model for GitHub Project Table View.
 */
export class TableViewPage {
  readonly viewButton: Locator;
  readonly tableButton: Locator;
  readonly grid: Locator;

  constructor(public readonly page: Page) {
    this.viewButton = page.getByRole('button', { name: 'View', exact: true });
    this.tableButton = page.getByRole('button', { name: 'Table' });
    this.grid = page.getByRole('grid');
  }

  async switchToTableLayout(): Promise<void> {
    await this.viewButton.click();
    await this.tableButton.click();
    await this.page.waitForURL(/layout=table/);
    await expect(this.grid).toBeVisible({ timeout: 15_000 });
    await this.page.keyboard.press('Escape');
    await expect(this.tableButton).not.toBeVisible();
  }

  getColumnHeader(name: string): Locator {
    return this.page.getByRole('columnheader', { name: new RegExp(`^${name}`) });
  }

  async expectColumnsVisible(columnNames: string[]): Promise<void> {
    for (const name of columnNames) {
      await expect(this.getColumnHeader(name)).toBeVisible();
    }
  }

  getRow(issueTitle: string): Locator {
    return this.page.getByRole('row').filter({ hasText: issueTitle });
  }

  async expectRowVisible(issueTitle: string): Promise<void> {
    await expect(this.getRow(issueTitle).first()).toBeVisible();
  }

  async expectRowNotVisible(issueTitle: string): Promise<void> {
    await expect(this.getRow(issueTitle).first()).not.toBeVisible();
  }

  async expectRowValue(issueTitle: string, value: string): Promise<void> {
    const row = this.getRow(issueTitle);
    await expect(row.getByText(value)).toBeVisible();
  }

  getColumnOptionsButton(columnName: string): Locator {
    return this.page.getByRole('button', { name: `${columnName} column options` });
  }

  async sortColumnAscending(columnName: string): Promise<void> {
    await this.getColumnOptionsButton(columnName).click();
    const menuitem = this.page.getByRole('menuitem', { name: 'Sort ascending' });
    await menuitem.click();
    await this.page.waitForURL(/sortedBy.*direction.*asc/);
    await expect(this.grid).toBeVisible();
    await expect(menuitem).not.toBeVisible();
  }

  async sortColumnDescending(columnName: string): Promise<void> {
    await this.getColumnOptionsButton(columnName).click();
    const menuitem = this.page.getByRole('menuitem', { name: 'Sort descending' });
    await menuitem.click();
    await this.page.waitForURL(/sortedBy.*direction.*desc/);
    await expect(this.grid).toBeVisible();
    await expect(menuitem).not.toBeVisible();
  }

  async getRowTitles(): Promise<string[]> {
    const titleLinks = this.page.getByRole('rowheader').getByRole('link');
    return titleLinks.allTextContents();
  }

  async expectRowBefore(firstTitle: string, secondTitle: string): Promise<void> {
    await expect(async () => {
      const titles = await this.getRowTitles();
      const firstIdx = titles.findIndex((t) => t.includes(firstTitle));
      const secondIdx = titles.findIndex((t) => t.includes(secondTitle));
      expect(firstIdx).not.toBe(-1);
      expect(secondIdx).not.toBe(-1);
      expect(firstIdx).toBeLessThan(secondIdx);
    }).toPass({ timeout: 15_000 });
  }
}
